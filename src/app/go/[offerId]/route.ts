import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { sessionHash, clientIpFrom } from "@/lib/session";

// Spec §5: GET /go/{offerId} → insert into clicks → 302 to affiliate_url
// with {subid} = click uuid. Weekly reconciliation joins network reports
// back on that SubID. If no affiliate link exists yet (pre-approval),
// fall back to the provider homepage so the CTA always works.

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params;
  const id = Number(offerId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Unknown offer" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: offer, error } = await db
    .from("offers")
    .select("id, affiliate_url, active, providers(homepage)")
    .eq("id", id)
    .single();

  if (error || !offer || !offer.active) {
    return NextResponse.json({ error: "Unknown offer" }, { status: 404 });
  }

  // Landing path: where on our site the click came from (for EPC by page).
  const from = req.nextUrl.searchParams.get("from");
  const referer = req.headers.get("referer");
  let landingPath: string | null = from;
  if (!landingPath && referer) {
    try {
      landingPath = new URL(referer).pathname;
    } catch {
      landingPath = null;
    }
  }

  const { data: click, error: clickErr } = await db
    .from("clicks")
    .insert({
      offer_id: offer.id,
      session_hash: sessionHash(clientIpFrom(req.headers), req.headers.get("user-agent")),
      landing_path: landingPath,
    })
    .select("id")
    .single();

  // A logging failure must never strand the user — redirect regardless,
  // with a subid of "unattributed" so reconciliation can spot the gap.
  const subid = click?.id ?? "unattributed";
  if (clickErr) console.error("click insert failed", clickErr.message);

  const homepage =
    (offer.providers as unknown as { homepage: string } | null)?.homepage ??
    "https://korido.app";
  const destination = offer.affiliate_url
    ? offer.affiliate_url.replaceAll("{subid}", String(subid))
    : homepage;

  return NextResponse.redirect(destination, { status: 302 });
}
