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

// Shape observed live on 2026-08-08 for USD→NGN: the BANK_TRANSFER pay-in is a
// US wire and is *dearer* than debit. Business/European card options are present
// but are not routes our audience takes.
const wireDearerFixture = {
  rate: 1388.61,
  sourceAmount: 200,
  paymentOptions: [
    { disabled: false, payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", fee: { total: 8.12 }, targetAmount: 266446.49 },
    { disabled: false, payIn: "DEBIT", payOut: "BANK_TRANSFER", fee: { total: 4.47 }, targetAmount: 271514.91 },
    { disabled: false, payIn: "VISA_BUSINESS_DEBIT", payOut: "BANK_TRANSFER", fee: { total: 3.09 }, targetAmount: 272000 },
    { disabled: false, payIn: "INT_DEBIT_WITH_EUROPEAN_CARD", payOut: "BANK_TRANSFER", fee: { total: 2.5 }, targetAmount: 273000 },
    { disabled: true, payIn: "BALANCE", payOut: "BANK_TRANSFER", fee: { total: 1.73 }, targetAmount: 275319.7 },
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
    check("picks cheapest enabled consumer pay-in (not card, not disabled)", ok.fee_flat === 2.31, ok);
    check("fee_pct folded into flat", ok.fee_pct === 0);
    check("records which pay-in the quote assumes", ok.pay_in === "BANK_TRANSFER", ok.pay_in);
  }

  const wireDearer = await wiseAdapter.fetchQuote(
    { id: "US-NG", dest_currency: "NGN" }, 200, mockFetch(200, wireDearerFixture)
  );
  check("when the wire is dearer than debit, quotes the debit price", wireDearer.available && wireDearer.fee_flat === 4.47, wireDearer);
  check("ignores business-card pay-ins a consumer can't use", wireDearer.available && wireDearer.pay_in === "DEBIT", wireDearer);
  check(
    "ignores disabled BALANCE even when cheapest",
    wireDearer.available && wireDearer.fee_flat !== 1.73
  );

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
