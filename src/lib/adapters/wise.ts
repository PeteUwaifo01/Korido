// Wise adapter — public unauthenticated quote endpoint (spec §4: "Wise: public API").
//
// POST https://api.wise.com/v3/quotes
//   { sourceCurrency: "USD", targetCurrency, sourceAmount }
//
// Per Wise docs these quotes are display/estimation only and cannot create
// transfers — which is exactly the perimeter rule we want (spec §7: no feature
// may accept, hold, or transmit funds). This adapter reads prices; nothing more.

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";
import { KORIDO_UA as UA } from "./shared";

const ENDPOINT = "https://api.wise.com/v3/quotes";

interface WisePaymentOption {
  disabled?: boolean;
  payIn?: string;
  payOut?: string;
  fee?: { total?: number };
  targetAmount?: number;
  sourceAmount?: number;
}

// Pay-in methods a US consumer sender can actually use. Business-card and
// European-card options appear in the payload but are not routes our audience
// takes, so they must not win the "cheapest" contest by accident.
const CONSUMER_PAY_INS = new Set([
  "BANK_TRANSFER",           // US wire / ACH
  "DIRECT_DEBIT",
  "DEBIT",
  "VISA_DEBIT_OR_PREPAID",
  "MC_DEBIT_OR_PREPAID",
  "MAESTRO",
  "CARD",
  "CREDIT",
  "VISA_CREDIT",
  "MC_CREDIT",
  "APPLE_PAY",
]);

interface WiseQuoteResponse {
  rate?: number;
  sourceAmount?: number;
  paymentOptions?: WisePaymentOption[];
}

/**
 * Picks the payment option a comparison should show: the cheapest *enabled*
 * consumer pay-in method.
 *
 * Session 2 correction — the earlier rule preferred `payIn: "BANK_TRANSFER"`
 * on the assumption that card pay-in is always dearer. Live payloads disprove
 * that on these corridors: for USD→NGN at $200, BANK_TRANSFER (a US wire) cost
 * $8.12 while DEBIT cost $4.47. Pinning to the wire overstated Wise's cost by
 * ~45% and would have mis-ranked it against zero-fee providers. Accuracy is a
 * compliance control (spec §4), so we quote the best price a US consumer can
 * actually get, and record which method that was in `raw` for audit.
 *
 * Ties break toward BANK_TRANSFER so the choice is deterministic across runs.
 */
function pickOption(options: WisePaymentOption[]): WisePaymentOption | null {
  const enabled = options.filter(
    (o) =>
      !o.disabled &&
      typeof o.fee?.total === "number" &&
      typeof o.payIn === "string" &&
      CONSUMER_PAY_INS.has(o.payIn)
  );
  if (enabled.length === 0) return null;
  return enabled.reduce((best, o) => {
    if (o.fee!.total! < best.fee!.total!) return o;
    if (o.fee!.total! === best.fee!.total! && o.payIn === "BANK_TRANSFER") return o;
    return best;
  });
}

export const wiseAdapter: QuoteAdapter = {
  providerId: "wise",

  async fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl: typeof fetch = fetch
  ): Promise<AdapterResult> {
    let res: Response;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({
          sourceCurrency: "USD",
          targetCurrency: corridor.dest_currency,
          sourceAmount: sourceAmountUsd,
        }),
      });
    } catch (err) {
      return { available: false, reason: `network error: ${String(err)}` };
    }

    if (!res.ok) {
      // 422 is how Wise reports an unsupported route (e.g. if a corridor is
      // paused). Treated as "temporarily unavailable", never as a zero rate.
      const body = await res.text().catch(() => "");
      return {
        available: false,
        reason: `HTTP ${res.status} for USD→${corridor.dest_currency}`,
        raw: body.slice(0, 2000),
      };
    }

    const data = (await res.json()) as WiseQuoteResponse;
    const option = data.paymentOptions ? pickOption(data.paymentOptions) : null;

    if (typeof data.rate !== "number" || !option) {
      return {
        available: false,
        reason: `no usable payment option for USD→${corridor.dest_currency}`,
        raw: data,
      };
    }

    return {
      available: true,
      fx_rate: data.rate,
      fee_flat: option.fee!.total!, // total observed fee at this amount
      fee_pct: 0,                   // Wise reports a single total; pct folded in
      raw: {
        rate: data.rate,
        chosen: { payIn: option.payIn, payOut: option.payOut, fee: option.fee, targetAmount: option.targetAmount },
        optionCount: data.paymentOptions?.length ?? 0,
      },
      pay_in: option.payIn ?? null,
    };
  },
};
