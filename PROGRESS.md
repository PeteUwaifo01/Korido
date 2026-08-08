# PROGRESS

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
- Wise NGN may be unsupported/paused at any time — adapter treats it as "temporarily unavailable" per the staleness rule; verify with `--live` once deployed.

**Blocked / waiting on Peter**
- Supabase project creation + running the migration (SQL Editor → paste `0001_init.sql`).
- GitHub repo push, Vercel import, env vars, Actions secrets (`CRON_SECRET`, `APP_URL`).
- Task P1: final name/domain.

**Next steps**
1. Mid-market rate collector (open FX source, every 15 min) → `mid_rates`.
2. Scraped adapters: LemFi, Sendwave, Taptap Send (low frequency, honest UA).
3. Provider board page with staleness guard (hide quotes >3h, show "temporarily unavailable").
4. Rate alerts: double opt-in via Resend + threshold cron.
5. Corridor landing pages + WhatsApp rate ticket OG images.
