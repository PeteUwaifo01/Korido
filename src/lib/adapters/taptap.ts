// Taptap Send adapter — the same public endpoint their own marketing site's
// price calculator calls (spec §4: "scheduled scrape of public price
// calculators").
//
// Investigated 2026-08-08. The calculator on
// https://www.taptapsend.com/en/send-money-to/nigeria issues:
//     GET https://api.taptapsend.com/api/fxRates
//     headers: Appian-Version: web/2022-05-03.0, X-Device-Id: web,
//              X-Device-Model: web
// Those are the *website's* headers (device id is literally "web"), not a
// mobile-app identity, and the `Appian-Secret` in their script is null on
// production — it is only set on their staging host. So this is the public web
// surface, requested honestly with our own User-Agent bolted on.
// robots.txt (checked 2026-08-08) disallows nothing.
//
// One request returns every origin country and all its corridors, so a whole
// collection round costs a single call.
//
// Read-only pricing. No funds, no credentials (spec §7).

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";
import { KORIDO_UA, destCountry, toNumber, usable } from "./shared";

const ENDPOINT = "https://api.taptapsend.com/api/fxRates";
const HEADERS = {
  "User-Agent": KORIDO_UA,
  Accept: "application/json",
  "Appian-Version": "web/2022-05-03.0",
  "X-Device-Id": "web",
  "X-Device-Model": "web",
};

const ORIGIN_COUNTRY = "US"; // v1 is US-outbound only (spec §1)

interface TaptapTier {
  fee?: string;
  minValue?: string;
}

interface TaptapCorridor {
  isoCountryCode?: string;
  currency?: string;
  fxRate?: string;
  feeSchedule?: { type?: string; flatFee?: string; tiers?: TaptapTier[] };
}

interface TaptapResponse {
  availableCountries?: Array<{
    isoCountryCode?: string;
    currency?: string;
    corridors?: TaptapCorridor[];
  }>;
}

/**
 * Resolves Taptap's fee for a send amount.
 *
 * Returns `null` when the schedule is a shape we do not recognise — an
 * unrecognised fee model must surface as "unavailable", never as $0, or we
 * would silently publish a provider as cheaper than it is.
 *
 * Absent `feeSchedule` genuinely means no fee: Taptap markets these corridors
 * as fee-free and their payout-fee endpoint carries no US→NG/GH/KE entries.
 */
export function resolveFee(
  schedule: TaptapCorridor["feeSchedule"],
  sourceAmountUsd: number
): number | null {
  if (schedule === undefined || schedule === null) return 0;

  if (schedule.type === "standard") {
    const flat = toNumber(schedule.flatFee);
    return flat === null || flat < 0 ? null : flat;
  }

  if (schedule.type === "tiered") {
    if (!Array.isArray(schedule.tiers) || schedule.tiers.length === 0) return null;
    let best: { min: number; fee: number } | null = null;
    for (const tier of schedule.tiers) {
      const min = toNumber(tier.minValue);
      const fee = toNumber(tier.fee);
      if (min === null || fee === null || fee < 0) return null; // unparseable tier
      if (min <= sourceAmountUsd && (best === null || min > best.min)) best = { min, fee };
    }
    return best ? best.fee : null;
  }

  return null; // unknown fee model
}

export const taptapAdapter: QuoteAdapter = {
  providerId: "taptap",

  async fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl: typeof fetch = fetch
  ): Promise<AdapterResult> {
    const dest = destCountry(corridor);
    if (!dest) {
      return { available: false, reason: `cannot derive destination country from "${corridor.id}"` };
    }

    let res: Response;
    try {
      res = await fetchImpl(ENDPOINT, { headers: HEADERS });
    } catch (err) {
      return { available: false, reason: `network error: ${String(err)}` };
    }

    if (!res.ok) {
      return { available: false, reason: `HTTP ${res.status} from Taptap fxRates` };
    }

    let data: TaptapResponse;
    try {
      data = (await res.json()) as TaptapResponse;
    } catch (err) {
      return { available: false, reason: `unparseable response: ${String(err)}` };
    }

    const origin = data.availableCountries?.find((c) => c.isoCountryCode === ORIGIN_COUNTRY);
    if (!origin) {
      return { available: false, reason: `no ${ORIGIN_COUNTRY} origin in Taptap payload` };
    }

    const match = origin.corridors?.find(
      (c) => c.isoCountryCode === dest && c.currency === corridor.dest_currency
    );
    if (!match) {
      return {
        available: false,
        reason: `Taptap does not list ${ORIGIN_COUNTRY}→${dest} in ${corridor.dest_currency}`,
      };
    }

    const rate = toNumber(match.fxRate);
    if (!usable(rate)) {
      return { available: false, reason: `unusable fxRate for ${corridor.id}`, raw: match };
    }

    const fee = resolveFee(match.feeSchedule, sourceAmountUsd);
    if (fee === null) {
      return {
        available: false,
        reason: `unrecognised fee schedule for ${corridor.id}`,
        raw: match,
      };
    }

    return {
      available: true,
      fx_rate: rate,
      fee_flat: fee,
      fee_pct: 0,
      raw: { corridor: match, sourceAmountUsd },
    };
  },
};
