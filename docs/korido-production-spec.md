# Korido — Production Spec & 90-Day Trial Plan

**Working title:** Korido (swap on final name/domain decision — Task P1)
**Frame:** $100 / 90-day option to validate community distribution. Ruthless v1 scope. Pre-agreed checkpoints and kill criteria. Peter's recurring time capped at ~2 hrs/week.

---

## 1. Scope

**v1 (ship in weeks 1–2):**
- Send (money transfer) comparison — US→Nigeria flagship, Ghana + Kenya included
- Amount-aware provider board with fees, rates, receive amounts, timestamps
- Rate alerts via email (target-rate threshold)
- WhatsApp-shareable rate ticket (share link + OG image per corridor)
- `/go/` redirect layer with click logging + SubID attribution
- Corridor landing pages for SEO ("cheapest way to send money to Nigeria", per corridor)
- Privacy page, affiliate disclosure, CAN-SPAM-compliant email footer

**v1.1 (weeks 4–6, only if trial signals are alive):**
- Top-up comparison tab (network-aware, bonus-promo tracking)
- Call comparison pages (content/SEO surface first, tab second)

**Explicitly out of scope for the trial:** direct top-up sales, user accounts, mobile apps, paid ads, WhatsApp Business API alerts, additional corridors.

---

## 2. Architecture

- **Frontend/app:** Next.js (App Router) on Vercel free tier. Design system from the v1.1 prototype (deep green / mango / paper tokens, Bricolage Grotesque + Inter).
- **Database:** Supabase Postgres (free tier). Row Level Security on all user-adjacent tables.
- **Jobs:** Vercel Cron (or GitHub Actions) for quote collection, staleness checks, alert dispatch.
- **Email:** Resend free tier (3k emails/mo) for alert delivery + confirmations.
- **Analytics:** first-party click/session logging in Postgres; no third-party ad trackers.

Monthly infra cost target: **$0** (domain is the only cash line).

---

## 3. Data model (DDL sketch)

```sql
-- Verticals and corridors are data, not code
create table verticals (
  id text primary key            -- 'send' | 'topup' | 'call'
);

create table corridors (
  id text primary key,           -- 'US-NG'
  source_country text not null,  -- 'US'
  dest_country text not null,    -- 'NG'
  dest_currency text not null,   -- 'NGN'
  dest_symbol text not null,
  active boolean default true
);

create table providers (
  id text primary key,           -- 'lemfi'
  name text not null,
  homepage text not null
);

-- A provider's participation in a vertical+corridor, incl. affiliate link
create table offers (
  id bigint generated always as identity primary key,
  provider_id text references providers(id),
  vertical_id text references verticals(id),
  corridor_id text references corridors(id),
  affiliate_url text,            -- network tracking link template ({subid})
  network text,                  -- 'impact' | 'flexoffers' | 'direct' | null
  speed_label text,
  active boolean default true,
  unique (provider_id, vertical_id, corridor_id)
);

-- Timestamped quotes — the compounding data asset
create table quotes (
  id bigint generated always as identity primary key,
  offer_id bigint references offers(id),
  collected_at timestamptz not null default now(),
  fx_rate numeric,               -- dest currency per USD
  fee_flat numeric,
  fee_pct numeric,
  bonus_pct numeric,             -- top-up promos
  raw jsonb                      -- adapter payload for audit
);
create index on quotes (offer_id, collected_at desc);

create table mid_rates (
  corridor_id text references corridors(id),
  collected_at timestamptz default now(),
  rate numeric not null,
  primary key (corridor_id, collected_at)
);

-- Attribution
create table clicks (
  id uuid primary key default gen_random_uuid(),
  offer_id bigint references offers(id),
  clicked_at timestamptz default now(),
  session_hash text,             -- salted hash, no raw IP retained
  landing_path text
);

create table conversions (
  id bigint generated always as identity primary key,
  click_id uuid references clicks(id),
  network text,
  reported_at timestamptz,
  payout_usd numeric,
  status text                    -- 'pending' | 'approved' | 'reversed'
);

-- Alerts (email pgcrypto-encrypted at column level)
create table alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  email_enc bytea not null,
  email_hash text unique not null,  -- dedupe/unsubscribe lookup
  created_at timestamptz default now(),
  confirmed_at timestamptz,          -- double opt-in
  unsubscribed_at timestamptz
);

create table alerts (
  id bigint generated always as identity primary key,
  subscriber_id uuid references alert_subscribers(id),
  corridor_id text references corridors(id),
  target_rate numeric not null,
  fired_at timestamptz,
  created_at timestamptz default now()
);
```

---

## 4. Quote pipeline

- **Adapters per provider:** one module per provider implementing `fetchQuote(corridor, amount) -> {fx_rate, fee_flat, fee_pct}`.
  - Wise: public API.
  - Others: scheduled scrape of public price calculators (respect robots/ToS posture; low frequency; identifiable UA).
- **Cadence:** every 30–60 min per corridor during US waking hours; mid-market rate every 15 min (open FX source).
- **Staleness guard:** UI shows "as of X min ago"; quotes older than 3h are hidden, provider row shows "temporarily unavailable" instead of stale numbers. *Accuracy is a compliance control, not a nicety.*
- **Accuracy audit:** weekly automated spot-check comparing stored quotes vs live calculator values; alert on drift.

## 5. Redirect & attribution

- `GET /go/{offerId}` → insert into `clicks` → 302 to `affiliate_url` with `{subid}=click uuid`.
- Weekly reconciliation job: pull network conversion reports (CSV/API), join on SubID → `conversions`.
- Dashboard (internal page): clicks, conversions, EPC by provider/corridor/page.

## 6. Alerts

- Double opt-in (confirm email) → threshold checker cron compares `alerts` vs latest `mid_rates` → send via Resend, mark `fired_at`.
- Every email: unsubscribe link (one click, no login), physical mailing address, sender identity. CAN-SPAM compliant by construction.

---

## 7. Compliance & security checklist (build requirements)

- [ ] **Perimeter rule in code review:** no feature may accept, hold, or transmit funds, or collect payment credentials. Any provider-API transfer initiation requires legal review *before* build.
- [ ] Affiliate disclosure adjacent to every outbound CTA + footer statement.
- [ ] Privacy page: plain language; data collected = email (encrypted) + target rate + anonymized clicks; delete-on-request mailbox.
- [ ] No third-party ad trackers.
- [ ] TLS everywhere (Vercel default); Supabase at-rest encryption; pgcrypto for email column.
- [ ] RLS policies on `alert_subscribers`, `alerts`.
- [ ] Secrets in Vercel/Supabase env vaults; none in repo.
- [ ] MFA on: domain registrar, Vercel, Supabase, GitHub, affiliate networks, Resend.
- [ ] Session identifiers salted-hashed; raw IPs not retained.
- [ ] Nightly DB backup (Supabase) + weekly export to private storage.
- [ ] One-page incident response note (who rotates what, in what order).
- [ ] Attorney review of Privacy/ToS once first commissions clear (~$300 budget line, post-trial).

---

## 8. 90-day plan

**Weeks 1–2 — Build & deploy.**
Repo, schema, adapters (Wise + 3 scraped), redirect layer, alerts, landing pages, ticket OG images. Deploy to production domain.

**Week 3 — Accounts & applications.**
Affiliate applications with live site: Impact, FlexOffers, CJ; direct outreach to LemFi / Sendwave / Taptap Send partner contacts. Search Console + sitemap submission.

**Weeks 3–4 — Seeding round 1.**
Peter forwards the rate ticket + link to 5+ community groups (staggered, not spammed). Alert signup is the ask ("get pinged when the rate spikes").

**Weeks 5–12 — Operate & observe.**
Weekly: reconciliation, accuracy audit, one SEO content page per week (agent-drafted, Peter-reviewed), seeding round 2 via early users ("forward this ticket").

**Checkpoints:**
- **Day 30:** site stable, ≥3 affiliate approvals, first 100 visitors, alert signups > 0.
- **Day 60:** return-visitor share ≥10%, ticket share clicks ≥3% of sessions, first tracked conversions (any).
- **Day 90 (decision):** CONTINUE if ≥500 uniques/mo trending up, ≥15% returning, ≥50 alert subscribers, ≥1 approved commission, and organic ticket forwards observed. KILL if traffic is flat after two seeding rounds, share clicks <2%, and 200+ outbound clicks have produced zero conversions. Kill = archive, keep machinery, redirect effort — no renegotiation with sunk cost.

---

## 9. Division of labor

**Claude:** all code, schema, adapters, landing/SEO copy drafts, email templates, dashboard, weekly ops checklists.
**Peter:** name + domain (Task P1), account creation (GitHub, Vercel, Supabase, Resend), affiliate applications (identity/tax info), review + deploy approvals, community seeding, 2 hrs/week cap.

**Budget:** domain ~$12–20/yr · infra $0 · email $0 · misc buffer ~$50 · **total ≤ $100** (attorney line deferred until revenue exists).

---

## 10. Transformation triggers (post-trial options, evidence-gated)

1. **List → launchpad:** ≥1,000 alert subscribers → announce talent-matching beta to the list.
2. **Data → product:** 6+ months of quotes → historical rate content/API offering.
3. **Volume → direct deals:** ≥50 conversions/mo with any provider → negotiate direct CPA above network rate.
4. **Traffic → margin:** sustained traffic + revenue → evaluate direct top-up sales (Reloadly) with fraud controls, limits, and tax review.
