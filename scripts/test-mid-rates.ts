// Run: npx tsx scripts/test-mid-rates.ts        (offline fixture tests)
//      npx tsx scripts/test-mid-rates.ts --live  (hits open.er-api.com)
//
// Mirrors scripts/test-wise-adapter.ts: the contract under test is "never
// return a number we can't stand behind" (spec §4).

import { fetchMidRates } from "../src/lib/fx/mid-rates";

const NOW = Date.UTC(2026, 7, 8, 12, 0, 0); // 2026-08-08T12:00:00Z
const FRESH_UNIX = Math.floor(Date.UTC(2026, 7, 8, 0, 2, 31) / 1000); // 12h before NOW

const fixture = {
  result: "success",
  time_last_update_unix: FRESH_UNIX,
  time_last_update_utc: "Sat, 08 Aug 2026 00:02:31 +0000",
  rates: { USD: 1, NGN: 1364.006979, GHS: 11.762507, KES: 129.426327, EUR: 0.86 },
};

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

async function offline() {
  console.log("Offline fixture tests");

  const ok = await fetchMidRates(mockFetch(200, fixture), NOW);
  check("returns available on a good payload", ok.available === true, ok);
  if (ok.available) {
    check("parses all three v1 corridors", ok.rates.NGN === 1364.006979 && ok.rates.GHS === 11.762507 && ok.rates.KES === 129.426327, ok.rates);
    check("reports the source's publish time, not fetch time", ok.sourcePublishedAt === "2026-08-08T00:02:31.000Z", ok.sourcePublishedAt);
  }

  const stale = await fetchMidRates(
    mockFetch(200, { ...fixture, time_last_update_unix: FRESH_UNIX - 4 * 86400 }),
    NOW
  );
  check("stale feed (>48h old) → unavailable, never a stale number", stale.available === false, stale);

  const future = await fetchMidRates(
    mockFetch(200, { ...fixture, time_last_update_unix: FRESH_UNIX + 5 * 86400 }),
    NOW
  );
  check("implausible future timestamp → unavailable", future.available === false, future);

  const failed = await fetchMidRates(mockFetch(200, { result: "error", "error-type": "unsupported-code" }), NOW);
  check('result != "success" → unavailable', failed.available === false, failed);

  const noStamp = await fetchMidRates(mockFetch(200, { result: "success", rates: { NGN: 1364 } }), NOW);
  check("missing publish timestamp → unavailable (can't prove freshness)", noStamp.available === false, noStamp);

  const junk = await fetchMidRates(
    mockFetch(200, { ...fixture, rates: { NGN: 0, GHS: -3, KES: "129.4", USD: 1 } }),
    NOW
  );
  check(
    "drops zero / negative / non-numeric rates rather than storing them",
    junk.available === true && junk.rates.NGN === undefined && junk.rates.GHS === undefined && junk.rates.KES === undefined,
    junk
  );

  const http = await fetchMidRates(mockFetch(503, {}), NOW);
  check("HTTP 503 → unavailable", http.available === false, http);

  const unparseable = await fetchMidRates(
    (async () => new Response("<html>maintenance</html>", { status: 200 })) as typeof fetch,
    NOW
  );
  check("non-JSON body → unavailable", unparseable.available === false, unparseable);

  const down = await fetchMidRates(
    (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch,
    NOW
  );
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"), down);
}

async function live() {
  console.log("\nLive smoke test (open.er-api.com)");
  const r = await fetchMidRates();
  if (!r.available) {
    console.log(`  – unavailable (${r.reason}) — collector stores nothing, board shows "temporarily unavailable"`);
    failures++;
    return;
  }
  console.log(`  source published ${r.sourcePublishedAt}`);
  for (const code of ["NGN", "GHS", "KES"]) {
    const v = r.rates[code];
    if (typeof v === "number") console.log(`  ✓ USD→${code}: ${v}`);
    else { console.error(`  ✗ USD→${code}: missing from feed`); failures++; }
  }
}

(async () => {
  await offline();
  if (process.argv.includes("--live")) await live();
  if (failures > 0) process.exit(1);
  console.log("\nAll offline tests passed.");
})();
