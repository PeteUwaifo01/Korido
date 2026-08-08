// Mid-market rate source (spec §4: "mid-market rate every 15 min (open FX source)").
//
// Source: ExchangeRate-API's Open Access endpoint — https://open.er-api.com/v6/latest/USD
//   · No API key, no signup (free-tier stack rule).
//   · Terms (https://www.exchangerate-api.com/docs/free), checked 2026-08-08:
//     free for personal *and* commercial currency-conversion use, caching is
//     explicitly permitted, re-distribution of the feed is not, and visible
//     attribution is required on pages that display the rates. The board
//     renders that attribution; do not remove it.
//   · Covers NGN, GHS and KES (verified live 2026-08-08).
//   · Publishes ~once per day. Polling more often is harmless and keeps a
//     truthful observation log, but it does not make the number newer — see
//     SOURCE_MAX_AGE_HOURS below.
//
// This module reads prices. It moves no money and holds no credentials.

const ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const UA = "KoridoBot/1.0 (+https://korido.app; rate comparison; contact: ops@korido.app)";

// The source publishes daily. If its own "last update" is older than this, the
// feed itself has gone stale and we store nothing — a stale mid-market rate
// presented as current is exactly the failure the §4 staleness guard exists to
// prevent. Two days leaves room for one missed publish without false alarms.
const SOURCE_MAX_AGE_HOURS = 48;

export const MID_RATE_SOURCE = {
  name: "ExchangeRate-API",
  url: "https://www.exchangerate-api.com",
  attribution: "Rates By Exchange Rate API",
} as const;

export type MidRatesResult =
  | {
      available: true;
      /** Units of the quoted currency per 1 USD, keyed by uppercase ISO code. */
      rates: Record<string, number>;
      /** When the *source* last published, not when we fetched. */
      sourcePublishedAt: string;
    }
  | { available: false; reason: string };

interface OpenErApiResponse {
  result?: string;
  time_last_update_unix?: number;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

/**
 * Fetches USD mid-market rates. Any doubt about the payload returns
 * `available: false` with a reason — never a defaulted or guessed rate.
 *
 * `now` is injectable so the source-staleness branch is testable offline.
 */
export async function fetchMidRates(
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<MidRatesResult> {
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, { headers: { "User-Agent": UA } });
  } catch (err) {
    return { available: false, reason: `network error: ${String(err)}` };
  }

  if (!res.ok) {
    return { available: false, reason: `HTTP ${res.status} from ${MID_RATE_SOURCE.name}` };
  }

  let data: OpenErApiResponse;
  try {
    data = (await res.json()) as OpenErApiResponse;
  } catch (err) {
    return { available: false, reason: `unparseable response: ${String(err)}` };
  }

  if (data.result !== "success") {
    return { available: false, reason: `source reported result="${data.result ?? "missing"}"` };
  }

  if (!data.rates || typeof data.rates !== "object") {
    return { available: false, reason: "response carried no rates object" };
  }

  if (typeof data.time_last_update_unix !== "number") {
    return { available: false, reason: "response carried no publish timestamp" };
  }

  const ageHours = (now - data.time_last_update_unix * 1000) / 3_600_000;
  if (ageHours > SOURCE_MAX_AGE_HOURS || ageHours < -1) {
    return {
      available: false,
      reason: `source feed is stale: published ${ageHours.toFixed(1)}h ago`,
    };
  }

  // Keep only usable numbers. A currency missing here becomes an unavailable
  // corridor upstream rather than a zero.
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(data.rates)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code.toUpperCase()] = value;
    }
  }

  return {
    available: true,
    rates,
    sourcePublishedAt: new Date(data.time_last_update_unix * 1000).toISOString(),
  };
}
