@AGENTS.md

# Korido — working rules

Korido is a **remittance rate-comparison site** for US→Nigeria / Ghana / Kenya.
It compares prices and refers people to providers. That is the whole product.

---

## 1. The funds perimeter — hard rule, enforced in every review

**No feature may ever accept, hold, or transmit funds, or collect payment
credentials.** Comparison, referral, and information only.

That means, concretely — never build:

- checkout, card, or bank-account entry of any kind
- wallet, balance, escrow, ledger, or stored value
- calls to a provider API that *initiate* a transfer, KYC flow, or payout
- anything that takes a recipient's account details "to pass along"
- price-lock, guaranteed-rate, or "reserve this rate" mechanics

Provider APIs are read-only price sources. The only money-shaped thing we own
is an affiliate click (`/go/{offerId}`), which hands the user to the provider
and ends our involvement.

If a task appears to require crossing this line — **stop and ask Peter.**
Do not build a "just for now" version. Spec §7 requires legal review *before*
any transfer-initiation build, not after.

---

## 2. Spec first

`docs/korido-production-spec.md` is the source of truth. We build **v1 exactly
as scoped in its §1** — nothing outside it.

- Read the relevant spec section before writing code for it.
- Out of scope for the trial (§1): direct top-up sales, user accounts, mobile
  apps, paid ads, WhatsApp Business API alerts, additional corridors.
- Top-up and call verticals are v1.1, **gated on trial signals**. The schema
  and the `korido.jsx` prototype both anticipate them; that is not permission
  to build them.
- Want to add something the spec doesn't list? Ask, don't scope-creep.

---

## 3. Accuracy is a compliance control, not a nicety

A wrong rate on a money page is a consumer-harm problem, not a cosmetic bug.

- **Never display a guessed, interpolated, or defaulted rate.** A parse
  failure, HTTP error, or unsupported corridor returns `available: false` and
  the row shows "temporarily unavailable".
- **Staleness guard (§4):** no quote fresher than 3h → do not render numbers.
  Stale data must never be presented as fresh.
- Always show a collection timestamp next to numbers.
- Store the provider payload in `quotes.raw` so any displayed figure is
  auditable back to what the provider actually said.
- Adapters model what a **US consumer** can actually get — not the cheapest
  line item in a payload they could never use.
- **Prefer what the provider states over anything we derive.** Wise publishes
  `targetAmount` and a delivery estimate; Sendwave publishes `receiveAmount`.
  Where a provider states a figure, show theirs — if our arithmetic ever
  disagrees, they are right by definition. Compute only where nothing is
  published (LemFi, Taptap).
- **Never display a fact the provider did not give us.** The seeded
  `offers.speed_label` values ("Minutes", "Hours") were invented and are no
  longer rendered: Wise's real estimate is "in 30 minutes" at $200 but "by Mon"
  at $1,000, so a fixed per-provider label is wrong by ~2 days at larger
  amounts. If a provider publishes no delivery time, show none.
- **The board quotes every provider live, at every amount.** A comparison that
  tells people to go and re-check each provider has saved them nothing. Cron
  collection still runs, but it builds the historical archive (§3, §10) and
  serves as a fallback — it is not what the page shows by default.
- **Never scale a quote from one amount to another.** Fees and rates move with
  amount: Wise's fee grows with the send, Sendwave's rate improves above $750,
  and Wise's card pay-in is disabled entirely above ~$200. Extrapolating from
  the $200 collection once ranked Wise *first* at $1,000 when it was actually
  *last*. A collected quote may only ever back-fill a row **at the same amount
  it was collected at**; at any other amount an unanswered provider is
  "temporarily unavailable".

---

## 4. Stack — free tier only, $0/month

| Layer | Choice | Constraint |
|---|---|---|
| App | Next.js App Router | host must permit **commercial use** on its free tier — see below |
| DB | Supabase Postgres | free tier, RLS on all user-adjacent tables |
| Email | Resend | free tier, 3k/mo |
| Cron | **GitHub Actions** | host-independent by design — it just calls a URL |
| Analytics | first-party, in Postgres | no third-party ad trackers |

**Hosting is constrained, and the obvious answers are wrong.** Korido is an
affiliate site, which makes it *commercial* under most free-tier terms:

- **Vercel Hobby is prohibited** — their fair-use policy names "affiliate
  linking is the primary purpose of the site" as commercial usage. Pro is
  $240/yr, more than twice the entire trial budget.
- **Netlify Free** allows commercial use but bills 15 credits per production
  deploy against 300/month (~20 deploys), is a hard limit, and **pauses every
  site on the account** when exhausted.
- **Cloudflare Workers Free** allows commercial use, does not meter deploys,
  and gives 100k requests/day. Needs `@opennextjs/cloudflare`.

Keep the app host-agnostic: no host-specific SDKs, no platform-only APIs.
Today nothing in `src/` depends on a particular host.

Infra cost target is **$0** (domain is the only cash line). Do not introduce a
service, plan, or paid tier without asking. **Do not add npm dependencies
without asking** — every dependency is a supply-chain and bundle-size decision.

Scraped adapters: low frequency, honest `KoridoBot` User-Agent with contact
info, and respect for each site's robots/ToS posture.

---

## 5. Secrets

- Real values live **only** in `.env.local` (git-ignored), the Vercel env
  vault, and GitHub Actions secrets.
- `.env.example` holds placeholder shapes only — never a real key.
- Never commit, echo into a log, or paste a key into a commit message or docs.
- Never invent Supabase values to unblock yourself. If `.env.local` is missing
  values, ask Peter.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS: server routes only, behind
  `import "server-only"`. The browser gets the anon key and nothing else.
- Cron endpoints are guarded by `Authorization: Bearer ${CRON_SECRET}`.
- Session identifiers are salted-hashed; raw IPs are never stored (§7).

---

## 6. Session hygiene

- **Update `PROGRESS.md` at the end of every session** — what was built, what
  was decided and why, what is blocked on Peter, what is queued next. It is
  how the next session inherits context.
- Run `npm run build` and the `scripts/test-*.ts` suites before every commit.
- One commit per milestone.
- **Do not push, deploy, or run migrations without asking.** Peter owns
  accounts, deploys, and approvals (§9); his time is capped at ~2 hrs/week, so
  bring him decisions, not questions with obvious answers.
- Design tokens come from `docs/korido.jsx` (ink/paper/mango/leaf/line;
  Bricolage Grotesque + Inter; mobile-first ~380px), wired into
  `src/app/globals.css`. Match the prototype's structure.
- Attribution obligations are real: mid-market rates come from
  ExchangeRate-API's open endpoint, which requires visible attribution.
  Affiliate disclosure sits adjacent to every outbound CTA (§7).
