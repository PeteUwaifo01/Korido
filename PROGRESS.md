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

**Free-tier stack audit — every service checked 2026-08-08, don't re-open**
Checked each one for a *terms* problem (can't be fixed by being frugal) versus a
*capacity* problem (manageable, and far off):

| Service | Commercial on free tier? | Binding limit | Our actual need | Next tier |
|---|---|---|---|---|
| Supabase | **Yes** — no restriction in the ToS or pricing page | 500 MB DB; free projects pause after 7 days of **database inactivity** | ~150 MB/yr (see below); collectors write every 15 min so it never idles | Pro $25/mo = $300/yr |
| Resend | **Yes** — free tier is meant for production | **100 emails/day**, not the 3,000/mo — this is the real cap | Day-90 target is ≥50 subscribers; one rate spike could exceed 100/day | Pro $20/mo = $240/yr |
| GitHub | Yes | 2,000 Actions min/mo on **private** repos | ~3,840 min/mo at current cadence | public repo = unmetered |
| Cloudflare Workers | Yes | 10 ms CPU per request | one small SSR page | $5/mo = $60/yr |
| Vercel Hobby | **No — prohibited** | n/a | n/a | Pro $240/yr |
| Netlify Free | Yes | 15 credits per deploy of 300/mo | ~20 deploys/mo, then all sites pause | Personal $108/yr |

**Supabase storage math:** 4 adapters × 3 corridors = 12 quote rows per round,
~32 rounds/day ≈ 384 rows/day ≈ 140k rows/yr. The `raw` jsonb audit payload
dominates at roughly 1 KB/row → **~150 MB/year**, so ~3 years inside 500 MB.
That clears the 90-day trial and §10's "6+ months of quotes" trigger. If it ever
tightens, drop `raw` for rows past a retention window — its audit value decays.

**Resend's daily cap is a design constraint, not just a number.** The §6 alert
dispatcher must batch and carry over across days rather than firing every
matching alert at once, or a rate spike silently drops mail past #100.

**Hosting — researched to a conclusion 2026-08-08, don't re-open**
The spec's "Vercel free tier, $0/month" assumption does not survive their terms.
Full comparison, so this is settled once:

| Host | Commercial use | Free-tier reality | Next tier |
|---|---|---|---|
| Vercel Hobby | **Prohibited** — their fair-use policy names "affiliate linking is the primary purpose of the site" as commercial | n/a | Pro $20/mo = **$240/yr**, over budget |
| Netlify Free | Allowed | 300 credits/mo; **15 per production deploy** (~20 deploys), 20/GB bandwidth. Hard limit, no top-up; exhausting it **pauses every site on the account** | Personal $9/mo = **$108/yr**, over budget |
| Cloudflare Workers Free | Allowed | Deploys unmetered, 100k req/day, unlimited bandwidth. Needs `@opennextjs/cloudflare` (supports Next.js 16). Risk: 10ms CPU/request on SSR | Paid $5/mo = **$60/yr**, fits budget |

Recommendation: **Cloudflare Workers.** Traffic at trial scale is negligible on
any of them — the deciding factor is that Netlify meters *deploys*, which is
what we actually consume during build-out, and its penalty is the live site
going dark. Peter already holds a Netlify account; it stays as a fallback.

Nothing in `src/` is host-specific: no `@vercel/*` dependency, `maxDuration` is
standard Next.js, `x-forwarded-for` is set by every mainstream host, and the
cron runs on GitHub Actions calling a URL. Switching hosts is configuration.
All Vercel references have been removed from the code and comments.

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
   *(Only the repo's public/private setting needs deciding — Peter owns the
   korido.app domain and its mailboxes, so `hello@korido.app` is live and Task
   P1's name/domain question is effectively settled.)*
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

**Verified end-to-end against the live Supabase project — 2026-08-08 23:55 UTC**
Supabase is created, `0001_init.sql` applied, `.env.local` populated. Run
`npm run verify:supabase` to re-check setup at any time (17 assertions).

- Schema: all 9 tables present, seeds correct (3 corridors, 7 providers,
  21 offers).
- **RLS confirmed working**: the public key reads the catalog but returns zero
  rows from `clicks`, `alert_subscribers`, `alerts` and `conversions`, and is
  refused when it tries to write to `mid_rates`.
- Cron auth guard: unauthenticated request → 401.
- `/api/cron/collect-mid-rates` → 3 rows stored.
- `/api/cron/collect-quotes` → **12/12 adapter×corridor quotes collected and
  stored**, no failures.
- Board renders live figures. US→NG at $200: Taptap ₦275,600 (best), Sendwave
  ₦275,211, LemFi ₦275,200, Wise ₦271,515; Remitly/WorldRemit/Xe correctly show
  "temporarily unavailable" (no adapters). Savings line, timestamps, corridor
  switch and amount change all correct.
- `/go/7?from=/` → 302 to the provider, one `clicks` row with a 64-char salted
  hash and `landing_path=/`. No raw IP stored.

**Worth noting from the live board:** Wise posts the *best headline rate* on
US→NG (1388.61 vs Taptap's 1378) but finishes last on what actually arrives,
because of its $4.47 fee. That is the whole argument for ranking on receive
amount rather than rate — and it is exactly what the session-1 pay-in bug would
have got wrong, since it would have shown Wise's fee as $8.12.

**Ranking inversion found and fixed — the board no longer extrapolates.**
Peter asked why we estimate fees when the providers do not.
`scripts/amount-sweep.ts` measured it on USD→NGN: Wise's fee scales ($4.47 at
$200 → $32.48 at $5,000) and Sendwave's *rate* improves above $750
(1376.06 → 1378.10). LemFi and Taptap are genuinely flat.

The consequence was worse than the percentages. At $1,000 the extrapolated board
ranked **Wise first** at ₦1,382,403 when it actually delivers ₦1,371,697 and
finishes **last** — we would have badged the worst provider "BEST RATE" and sent
the user there. On a money page that is the failure that ends the product.

Fix: `src/lib/live-quotes.ts`. The default $200 view still serves from stored
quotes (instant, cached, survives provider outages). **Any other amount is
quoted live from all four providers in parallel** for that exact amount, so
nothing on the page is ever scaled from a different one. Verified live: at
$1,000 the board now reads Sendwave ₦1,378,104 (best) → Taptap → LemFi → Wise
₦1,371,697 with its true $12.18 fee, matching the sweep exactly. Rendered in
0.85s. A provider that errors or times out (8s ceiling) is simply absent and
shows "temporarily unavailable" — it never falls back to the stored figure,
which is the number we know to be wrong. 12 tests in
`scripts/test-live-quotes.ts` pin that behaviour.

**Still needs live verification**
- Watch for drift on the scraped adapters: any provider can change payload
  shape without notice. Failures are visible as "temporarily unavailable" rows,
  never wrong numbers, but they should be investigated not ignored.
- The daily mid-rate is a *lagging* reference: on 2026-08-08 it read NGN 1364
  while Wise/LemFi/Taptap all quoted 1382–1389. Savings figures are computed
  provider-to-provider, never against the mid, so this affects only the
  displayed reference rate.

**Second sweep: what else was assumed rather than reported?**
Peter followed up — "when we are comparing rates, why are we assuming, aren't
the providers listing this?" Audited every figure on the board. Three were ours,
not theirs:

1. **Delivery speed was fabricated.** `offers.speed_label` was seeded with
   literal strings ("Minutes", "Minutes–hrs", "Hours") invented in the
   migration. Wise publishes a real per-quote estimate that moves with amount
   and pay-in method: **"in 30 minutes" at $200, "by Mon" at $1,000** — our
   fixed "Minutes–hrs" was wrong by about two days on larger sends. The board
   now shows only the provider's own wording, and nothing at all for LemFi,
   Sendwave and Taptap, which publish none. `speed_label` stays in the schema
   (spec §3) but is no longer rendered.
2. **Receive amount was computed when Wise and Sendwave state it.** Wise gives
   `targetAmount`, Sendwave `receiveAmount`. Our arithmetic agreed to 0.0002
   naira, but theirs is authoritative, so we now publish theirs and compute only
   for LemFi and Taptap, which state nothing. Caveat handled: Sendwave's stated
   figure is promo-inclusive, so it is used only when `campaignsApplied` is
   empty — otherwise we fall back to computing from the base price, keeping our
   "no new-customer promo as the standing rate" rule intact.
3. **The mid-market rate implied a freshness it doesn't have.** It read
   "Mid-market rate · just now" because `collected_at` is *our poll time*, while
   the source publishes once a day. Visible symptom: ₦1,364 shown as current
   while all four providers quoted 1376–1389 — a mid below every retail rate is
   implausible. Now labelled "Mid-market reference · ExchangeRate-API, published
   daily", with no relative timestamp.

Also learned from the sweep: **Wise's available pay-in methods change with
amount.** At $200 DEBIT is enabled ($4.47); at $1,000 every card option is
disabled ("we can't support card payments for this currency route") leaving only
BANK_TRANSFER at $12.18. The adapter already picks the cheapest *enabled*
consumer option, so it handles this — but it is another reason quoting live per
amount was the right call.

**The disclaimer was the tell — board is now live at every amount**
Peter, reading the page: *"why would I use this app if this is the case?"* —
pointing at "Collected automatically at $200… confirm the final figure on their
own page before you send." He was right. If a comparison site tells you to go
and re-check all four providers, it has saved you nothing; the disclaimer was
admitting the numbers were up to 3h old.

Fixed at the cause rather than the wording. The board now quotes every provider
live at **every** amount, including the $200 default. Cron collection continues,
but its job is the historical archive (§3, §10 trigger #2) and fallback — not
the default display.

- Load time: **1.0s cold, 0.48s warm** (60s cache in live-quotes.ts).
- Fallback is narrow and honest: if a provider does not answer, we use its last
  collected quote **only at $200**, the amount it was collected at, and the row
  shows its real age. At any other amount an unanswered provider stays
  "temporarily unavailable" — a stored figure there is from a different send
  size, which is the wrong number.
- Copy now states what the page did rather than apologising for it, and the
  footer says what the site is for: live quotes, ranked by what actually lands,
  provider-stated figures preferred, silence where they publish nothing.

**Remitly, WorldRemit and Xe removed — cannot be priced with integrity**
Peter: *"If they don't provide adapters, if you're going to build the adapters,
why did you not do it? ... If we cannot truly reach out, then remove them."*
Investigated all three on 2026-08-09. Each fails differently, and none can be
solved without misrepresenting who we are:

- **Remitly** — `api.remitly.io/v3/calculator/estimate` is real and public, but
  returns **429 NOT_ALLOWED** to unrecognised clients after a few requests.
  That is their server refusing us. Probing stopped immediately.
- **WorldRemit** — the calculator is behind a **PerimeterX bot check** ("Click
  and hold to help us verify you"). An access control, not a public price list.
- **Xe** — no public transfer-pricing surface. Their open converter is the
  **mid-market** rate, not Xe's offer (which carries their margin), so
  publishing it as Xe's price would be inventing a number. `robots.txt` also
  disallows `/currencytransfers/`.

`0002_deactivate_unreachable_offers.sql` sets `offers.active = false` for the
three (applied to the live DB; 12 active offers remain, 9 inactive).
Deactivated, not deleted — `active` is the reversible switch, and spec §8 week 3
already includes direct outreach to provider partner contacts. If any grants
access, flip the flag and write the adapter.

**Removing them created a second honesty problem, also fixed.** The tagline
said "Every way to send money home — compared" while showing four providers.
Every figure would have been true and the reader would still have walked away
believing something false. The header now reads "Live prices from the providers
we can verify", and the footer carries a "What we don't cover" note naming the
three and why. Naming the boundary is worth more than hiding it.

**Candidate sweep for more send providers — 2026-08-09**
Peter: *"there must be others we can add, how about rebtel?"* Swept ten
candidates for a publicly readable price surface, checking robots.txt and
fingerprinting bot-protection (PerimeterX / DataDome / Cloudflare challenge /
Akamai / reCAPTCHA / Imperva) before probing anything.

| Provider | Verdict |
|---|---|
| **Xoom** (PayPal) | **Best candidate.** No bot guard. Guest calculator API at `xoom.com/wapi/guest-app`, with a CSRF token handed to every anonymous visitor in the page HTML. One judgement call — see below. |
| **Ria** | **Promising.** No bot guard. The corridor page embeds a quote object, but the SSR copy is a placeholder (`exchangeRate: 18.7994` for NGN, `amountTo: 0`, `feeKnown: false`) — obviously not a real price, so the live endpoint still needs finding. Must never publish that placeholder. |
| Chipper Cash, Grey, Paysend | No guard detected, app-first products; need deeper investigation. |
| Afriex | reCAPTCHA present on the page. |
| **Western Union** | Akamai bot protection. No. |
| **MoneyGram** | robots.txt **disallows everything**, plus Cloudflare challenge + reCAPTCHA. No. |
| **Nala** | robots.txt **disallows everything**. No. |
| **Rebtel** | Not a remittance provider at all — international calling plus mobile recharge. Belongs to the top-up vertical, not send. |

**Xoom judgement call, for Peter.** Their guest API needs a CSRF token, which
means fetching the page first and reusing the token it gives every anonymous
visitor. That is reproducing the public guest flow, not defeating a control —
the same side of the line as Taptap's `X-Device-Id: web` headers. But it is more
session-like than anything we do today, so it is named here rather than buried,
exactly as LemFi's encoded rate was.

**Xoom added (5th provider); Ria refused. Plus a fee-model bug found and fixed.**

- **Xoom (PayPal) is live** — `src/lib/adapters/xoom.ts`. Its public corridor
  pages hand every anonymous visitor a CSRF token; `POST
  /wapi/guest-app/remittance` then returns real pricing. No login, no bot
  challenge. The first attempt got a 406; adding **truthful** `Origin`/`Referer`
  (we really had just loaded that page) fixed it, with our own UA throughout —
  no browser impersonation. Verified live on NG/GH/KE via ACH at $0 fee.
  Xoom currently ranks last on US→NG at ₦270,848, which is exactly why adding
  it matters. 13 fixture tests. `0003_add_xoom.sql`, applied.
  *Cost note:* Xoom needs two round trips (page for the token, then the quote),
  so a cache miss takes ~2s. The 60s live-quote cache absorbs it; caching the
  token per corridor would remove it if that ever matters.
- **Ria refused.** `public.riamoneytransfer.com` resets the TCP connection on
  every request from a non-browser client — three attempts, curl and Node
  alike, while their marketing site loads fine. That is a WAF dropping us at
  the network layer, so Ria joins Remitly, WorldRemit and Xe.
- **Fee-model bug, found while building Xoom.** Providers split into two camps:
  Wise **deducts** its fee from what you send, while Xoom and Sendwave **add**
  it on top (Sendwave shows `payAmount 200.49` on a $200 send with a $0.49
  fee). So an added-fee provider's *stated* receive figure describes a spend of
  amount + fee — publishing it against Wise would compare a bigger budget with
  a smaller one and flatter the wrong provider. Adapters now withhold the
  stated figure whenever the fee is non-zero under the added model, and the
  board computes `(amount − fee) × rate`, which holds the spend at exactly what
  the user typed. Fixed in both `sendwave.ts` and the new `xoom.ts`.

**§7 pages written — the last thing blocking a public launch**
`/privacy`, `/affiliate-disclosure`, `/terms`, linked from the board footer and
from each other. Plain language, and every claim checked against what the code
actually does rather than copied from a template.

Writing them turned up a claim that would have been false. The layout pulled
fonts from `fonts.googleapis.com`, so **every visitor handed their IP to Google**
before doing anything. Both faces are SIL Open Font License, so they are now
self-hosted from `/public/fonts` (latin subset, 7 files, ~400KB). Verified: the
served page references **no external host at all**, and sets **no cookies** —
both now stated on the privacy page as facts a reader can check.

Two things on those pages that must be updated in the same commit as the
feature they describe, or they become lies:
- **Privacy** does not claim to collect email addresses, because alerts (§6) do
  not exist yet. Add that section when alerts ship.
- **Affiliate disclosure** says we have *no* commission arrangements and that
  every button goes straight to the provider untracked. True today. Update it
  the moment `npm run affiliate` sets a real `affiliate_url`.

Still needed before launch: a physical mailing address for the CAN-SPAM email
footer (§6), which only Peter can supply, and the attorney review of
Privacy/ToS that §7 already defers to post-trial (~$300, once commissions
clear). These pages are written to be handed to that attorney as a starting
point, not to replace them.

**Next steps**
1. Rate alerts (§6): double opt-in via Resend + threshold checker cron.
   Remember Resend's cap is **100 emails/day**, so the dispatcher must batch.
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
