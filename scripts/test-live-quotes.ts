// Run: npx tsx scripts/test-live-quotes.ts
//
// The live-quote path exists because extrapolating from the $200 collection
// misranks providers. These tests pin the behaviour that keeps that true:
// a provider that fails is ABSENT, never substituted with an older or scaled
// number, and one slow provider cannot take the page down with it.

import { fetchLiveQuotes, clearLiveQuoteCache, type LiveOffer } from "../src/lib/live-quotes";
import type { Corridor } from "../src/lib/adapters/types";

const NG: Corridor = { id: "US-NG", dest_currency: "NGN", dest_country: "NG" };
const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);

// Real provider ids so ADAPTERS resolves; the fetch layer is mocked.
const OFFERS: LiveOffer[] = [
  { id: 1, providerId: "wise" },
  { id: 2, providerId: "lemfi" },
  { id: 3, providerId: "sendwave" },
  { id: 4, providerId: "taptap" },
  { id: 5, providerId: "remitly" }, // seeded, no adapter
];

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

/** Answers every provider's endpoint with a plausible payload. */
function goodFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    let body: unknown = {};
    if (url.includes("wise.com")) {
      body = {
        rate: 1388.61,
        paymentOptions: [{ disabled: false, payIn: "DEBIT", payOut: "BANK_TRANSFER", fee: { total: 12.18 } }],
      };
    } else if (url.includes("lemfi.com")) {
      body = {
        data: {
          ID: "64eeb72c-4f03-4b50-b272-5e58bf58651f",
          exchange_to: "NGN",
          fee_type: "Fixed",
          rate: "8.94486156827667596655682e+23",
          transaction_fee: 0,
          minimum_fee: 0,
        },
      };
    } else if (url.includes("sendwave.com")) {
      body = { baseExchangeRate: "1378.104", baseFeeAmount: "0.00", baseFeeRateBps: 0 };
    } else if (url.includes("taptapsend.com")) {
      body = {
        availableCountries: [
          { isoCountryCode: "US", currency: "USD", corridors: [{ isoCountryCode: "NG", currency: "NGN", fxRate: "1378.00" }] },
        ],
      };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

(async () => {
  console.log("Live quotes");

  clearLiveQuoteCache();
  const ok = await fetchLiveQuotes(OFFERS, NG, 1000, NOW, goodFetch());
  check("returns a row per provider that answered", ok.length === 4, ok.map((r) => r.offer_id));
  check("a seeded provider with no adapter is absent, not zeroed",
    !ok.some((r) => r.offer_id === 5), ok);
  check("stamps collected_at as now", ok.every((r) => r.collected_at === new Date(NOW).toISOString()));
  check("carries Wise's live fee for the requested amount, not the $200 one",
    ok.find((r) => r.offer_id === 1)?.fee_flat === 12.18, ok.find((r) => r.offer_id === 1));
  check("decodes LemFi live too", ok.find((r) => r.offer_id === 2)?.fx_rate === 1382);

  console.log("\nFailure must mean absent, never a substituted number");
  clearLiveQuoteCache();
  const allDown = await fetchLiveQuotes(
    OFFERS, NG, 1000, NOW,
    (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch
  );
  check("every provider down → zero rows (board renders unavailable)", allDown.length === 0, allDown);

  clearLiveQuoteCache();
  const partial = await fetchLiveQuotes(
    OFFERS, NG, 1000, NOW,
    (async (input: RequestInfo | URL) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.includes("wise.com")) throw new Error("ETIMEDOUT");
      return goodFetch()(input);
    }) as typeof fetch
  );
  check("one provider down → the other three still publish", partial.length === 3, partial.length);
  check("the failed provider is absent rather than stale", !partial.some((r) => r.offer_id === 1));

  clearLiveQuoteCache();
  const http500 = await fetchLiveQuotes(
    OFFERS, NG, 1000, NOW,
    (async () => new Response("{}", { status: 500 })) as typeof fetch
  );
  check("HTTP errors → zero rows", http500.length === 0, http500);

  console.log("\nCache");
  clearLiveQuoteCache();
  let calls = 0;
  const counting: typeof fetch = (async (input: RequestInfo | URL) => {
    calls++;
    return goodFetch()(input);
  }) as typeof fetch;

  await fetchLiveQuotes(OFFERS, NG, 1000, NOW, counting);
  const afterFirst = calls;
  await fetchLiveQuotes(OFFERS, NG, 1000, NOW, counting);
  check("a repeat request inside the TTL hits no provider", calls === afterFirst, { afterFirst, calls });

  await fetchLiveQuotes(OFFERS, NG, 1500, NOW, counting);
  check("a different amount is fetched, not reused", calls > afterFirst);

  const later = calls;
  await fetchLiveQuotes(OFFERS, NG, 1000, NOW + 61_000, counting);
  check("past the TTL it refetches — these are live prices", calls > later);

  if (failures > 0) process.exit(1);
  console.log("\nAll live-quote tests passed.");
})();
