// Set (or clear) a provider's affiliate tracking link.
//
//   npx tsx scripts/set-affiliate-url.ts <provider> <url>       all corridors
//   npx tsx scripts/set-affiliate-url.ts <provider> <url> US-NG one corridor
//   npx tsx scripts/set-affiliate-url.ts <provider> --clear
//   npx tsx scripts/set-affiliate-url.ts --list
//
// Run this once each affiliate approval lands (spec §8, week 3). The URL must
// contain the {subid} placeholder — /go/ substitutes the click UUID there, and
// the weekly reconciliation joins the network's report back on it. A link
// without it still works and still earns, but the money can never be traced to
// a corridor, provider or page, so this refuses to store one.
//
// Uses the service-role key, so it is a local operator tool, never a route.

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { validateAffiliateUrl } from "../src/lib/attribution";

function loadEnv(path = ".env.local"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`No ${path}.`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

(async () => {
  loadEnv();
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [provider, url, corridor] = process.argv.slice(2);

  if (!provider || provider === "--list") {
    const { data, error } = await db
      .from("offers")
      .select("provider_id, corridor_id, active, affiliate_url, network")
      .eq("vertical_id", "send")
      .order("provider_id");
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    console.log("provider    corridor  active  affiliate_url");
    for (const o of data ?? []) {
      console.log(
        String(o.provider_id).padEnd(11),
        String(o.corridor_id).padEnd(9),
        String(o.active).padEnd(7),
        o.affiliate_url ?? "— (falls back to provider homepage)"
      );
    }
    return;
  }

  if (!url) {
    console.error("Usage: set-affiliate-url.ts <provider> <url|--clear> [corridor]");
    process.exit(1);
  }

  let value: string | null = null;
  if (url !== "--clear") {
    const check = validateAffiliateUrl(url);
    if (!check.ok) {
      console.error(`Refusing to store this link: ${check.reason}`);
      process.exit(1);
    }
    value = check.url;
  }

  let q = db.from("offers").update({ affiliate_url: value })
    .eq("vertical_id", "send")
    .eq("provider_id", provider);
  if (corridor) q = q.eq("corridor_id", corridor);

  const { error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const { data } = await db
    .from("offers")
    .select("corridor_id, affiliate_url")
    .eq("vertical_id", "send")
    .eq("provider_id", provider);

  console.log(value === null ? `Cleared ${provider}.` : `Set ${provider}${corridor ? ` (${corridor})` : ""}.`);
  for (const o of data ?? []) console.log(`  ${o.corridor_id}  ${o.affiliate_url ?? "—"}`);
})();
