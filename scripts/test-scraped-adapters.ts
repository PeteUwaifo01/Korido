// Run: npx tsx scripts/test-scraped-adapters.ts        (offline fixture tests)
//      npx tsx scripts/test-scraped-adapters.ts --live  (hits the real calculators)
//
// LemFi / Sendwave / Taptap Send. Fixtures are trimmed copies of payloads
// observed live on 2026-08-08. The contract under test is the same one the Wise
// adapter has: anything we cannot parse with confidence returns "unavailable",
// never a guessed or zeroed number (spec §4).

import { lemfiAdapter, decodeRate } from "../src/lib/adapters/lemfi";
import { sendwaveAdapter } from "../src/lib/adapters/sendwave";
import { taptapAdapter, resolveFee } from "../src/lib/adapters/taptap";
import { xoomAdapter, pickPricing } from "../src/lib/adapters/xoom";
import type { Corridor } from "../src/lib/adapters/types";

const NG: Corridor = { id: "US-NG", dest_currency: "NGN", dest_country: "NG" };
const KE: Corridor = { id: "US-KE", dest_currency: "KES", dest_country: "KE" };

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

function mockFetch(status: number, body: unknown, contentType = "application/json"): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": contentType },
    })) as typeof fetch;
}
const throwingFetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

// ————————————————————————————————— LemFi

// Live 2026-08-08: rate 1382 arrives as 8.94486...e+23 and is divided by the
// digits of the ID.
const lemfiNgn = {
  data: {
    ID: "64eeb72c-4f03-4b50-b272-5e58bf58651f",
    exchange_from: "USD",
    exchange_to: "NGN",
    fee_type: "Fixed",
    max_amount_fee: 0,
    minimum_fee: 0,
    rate: "8.94486156827667596655682e+23",
    transaction_fee: 0,
  },
};

async function lemfi() {
  console.log("\nLemFi");

  const ok = await lemfiAdapter.fetchQuote(NG, 200, mockFetch(200, lemfiNgn));
  check("decodes the scaled rate to 1382", ok.available && ok.fx_rate === 1382, ok);
  check("fee 0 on a Fixed schedule", ok.available && ok.fee_flat === 0 && ok.fee_pct === 0, ok);

  check("decodeRate: no digits in ID → null", decodeRate("1e23", "abc-def") === null);
  check("decodeRate: unparseable rate → null", decodeRate("not-a-number", "64ee-1234") === null);
  check(
    "decodeRate: result outside the plausibility band → null (broken transform ≠ a rate)",
    decodeRate("1", "99999999999999999999") === null
  );
  check("decodeRate: trims float noise (128.39999999999998 → 128.4)",
    decodeRate("8.310566031433518742514304e+24", "64eeb72c-4f03-4b51-b272-2108bf586560") === 128.4);

  const wrongCurrency = await lemfiAdapter.fetchQuote(
    KE, 200, mockFetch(200, { data: { ...lemfiNgn.data } })
  );
  check("corridor mismatch → unavailable", wrongCurrency.available === false, wrongCurrency);

  const oddFee = await lemfiAdapter.fetchQuote(
    NG, 200, mockFetch(200, { data: { ...lemfiNgn.data, fee_type: "Percentage" } })
  );
  check("unrecognised fee_type → unavailable, never a guessed 0", oddFee.available === false, oddFee);

  const minFloor = await lemfiAdapter.fetchQuote(
    NG, 200, mockFetch(200, { data: { ...lemfiNgn.data, transaction_fee: 0, minimum_fee: 1.5 } })
  );
  check("minimum_fee floors transaction_fee", minFloor.available && minFloor.fee_flat === 1.5, minFloor);

  const noData = await lemfiAdapter.fetchQuote(NG, 200, mockFetch(200, {}));
  check("missing data object → unavailable", noData.available === false);

  const html = await lemfiAdapter.fetchQuote(NG, 200, mockFetch(200, "<html>oops</html>", "text/html"));
  check("HTML instead of JSON → unavailable", html.available === false);

  const http = await lemfiAdapter.fetchQuote(NG, 200, mockFetch(503, {}));
  check("HTTP 503 → unavailable", http.available === false);

  const down = await lemfiAdapter.fetchQuote(NG, 200, throwingFetch);
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"));
}

// ————————————————————————————————— Sendwave

// Live 2026-08-08 US→KES: base 128.33233 / $0.49, with a new-customer
// "Intro Rate Discount" lifting the effective rate to 128.97858.
const sendwaveKes = {
  baseExchangeRate: "128.33233",
  baseFeeAmount: "0.49",
  baseFeeRateBps: 0,
  effectiveExchangeRate: "128.97858",
  effectiveFeeAmount: "0.49",
  campaignsApplied: [{ code: "NEW", description: "Intro Rate Discount", adjustmentBps: 50 }],
};

async function sendwave() {
  console.log("\nSendwave");

  const ok = await sendwaveAdapter.fetchQuote(KE, 200, mockFetch(200, sendwaveKes));
  check("quotes the base rate, not the promo rate", ok.available && ok.fx_rate === 128.33233, ok);
  check("parses the flat fee", ok.available && ok.fee_flat === 0.49, ok);
  check("keeps the campaign in raw for audit",
    ok.available && JSON.stringify(ok.raw).includes("Intro Rate Discount"), ok);

  const bps = await sendwaveAdapter.fetchQuote(
    KE, 200, mockFetch(200, { ...sendwaveKes, baseFeeRateBps: 125 })
  );
  check("converts basis points to a percentage (125bps → 0.0125)",
    bps.available && bps.fee_pct === 0.0125, bps);

  const noRate = await sendwaveAdapter.fetchQuote(
    KE, 200, mockFetch(200, { ...sendwaveKes, baseExchangeRate: null })
  );
  check("missing baseExchangeRate → unavailable", noRate.available === false, noRate);

  const zeroRate = await sendwaveAdapter.fetchQuote(
    KE, 200, mockFetch(200, { ...sendwaveKes, baseExchangeRate: "0" })
  );
  check("zero rate → unavailable, never published", zeroRate.available === false, zeroRate);

  const badFee = await sendwaveAdapter.fetchQuote(
    KE, 200, mockFetch(200, { ...sendwaveKes, baseFeeAmount: "n/a" })
  );
  check("unparseable fee → unavailable", badFee.available === false, badFee);

  const unauth = await sendwaveAdapter.fetchQuote(
    KE, 200, mockFetch(401, { code: "invalid-session" })
  );
  check("401 → unavailable (we never hold a session)", unauth.available === false, unauth);

  const down = await sendwaveAdapter.fetchQuote(KE, 200, throwingFetch);
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"));
}

// ————————————————————————————————— Taptap Send

const taptapTiered = {
  type: "tiered",
  tiers: [{ fee: "1.99", minValue: "0.00" }, { fee: "0.00", minValue: "200.00" }],
};

const taptapPayload = {
  availableCountries: [
    {
      isoCountryCode: "GB",
      currency: "GBP",
      corridors: [{ isoCountryCode: "NG", currency: "NGN", fxRate: "1863.00" }],
    },
    {
      isoCountryCode: "US",
      currency: "USD",
      corridors: [
        { isoCountryCode: "NG", countryDisplayName: "Nigeria", currency: "NGN", currencyScale: 0, fxRate: "1383.00" },
        { isoCountryCode: "KE", countryDisplayName: "Kenya", currency: "KES", currencyScale: 0, fxRate: "128.45" },
        { isoCountryCode: "PK", currency: "PKR", fxRate: "278.22", feeSchedule: taptapTiered },
        {
          isoCountryCode: "AR", currency: "ARS", fxRate: "1578.00",
          feeSchedule: { type: "standard", flatFee: "1.99" },
        },
      ],
    },
  ],
};

async function taptap() {
  console.log("\nTaptap Send");

  const ok = await taptapAdapter.fetchQuote(NG, 200, mockFetch(200, taptapPayload));
  check("picks the US origin, not GB (1383, not 1863)", ok.available && ok.fx_rate === 1383, ok);
  check("no feeSchedule on this corridor → fee 0", ok.available && ok.fee_flat === 0, ok);

  check("resolveFee: standard schedule", resolveFee({ type: "standard", flatFee: "1.99" }, 200) === 1.99);
  check("resolveFee: tiered below the threshold", resolveFee(taptapTiered, 100) === 1.99);
  check("resolveFee: tiered at/above the threshold", resolveFee(taptapTiered, 200) === 0);
  check("resolveFee: unknown schedule type → null (unavailable, not 0)",
    resolveFee({ type: "surprise" } as never, 200) === null);
  check("resolveFee: tiered with an unparseable tier → null",
    resolveFee({ type: "tiered", tiers: [{ fee: "abc", minValue: "0" }] }, 200) === null);
  check("resolveFee: absent schedule means genuinely fee-free", resolveFee(undefined, 200) === 0);

  const unknownFee = await taptapAdapter.fetchQuote(
    NG, 200,
    mockFetch(200, {
      availableCountries: [
        { isoCountryCode: "US", currency: "USD", corridors: [
          { isoCountryCode: "NG", currency: "NGN", fxRate: "1383.00", feeSchedule: { type: "mystery" } },
        ] },
      ],
    })
  );
  check("unrecognised fee schedule → unavailable", unknownFee.available === false, unknownFee);

  const noCorridor = await taptapAdapter.fetchQuote(
    { id: "US-GH", dest_currency: "GHS", dest_country: "GH" }, 200, mockFetch(200, taptapPayload)
  );
  check("corridor absent from the payload → unavailable", noCorridor.available === false, noCorridor);

  const noOrigin = await taptapAdapter.fetchQuote(
    NG, 200, mockFetch(200, { availableCountries: [{ isoCountryCode: "GB", corridors: [] }] })
  );
  check("no US origin → unavailable", noOrigin.available === false, noOrigin);

  const badRate = await taptapAdapter.fetchQuote(
    NG, 200,
    mockFetch(200, {
      availableCountries: [
        { isoCountryCode: "US", corridors: [{ isoCountryCode: "NG", currency: "NGN", fxRate: "0" }] },
      ],
    })
  );
  check("zero fxRate → unavailable", badRate.available === false, badRate);

  const noCountry = await taptapAdapter.fetchQuote(
    { id: "BADID", dest_currency: "NGN" }, 200, mockFetch(200, taptapPayload)
  );
  check("undeducible destination country → unavailable", noCountry.available === false, noCountry);

  const http = await taptapAdapter.fetchQuote(NG, 200, mockFetch(500, {}));
  check("HTTP 500 → unavailable", http.available === false);

  const down = await taptapAdapter.fetchQuote(NG, 200, throwingFetch);
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"));
}

// ————————————————————————————————— Xoom

// Shape observed live 2026-08-09 on US→NG. Every option reports the SAME
// receiveAmount and differs only in feeAmount — Xoom adds its fee on top.
const xoomPricing = [
  { disbursementType: "DEPOSIT", paymentType: { type: "CRYPTO_PYUSD" }, validations: [], fxRate: { rate: "1354.2391" }, feeAmount: { rawValue: "0.0000" }, receiveAmount: { rawValue: "270847.82" } },
  { disbursementType: "DEPOSIT", paymentType: { type: "PAYPAL_BALANCE" }, validations: [], fxRate: { rate: "1354.2391" }, feeAmount: { rawValue: "0.0000" }, receiveAmount: { rawValue: "270847.82" } },
  { disbursementType: "DEPOSIT", paymentType: { type: "ACH" }, validations: [], fxRate: { rate: "1354.2391" }, feeAmount: { rawValue: "0.0000" }, receiveAmount: { rawValue: "270847.82" } },
  { disbursementType: "DEPOSIT", paymentType: { type: "DEBIT_CARD" }, validations: [], fxRate: { rate: "1354.2391" }, feeAmount: { rawValue: "0.59" }, receiveAmount: { rawValue: "270847.82" } },
  // Cash pickup carries a visibly worse rate — must not win on rate alone.
  { disbursementType: "PICKUP", paymentType: { type: "ACH" }, validations: [], fxRate: { rate: "1327.1543" }, feeAmount: { rawValue: "0.0000" }, receiveAmount: { rawValue: "265430.86" } },
];

function xoomFetch(pricing: unknown, opts: { csrf?: boolean; pageStatus?: number; quoteStatus?: number } = {}): typeof fetch {
  const { csrf = true, pageStatus = 200, quoteStatus = 200 } = opts;
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.includes("/send-money")) {
      const body = csrf ? '<script>{\\"csrf\\":\\"tok_abc123\\",\\"baseUrl\\":\\"/wapi/guest-app\\"}</script>' : "<html>no token</html>";
      return new Response(body, { status: pageStatus, headers: { "Content-Type": "text/html" } });
    }
    return new Response(JSON.stringify({ quote: { pricing } }), {
      status: quoteStatus,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

async function xoom() {
  console.log("\nXoom");

  const ok = await xoomAdapter.fetchQuote(NG, 200, xoomFetch(xoomPricing));
  check("picks a consumer funding method, not crypto or PayPal balance",
    ok.available && ok.pay_in === "ACH", ok);
  check("picks bank deposit over the worse cash-pickup rate",
    ok.available && ok.fx_rate === 1354.2391, ok);
  check("zero-fee option → publishes Xoom's own stated receive amount",
    ok.available && ok.receive === 270847.82, ok);

  check("pickPricing ranks on money delivered, not on headline rate",
    pickPricing(xoomPricing, 200)?.option.paymentType?.type === "ACH");
  check("pickPricing skips options carrying validations",
    pickPricing([{ ...xoomPricing[2], validations: [{ message: "unavailable" }] }], 200) === null);
  check("pickPricing rejects a payload with only crypto/balance funding",
    pickPricing(xoomPricing.slice(0, 2), 200) === null);

  // A fee-bearing option must NOT publish Xoom's stated receive: that figure
  // assumes the sender paid amount + fee, a bigger budget than they typed.
  const feeOnly = await xoomAdapter.fetchQuote(
    NG, 200,
    xoomFetch([{ ...xoomPricing[3], feeAmount: { rawValue: "2.50" } }])
  );
  check("fee-bearing option → stated receive withheld, board computes instead",
    feeOnly.available && feeOnly.receive === null && feeOnly.fee_flat === 2.5, feeOnly);

  const noToken = await xoomAdapter.fetchQuote(NG, 200, xoomFetch(xoomPricing, { csrf: false }));
  check("missing CSRF token → unavailable (page layout changed)", noToken.available === false, noToken);

  const pageDown = await xoomAdapter.fetchQuote(NG, 200, xoomFetch(xoomPricing, { pageStatus: 503 }));
  check("corridor page down → unavailable", pageDown.available === false, pageDown);

  const quoteDown = await xoomAdapter.fetchQuote(NG, 200, xoomFetch(xoomPricing, { quoteStatus: 406 }));
  check("quote endpoint refuses → unavailable", quoteDown.available === false, quoteDown);

  const empty = await xoomAdapter.fetchQuote(NG, 200, xoomFetch([]));
  check("no pricing options → unavailable", empty.available === false, empty);

  const unknownCorridor = await xoomAdapter.fetchQuote(
    { id: "US-ZZ", dest_currency: "ZZZ", dest_country: "ZZ" }, 200, xoomFetch(xoomPricing)
  );
  check("corridor Xoom has no page for → unavailable", unknownCorridor.available === false, unknownCorridor);

  const down = await xoomAdapter.fetchQuote(NG, 200, throwingFetch);
  check("network error → unavailable with reason", down.available === false && down.reason.includes("ECONNREFUSED"));
}

// ————————————————————————————————— live smoke

async function live() {
  console.log("\nLive smoke test (real calculators — low frequency, honest UA)");
  const corridors: Corridor[] = [
    { id: "US-NG", dest_currency: "NGN", dest_country: "NG" },
    { id: "US-GH", dest_currency: "GHS", dest_country: "GH" },
    { id: "US-KE", dest_currency: "KES", dest_country: "KE" },
  ];
  for (const adapter of [lemfiAdapter, sendwaveAdapter, taptapAdapter, xoomAdapter]) {
    for (const c of corridors) {
      const q = await adapter.fetchQuote(c, 200);
      if (q.available) {
        console.log(`  ✓ ${adapter.providerId} ${c.id}: $1 = ${q.fx_rate} ${c.dest_currency}, fee $${q.fee_flat}`);
      } else {
        console.log(`  – ${adapter.providerId} ${c.id}: unavailable (${q.reason})`);
      }
    }
  }
}

(async () => {
  console.log("Offline fixture tests");
  await lemfi();
  await sendwave();
  await taptap();
  await xoom();
  if (process.argv.includes("--live")) await live();
  if (failures > 0) process.exit(1);
  console.log("\nAll offline tests passed.");
})();
