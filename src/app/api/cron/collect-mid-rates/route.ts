import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { fetchMidRates, MID_RATE_SOURCE } from "@/lib/fx/mid-rates";

// Mid-market rate collection (spec §4). Driven by GitHub Actions on a 15-min
// schedule — same CRON_SECRET Bearer guard as /api/cron/collect-quotes.
//
// One row per active corridor per successful poll. `collected_at` means "we
// observed the source saying this at time T", which is what the staleness
// guard and the alert checker (§6) both need. A corridor whose currency is
// missing from the feed gets no row — never a zero, never a carried-forward
// value.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: corridors, error } = await db
    .from("corridors")
    .select("id, dest_currency")
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mid = await fetchMidRates();
  if (!mid.available) {
    // Source down or stale: store nothing. The board then ages out of its
    // 3h window and says "temporarily unavailable" rather than showing a
    // number we can no longer stand behind.
    return NextResponse.json(
      { source: MID_RATE_SOURCE.name, unavailable: mid.reason, stored: 0 },
      { status: 200 }
    );
  }

  const rows: Array<{ corridor_id: string; rate: number }> = [];
  const skipped: Array<Record<string, string>> = [];

  for (const c of corridors ?? []) {
    const rate = mid.rates[String(c.dest_currency).toUpperCase()];
    if (typeof rate !== "number") {
      skipped.push({ corridor: String(c.id), reason: `no ${c.dest_currency} rate in feed` });
      continue;
    }
    rows.push({ corridor_id: String(c.id), rate });
  }

  let stored = 0;
  if (rows.length > 0) {
    const { error: insErr } = await db.from("mid_rates").insert(rows);
    if (insErr) {
      return NextResponse.json(
        { source: MID_RATE_SOURCE.name, error: insErr.message, stored: 0 },
        { status: 500 }
      );
    }
    stored = rows.length;
  }

  return NextResponse.json({
    source: MID_RATE_SOURCE.name,
    source_published_at: mid.sourcePublishedAt,
    collected_at: new Date().toISOString(),
    stored,
    rates: Object.fromEntries(rows.map((r) => [r.corridor_id, r.rate])),
    ...(skipped.length > 0 ? { skipped } : {}),
  });
}
