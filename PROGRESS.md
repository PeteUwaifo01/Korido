# PROGRESS

## Session 2 — 2026-08-08

**Verified inherited state**
- `npm install`, `npm run build`, offline Wise fixtures: all pass.
- **Wise live: serves USD→NGN, GHS and KES.** At $200 on 2026-08-08:
  NGN 1388.61, GHS 11.76, KES 129.35. The session-1 note that "Wise NGN may be
  unsupported/paused" does not apply right now.
- `.env.local` created from `.env.example` — **still placeholder values**,
  see "Blocked".

**Built**
- **Wise pay-in correction.** Session 1 pinned `payIn: "BANK_TRANSFER"` assuming
  card pay-in is always dearer. Live payloads disprove it: on USD→NGN that
  option is a US *wire* at $8.12 while DEBIT is $4.47 — we were overstating
  Wise's cost by ~45% and would have mis-ranked it against zero-fee providers.
  Now takes the cheapest enabled option among pay-ins a US consumer can
  actually use (business/European cards excluded, disabled BALANCE excluded),
  ties breaking to BANK_TRANSFER. Chosen method recorded in `pay_in` + `raw`.
- **CLAUDE.md rewritten** from scaffold boilerplate: funds perimeter, spec-first
  scoping, accuracy-as-compliance, $0 free-tier stack, secrets hygiene, and
  "update PROGRESS.md every session". `next dev` only upserts its managed block
  into AGENTS.md while AGENTS.md exists, so this content is safe.
- **Mid-market collector** — `GET /api/cron/collect-mid-rates`, Bearer
  `CRON_SECRET`, one row per active corridor per poll into `mid_rates`.
  `.github/workflows/collect-mid-rates.yml` on `*/15 * * * *`.
- **Three scraped adapters** — LemFi, Sendwave, Taptap Send, all live-verified
  across all three corridors.
- **Provider board at `/`** — corridor pills, amount box (default $200), rows
  sorted by receive amount with the best highlighted, savings-vs-worst line,
  per-row collection timestamps, 3h staleness guard, CTAs to
  `/go/{offerId}?from=/`. Server component on the anon key.
- `npm test` now runs all four suites (Wise, mid-rates, scraped adapters,
  board): **89 offline assertions, all passing.**

**Decisions**
- **FX source: ExchangeRate-API Open Access** (`open.er-api.com/v6/latest/USD`).
  Keyless, no signup. Terms checked 2026-08-08: free for personal *and*
  commercial conversion use, caching allowed, re-distributing the feed is not,
  and **visible attribution is required** — it is in the board footer, do not
  remove it. NGN/GHS/KES all verified present. Rejected: Frankfurter (ECB, no
  African currencies), exchangerate.host (now key-gated), fawazahmed0 (works,
  CC0, but also daily and a single-maintainer CDN project).
- **Adapter surfaces** — investigated each calculator's real network calls
  first; none needed HTML parsing, all three are backed by unauthenticated JSON:
  - Taptap: `GET api.taptapsend.com/api/fxRates` with the same
    `Appian-Version` / `X-Device-Id: web` headers their *own website* sends.
    Their `Appian-Secret` is null in production. One call covers every corridor.
  - LemFi: `POST lemfi.com/api/lemonade/v2/exchange` (their ConversionBox call).
  - Sendwave: `GET app.sendwave.com/v2/pricing-public`. Note `/v2/pricing`
    without the suffix is session-gated (401) — we use the public one and hold
    no session; a Sendwave login would sit on the funds perimeter.
  robots.txt on 2026-08-08: Taptap disallows nothing, LemFi and Sendwave serve
  none. All four adapters share one honest `KoridoBot` UA with contact details.
- **Sendwave: we publish the `base` price, not `effective`.** `effective` folds
  in a new-customer "Intro Rate Discount" (currently on US→KES). Showing a
  first-transfer promo as the standing rate would overstate them for returning
  users. `campaignsApplied` is kept in `raw` for a possible "intro offer" badge.
- **Taptap: absent `feeSchedule` means genuinely fee-free** for these corridors
  (their payout-fee endpoint carries no US→NG/GH/KE entries). An *unrecognised*
  schedule returns unavailable rather than $0.
- **Board state lives in the URL** (`/?c=US-NG&amount=200`), not client state —
  keeps it a server component, works without JS, and every view is shareable,
  which the §1 WhatsApp rate ticket needs anyway.
- **Fees are collected at $200** and recalculated as `fee_flat + fee_pct ×
  amount`. Away from $200 the board says plainly that figures are estimates.
  Per-amount collection is a possible follow-up if it proves to matter.

**Needs Peter's judgement**
1. **LemFi rate is scaled in transit.** The API returns e.g.
   `8.94486…e+23` for a rate of 1382; LemFi's own client divides it by the
   digits of the `ID` field in the same response, and we reproduce that. The
   divisor is public and ships in the same payload, so this reads a published
   price rather than defeating an access control — but it is a deliberate
   speed bump and our most fragile dependency. `decodeRate` is bounded by a
   plausibility band and returns "unavailable" rather than a wrong number if
   the transform changes. Durable fix is a direct partner relationship
   (week 3 of the plan anyway). **Say if you'd rather drop LemFi until then.**
2. **GitHub Actions minutes.** 15-min mid-rate polling is 96 runs/day ≈ **2,880
   billed minutes/month**, over the 2,000 free minutes on a **private** repo.
   Public repos get unmetered Actions. Either make the repo public, or drop the
   cadence — the FX source only publishes once a day, so hourly would lose
   nothing today. Quote collection adds ~960 min/month on top.
3. **Affiliate disclosure placement.** §7 asks for disclosure "adjacent to every
   outbound CTA". Currently: one visible statement directly above the row list
   (so it sits with the CTAs) plus the full footer statement, rather than a line
   repeated inside all seven cards. Worth confirming at attorney review.

**Blocked / waiting on Peter**
- **Supabase values.** `.env.local` exists but holds `.env.example`
  placeholders. Nothing DB-dependent has been run. Fill in
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` locally (do not paste them into chat), plus
  `CRON_SECRET` and `CLICK_HASH_SALT` (`openssl rand -hex 32` each).
- Supabase project creation + running `0001_init.sql` (SQL Editor).
- GitHub repo push, Vercel import, env vars, Actions secrets (`CRON_SECRET`,
  `APP_URL`).
- Task P1: final name/domain.

**Needs live verification once Supabase is up**
- Both cron endpoints end-to-end (auth guard, rows actually landing in `quotes`
  and `mid_rates`). Only their adapters have been exercised so far.
- The board with real rows — the no-data path is verified (renders 200 with
  "Rates temporarily unavailable"); the populated layout has only been checked
  against unit-tested data shaping.
- `/go/{offerId}` click logging against a real `clicks` table.
- Watch for drift on the scraped adapters: any provider can change payload
  shape without notice. Failures are visible as "temporarily unavailable" rows,
  never wrong numbers, but they should be investigated not ignored.
- The daily mid-rate is a *lagging* reference: on 2026-08-08 it read NGN 1364
  while Wise/LemFi/Taptap all quoted 1382–1389. Savings figures are computed
  provider-to-provider, never against the mid, so this affects only the
  displayed reference rate.

**Next steps**
1. Rate alerts (§6): double opt-in via Resend + threshold checker cron.
2. Corridor landing pages for SEO (§1) + WhatsApp rate ticket / OG images.
3. Privacy page, affiliate disclosure page, CAN-SPAM email footer (§7).
4. Weekly accuracy audit (§4): spot-check stored quotes vs live calculators.
5. Consider adding Remitly / WorldRemit / Xe adapters (seeded, no adapter yet —
   they simply never produce rows today).

---

## Session 1 — 2026-08-08

**Built**
- Next.js App Router scaffold (TS, Tailwind v4, src dir), git initialized. Production build passes.
- `supabase/migrations/0001_init.sql`: spec §3 DDL verbatim + pgcrypto, RLS on all tables (no anon policies on user-adjacent tables; public read on catalog/quotes), seeds for 3 corridors × 7 send providers.
- Wise adapter (`src/lib/adapters/wise.ts`) on the public unauthenticated `POST /v3/quotes` endpoint. Picks cheapest enabled bank-transfer pay-in; 422/unsupported routes return `unavailable` (no fake rates). 7 offline fixture tests pass (`scripts/test-wise-adapter.ts`; `--live` flag for real calls).
- Quote collector: `GET /api/cron/collect-quotes`, Bearer `CRON_SECRET`, $200 reference amount, inserts into `quotes`, skips unavailable corridors.
- `/go/[offerId]` redirect (spec §5): logs click with salted session hash (no raw IP), substitutes `{subid}` = click uuid, 302; falls back to provider homepage while `affiliate_url` is null; logging failure never blocks the redirect.
- Brand tokens in `globals.css` / layout (Bricolage Grotesque + Inter via runtime link, not next/font — build-time font fetch broke offline/CI builds).

**Decisions**
- Collection cadence via **GitHub Actions** (`.github/workflows/collect-quotes.yml`, every 30 min ≈ 7am–10:30pm ET) — Vercel Hobby crons are daily-only, too coarse for spec §4. Spec allowed either.
- Wise fee stored as `fee_flat` = observed total at reference amount, `fee_pct` = 0; full payload in `quotes.raw` for audit.
- Wise NGN may be unsupported/paused at any time — adapter treats it as "temporarily unavailable" per the staleness rule; verify with `--live` once deployed. *(Session 2: verified live, NGN is served.)*
