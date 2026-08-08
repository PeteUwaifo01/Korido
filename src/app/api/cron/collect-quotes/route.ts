import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { ADAPTERS } from "@/lib/adapters";

// Quote pipeline entry point (spec §4). Invoked on a schedule (GitHub
// Actions cron hitting this URL — Vercel Hobby crons are daily-only,
// too coarse for a 30–60 min cadence). Auth: Bearer CRON_SECRET.
//
// Reference amount: quotes are collected at $200 sourceAmount — a typical
// remittance size — so fee_flat is comparable across collections. The UI
// recomputes receive amounts for the user's own amount from rate + fee.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REFERENCE_AMOUNT_USD = 200;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: offers, error } = await db
    .from("offers")
    .select("id, provider_id, corridors(id, dest_currency)")
    .eq("vertical_id", "send")
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const offer of offers ?? []) {
    const adapter = ADAPTERS[offer.provider_id as string];
    if (!adapter) continue; // provider has no adapter yet — no row, no stale data

    const corridor = offer.corridors as unknown as { id: string; dest_currency: string };
    const quote = await adapter.fetchQuote(corridor, REFERENCE_AMOUNT_USD);

    if (quote.available) {
      const { error: insErr } = await db.from("quotes").insert({
        offer_id: offer.id,
        fx_rate: quote.fx_rate,
        fee_flat: quote.fee_flat,
        fee_pct: quote.fee_pct,
        raw: quote.raw ?? null,
      });
      results.push({
        offer: offer.id,
        provider: offer.provider_id,
        corridor: corridor.id,
        ok: !insErr,
        fx_rate: quote.fx_rate,
        ...(insErr ? { error: insErr.message } : {}),
      });
    } else {
      // Unavailable corridors produce no quote row; the staleness guard
      // (spec §4) then shows "temporarily unavailable" instead of old numbers.
      results.push({
        offer: offer.id,
        provider: offer.provider_id,
        corridor: corridor.id,
        ok: false,
        unavailable: quote.reason,
      });
    }
  }

  return NextResponse.json({ collected_at: new Date().toISOString(), results });
}
