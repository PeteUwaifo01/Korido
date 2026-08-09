// Sendwave adapter — Sendwave's public pricing endpoint, the one their own
// marketing calculator calls (spec §4).
//
// Investigated 2026-08-08. Two endpoints exist and the difference matters:
//     https://app.sendwave.com/v2/pricing         → 401 invalid-session
//     https://app.sendwave.com/v2/pricing-public  → open, no auth
// We use the public one. Nothing here logs in or holds a session — that would
// sit on the funds perimeter (spec §7), and we do not go near it.
// Sendwave serves no robots.txt, so nothing is disallowed.
//
// PRICE CHOICE: the response carries both a `base*` and an `effective*` price.
// `effective*` folds in promotional campaigns — on US→KES today that is an
// "Intro Rate Discount" available to new customers only. Publishing a
// first-transfer promo as the standing rate would overstate Sendwave for anyone
// who has used them before, so the board quotes the `base*` price and keeps
// `campaignsApplied` plus the effective figures in `raw` for audit (and for a
// possible "intro offer" badge later).
//
// Read-only pricing. No funds, no credentials.

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";
import { KORIDO_UA, destCountry, toNumber, usable } from "./shared";

const ENDPOINT = "https://app.sendwave.com/v2/pricing-public";
const SEND_COUNTRY = "us"; // v1 is US-outbound only (spec §1)

interface SendwavePricing {
  baseExchangeRate?: string;
  baseFeeAmount?: string;
  baseFeeRateBps?: number;
  effectiveExchangeRate?: string;
  effectiveFeeAmount?: string;
  campaignsApplied?: unknown[];
  /** Sendwave publishes the receive amount outright. Note it reflects the
   *  *effective* (promo-inclusive) price, so it is only safe to use when no
   *  campaign is applied — see below. */
  receiveAmount?: number;
}

export const sendwaveAdapter: QuoteAdapter = {
  providerId: "sendwave",

  async fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl: typeof fetch = fetch
  ): Promise<AdapterResult> {
    const dest = destCountry(corridor);
    if (!dest) {
      return { available: false, reason: `cannot derive destination country from "${corridor.id}"` };
    }

    // No `segmentName`: that selects a specific payout method (M-Pesa vs Airtel
    // on KES). Omitting it returns the corridor's default, headline price,
    // which is the like-for-like number for a comparison board.
    const query = new URLSearchParams({
      amountType: "SEND",
      amount: String(sourceAmountUsd),
      sendCurrency: "USD",
      sendCountryIso2: SEND_COUNTRY,
      receiveCurrency: corridor.dest_currency,
      receiveCountryIso2: dest.toLowerCase(),
    });

    let res: Response;
    try {
      res = await fetchImpl(`${ENDPOINT}?${query}`, {
        headers: {
          "User-Agent": KORIDO_UA,
          Accept: "application/json",
          "Accept-Language": "en",
        },
      });
    } catch (err) {
      return { available: false, reason: `network error: ${String(err)}` };
    }

    if (!res.ok) {
      return {
        available: false,
        reason: `HTTP ${res.status} for US→${dest} (${corridor.dest_currency})`,
      };
    }

    let data: SendwavePricing;
    try {
      data = (await res.json()) as SendwavePricing;
    } catch (err) {
      return { available: false, reason: `unparseable response: ${String(err)}` };
    }

    const rate = toNumber(data.baseExchangeRate);
    if (!usable(rate)) {
      return {
        available: false,
        reason: `no usable baseExchangeRate for ${corridor.id}`,
        raw: data,
      };
    }

    const fee = toNumber(data.baseFeeAmount);
    if (fee === null || fee < 0) {
      return { available: false, reason: `no usable baseFeeAmount for ${corridor.id}`, raw: data };
    }

    // Sendwave expresses any percentage component in basis points.
    const bps = data.baseFeeRateBps;
    if (bps !== undefined && (typeof bps !== "number" || !Number.isFinite(bps) || bps < 0)) {
      return { available: false, reason: `unusable baseFeeRateBps for ${corridor.id}`, raw: data };
    }

    // Sendwave states `receiveAmount`, but it reflects the *effective* price —
    // promo campaigns included. We publish the standing (base) price, so the
    // stated figure is only usable when no campaign is in play. With one
    // active, fall back to computing from base rather than silently quoting a
    // new-customer promo as the standard rate.
    const campaigned = Array.isArray(data.campaignsApplied) && data.campaignsApplied.length > 0;
    const stated = typeof data.receiveAmount === "number" ? data.receiveAmount : null;

    return {
      available: true,
      fx_rate: rate,
      fee_flat: fee,
      fee_pct: (bps ?? 0) / 10_000,
      raw: { ...data, sourceAmountUsd, quoted: "base (promotional campaigns excluded)" },
      receive: campaigned ? null : stated,
      delivery: null, // Sendwave publishes no per-quote delivery estimate here
    };
  },
};
