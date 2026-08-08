# Korido

Free remittance rate comparison — every way to send money home, compared.
90-day trial build. Source of truth: `korido-production-spec.md` (project docs).

**Perimeter rule:** no feature may ever accept, hold, or transmit funds, or
collect payment credentials. Enforced in code review (spec §7).

## Stack
Next.js (App Router) on Vercel · Supabase Postgres · Resend · GitHub Actions cron.
All free tiers; the domain is the only cash line.

## Local dev
```bash
npm install
cp .env.example .env.local   # fill in Supabase keys + generated secrets
npm run dev
```

## What exists so far
- `supabase/migrations/0001_init.sql` — full schema (spec §3) + RLS + seeds
- `src/lib/adapters/wise.ts` — Wise public-API quote adapter
- `src/app/api/cron/collect-quotes/route.ts` — scheduled quote collection
- `src/app/go/[offerId]/route.ts` — click-logging affiliate redirect (spec §5)
- `.github/workflows/collect-quotes.yml` — 30-min collection cadence

## Tests
```bash
npx tsx scripts/test-wise-adapter.ts          # offline, runs anywhere
npx tsx scripts/test-wise-adapter.ts --live   # hits api.wise.com
```

See `PROGRESS.md` for session log and next steps.
