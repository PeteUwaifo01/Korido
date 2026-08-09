# Korido

Compare what money transfer providers **actually deliver** — US to Nigeria,
Ghana and Kenya.

Korido asks every provider for a live quote at the amount you type, then ranks
them by how much money reaches the recipient. Not by the headline exchange rate,
which routinely hides a fee that puts the best-looking option last.

Korido compares prices and refers you onward. **It never accepts, holds, or
transmits funds, and never asks for payment details.**

## Why rank on the amount received

A real example from the board, US→Nigeria at $200:

| Provider | Rate | Fee | They receive |
|---|---|---|---|
| Taptap Send | ₦1,378.00 | $0.00 | **₦275,600** |
| Wise | ₦1,388.61 | $4.47 | ₦271,515 |

Wise advertises the best rate on the page and delivers the least money. Sorting
by rate would recommend the worse option.

## Rules the code enforces

These are not style preferences; each exists because breaking it produced a
wrong number on a money page.

- **Never scale a quote from one amount to another.** Fees and rates move with
  the amount — Wise's fee grows, Sendwave's rate improves above $750, and Wise
  disables card funding entirely on larger sends. Extrapolating from a $200
  sample once ranked Wise *first* at $1,000 when it was actually *last*.
- **Prefer what the provider states over anything we compute.** Where a provider
  publishes the receive amount or a delivery estimate, that figure wins.
- **Never display a fact the provider didn't give us.** Delivery times come only
  from providers that state them per quote. A fixed label per provider was wrong
  by about two days on larger sends.
- **Hold the sender's spend constant.** Wise deducts its fee from the amount you
  send; Xoom and Sendwave add it on top. Comparing those unadjusted flatters the
  wrong provider.
- **Silence beats a guess.** Any parse failure, timeout or unknown fee model
  renders as "temporarily unavailable". Nothing is ever defaulted to zero, and
  quotes older than 3 hours are never shown as current.
- **A refusal is an answer.** Several providers are deliberately absent because
  their pricing sits behind a bot challenge, a login, or a `429`. We reproduce
  calls a provider's own public website makes, with an honest User-Agent. We do
  not defeat controls built to stop us. The board names who is missing and says
  one of them may beat our winner.

## Stack

Next.js App Router · Supabase Postgres (RLS on every user-adjacent table) ·
GitHub Actions for scheduled collection · no third-party requests from the
browser at all — fonts are self-hosted and no cookies are set.

## Running it

```bash
npm install
cp .env.example .env.local      # then fill in the Supabase values
npm run dev
```

Apply `supabase/migrations/*.sql` in order via the Supabase SQL editor, then:

```bash
npm run verify:supabase   # schema, keys, and that RLS actually blocks the anon key
npm test                  # 137 offline assertions across adapters, board and attribution
npm run affiliate --list  # affiliate link status per provider/corridor
```

Diagnostics that take real network calls:

```bash
npx tsx scripts/test-scraped-adapters.ts --live   # quote every provider for real
npx tsx scripts/amount-sweep.ts                   # measure error vs live quotes by amount
```

## Layout

```
src/lib/adapters/    one module per provider; anything unparseable → unavailable
src/lib/board.ts     ranking, staleness guard, receive-amount rules (pure, tested)
src/lib/live-quotes.ts   parallel live quoting with a short cache
src/app/go/          click logging + {subid} attribution, then 302 onward
supabase/migrations/ schema, seeds, and why providers were deactivated
```

`PROGRESS.md` carries the running decision log — what was built, what was
measured, and what was rejected, with reasons.
