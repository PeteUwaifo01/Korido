// Run: npx tsx scripts/test-wise-adapter.ts        (offline fixture tests)
//      npx tsx scripts/test-wise-adapter.ts --live  (hits api.wise.com for NGN/GHS/KES)

import { wiseAdapter } from "../src/lib/adapters/wise";

const fixture = {
  rate: 129.85,
  sourceAmount: 200,
  paymentOptions: [
    { disabled: false, payIn: "CARD", payOut: "BANK_TRANSFER", fee: { total: 7.42 }, targetAmount: 25004.1 },
    { disabled: false, payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", fee: { total: 2.31 }, targetAmount: 25667.5 },
    { disabled: true, payIn: "BALANCE", payOut: "BANK_TRANSFER", fee: { total: 0.9 } },
  ],
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

  const ok = await wiseAdapter.fetchQuote(
    { id: "US-KE", dest_currency: "KES" }, 200, mockFetch(200, fixture)
  );
  check("returns available on 200", ok.available === true);
  if (ok.available) {
    check("fx_rate parsed", ok.fx_rate === 129.85);
    check("picks cheapest enabled BANK_TRANSFER pay-in (not card, not disabled)", ok.fee_flat === 2.31, ok);
    check("fee_pct folded into flat", ok.fee_pct === 0);
  }

  const unsupported = await wiseAdapter.fetchQuote(
    { id: "US-NG", dest_currency: "NGN" }, 200,
    mockFetch(422, { errors: [{ code: "TARGET_CURRENCY_NOT_SUPPORTED" }] })
  );
  check("422 → unavailable, never a fake rate", unsupported.available === false);

  const empty = await wiseAdapter.fetchQuote(
    { id: "US-KE", dest_currency: "KES" }, 200,
    mockFetch(200, { rate: 129.85, paymentOptions: [{ disabled: true, fee: { total: 1 } }] })
  );
  check("all options disabled → unavailable", empty.available === false);

  const down = await wiseAdapter.fetchQuote(
    { id: "US-KE", dest_currency: "KES" }, 200,
    (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch
  );
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"));
}

async function live() {
  console.log("\nLive smoke test (api.wise.com)");
  for (const c of [
    { id: "US-NG", dest_currency: "NGN" },
    { id: "US-GH", dest_currency: "GHS" },
    { id: "US-KE", dest_currency: "KES" },
  ]) {
    const q = await wiseAdapter.fetchQuote(c, 200);
    if (q.available) {
      console.log(`  ✓ ${c.id}: $1 = ${q.fx_rate} ${c.dest_currency}, fee $${q.fee_flat}`);
    } else {
      console.log(`  – ${c.id}: unavailable (${q.reason}) — collector will skip, UI shows "temporarily unavailable"`);
    }
  }
}

(async () => {
  await offline();
  if (process.argv.includes("--live")) await live();
  if (failures > 0) process.exit(1);
  console.log("\nAll offline tests passed.");
})();
