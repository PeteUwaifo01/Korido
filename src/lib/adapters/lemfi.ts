// LemFi adapter — the endpoint LemFi's own public rate calculator calls
// (spec §4: "scheduled scrape of public price calculators").
//
// Investigated 2026-08-08. The ConversionBox component on lemfi.com issues:
//     POST https://lemfi.com/api/lemonade/v2/exchange
//     headers: x-app-locale
//     body: { from, to, sender_country }
// No auth, no cookie, no session. robots.txt: LemFi serves none, so nothing is
// disallowed. We send our own identifiable User-Agent on top.
//
// The `rate` field arrives scaled — e.g. "8.94486156827667596655682e+23" for a
// rate of 1382. LemFi's own client divides it by the digits of the `ID` field
// returned in the same response (their `Ae(rate, ID)` helper). We reproduce
// that transform; the divisor ships in the same public payload, so this reads a
// published price rather than defeating any access control. It is still the
// most fragile thing we depend on — if LemFi changes the transform, the decoded
// number would be wrong rather than absent, so `decodeRate` is bounded by a
// plausibility check and every failure path returns "unavailable".
//
// Read-only pricing. No funds, no credentials (spec §7).

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";
import { KORIDO_UA, toNumber, usable } from "./shared";

const ENDPOINT = "https://lemfi.com/api/lemonade/v2/exchange";
const SENDER_COUNTRY = "United States"; // v1 is US-outbound only (spec §1)

// Sanity band for a "units of dest currency per 1 USD" figure. This is not a
// price opinion — it is a decode check. USD is worth more than 0.1 and less
// than a million of any currency we serve; anything outside means the transform
// broke, and a broken decode must read as unavailable, not as a rate.
const MIN_PLAUSIBLE_RATE = 0.1;
const MAX_PLAUSIBLE_RATE = 1_000_000;

interface LemfiExchangeData {
  ID?: string;
  exchange_from?: string;
  exchange_to?: string;
  fee_type?: string;
  rate?: string | number;
  transaction_fee?: number;
  minimum_fee?: number;
  max_amount_fee?: number;
}

/**
 * Reverses LemFi's scaling: rate = encoded ÷ (digits of the response ID).
 * Returns null when the ID carries no digits, the encoded value will not parse,
 * or the result lands outside the plausibility band.
 */
export function decodeRate(encoded: unknown, id: unknown): number | null {
  if (typeof id !== "string") return null;
  const digits = id.replace(/\D/g, "");
  if (digits === "") return null;

  const divisor = Number(digits);
  const numerator = toNumber(encoded);
  if (numerator === null || !Number.isFinite(divisor) || divisor <= 0) return null;

  const rate = numerator / divisor;
  if (!Number.isFinite(rate) || rate < MIN_PLAUSIBLE_RATE || rate > MAX_PLAUSIBLE_RATE) {
    return null;
  }
  // Trim float representation noise (128.39999999999998 → 128.4). Six decimals
  // is far finer than anything we display, so this changes no published figure.
  return Number(rate.toFixed(6));
}

export const lemfiAdapter: QuoteAdapter = {
  providerId: "lemfi",

  async fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl: typeof fetch = fetch
  ): Promise<AdapterResult> {
    let res: Response;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "User-Agent": KORIDO_UA,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-app-locale": "en-us",
        },
        body: JSON.stringify({
          from: "USD",
          to: corridor.dest_currency,
          sender_country: SENDER_COUNTRY,
        }),
      });
    } catch (err) {
      return { available: false, reason: `network error: ${String(err)}` };
    }

    if (!res.ok) {
      return {
        available: false,
        reason: `HTTP ${res.status} for USD→${corridor.dest_currency}`,
      };
    }

    let body: { data?: LemfiExchangeData };
    try {
      body = (await res.json()) as { data?: LemfiExchangeData };
    } catch (err) {
      return { available: false, reason: `unparseable response: ${String(err)}` };
    }

    const data = body.data;
    if (!data) {
      return { available: false, reason: "response carried no data object" };
    }

    // Guard against a silently mismatched corridor.
    if (data.exchange_to && data.exchange_to !== corridor.dest_currency) {
      return {
        available: false,
        reason: `asked for ${corridor.dest_currency}, got ${data.exchange_to}`,
        raw: data,
      };
    }

    const rate = decodeRate(data.rate, data.ID);
    if (rate === null || !usable(rate)) {
      return {
        available: false,
        reason: `could not decode LemFi rate for USD→${corridor.dest_currency}`,
        raw: data,
      };
    }

    // Only the fee model we have actually seen is trusted. Anything else is
    // unavailable rather than a guessed zero.
    if (data.fee_type !== "Fixed") {
      return {
        available: false,
        reason: `unrecognised fee_type "${data.fee_type}" for ${corridor.id}`,
        raw: data,
      };
    }

    const txFee = typeof data.transaction_fee === "number" ? data.transaction_fee : null;
    const minFee = typeof data.minimum_fee === "number" ? data.minimum_fee : 0;
    if (txFee === null || txFee < 0 || minFee < 0) {
      return { available: false, reason: `unusable fee fields for ${corridor.id}`, raw: data };
    }

    return {
      available: true,
      fx_rate: rate,
      fee_flat: Math.max(txFee, minFee),
      fee_pct: 0,
      raw: { ...data, decoded_rate: rate, sourceAmountUsd },
    };
  },
};
