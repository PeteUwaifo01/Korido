// Run: npx tsx scripts/verify-supabase.ts
//
// Setup smoke test. Confirms the migration landed, both keys work, and — the
// part that matters — that Row Level Security actually blocks the public key
// from user-adjacent tables (spec §7). Prints no secrets.

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`No ${path}. Copy .env.example and fill it in.`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

(async () => {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anonKey || !serviceKey) {
    console.error("Missing Supabase env vars in .env.local");
    process.exit(1);
  }

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = createClient(url, anonKey, opts);
  const admin = createClient(url, serviceKey, opts);

  console.log("Schema (spec §3)");
  for (const [table, expected] of [
    ["verticals", 3],
    ["corridors", 3],
    ["providers", 7],
    ["offers", 21], // 7 providers × 3 corridors
  ] as const) {
    const { count, error } = await anon.from(table).select("*", { count: "exact", head: true });
    check(`${table}: ${count ?? "?"} rows (expected ${expected})`, !error && count === expected, error?.message);
  }

  for (const table of ["quotes", "mid_rates", "clicks", "conversions", "alert_subscribers", "alerts"]) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    check(`${table} exists`, !error, error?.message);
  }

  console.log("\nRow Level Security (spec §7)");
  // The public key must be able to read the catalog...
  const { error: readErr } = await anon.from("corridors").select("id").limit(1);
  check("public key can read the catalog", !readErr, readErr?.message);

  // ...and must NOT reach anything user-adjacent. No policy exists on these,
  // so RLS returns an empty set rather than an error — zero rows is the pass.
  for (const table of ["clicks", "alert_subscribers", "alerts", "conversions"]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    check(`public key cannot read ${table}`, (data?.length ?? 0) === 0, { rows: data?.length, error: error?.message });
  }

  // The public key must not be able to write, either.
  const { error: writeErr } = await anon
    .from("mid_rates")
    .insert({ corridor_id: "US-NG", rate: 1 });
  check("public key cannot write to mid_rates", writeErr !== null, "insert unexpectedly succeeded");

  console.log("\nService key");
  const { error: adminErr } = await admin.from("offers").select("id").limit(1);
  check("service key can read offers", !adminErr, adminErr?.message);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nSupabase is wired up correctly.");
})();
