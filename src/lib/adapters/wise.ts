// Wise adapter — public unauthenticated quote endpoint (spec §4: "Wise: public API").
//
// POST https://api.wise.com/v3/quotes
//   { sourceCurrency: "USD", targetCurrency, sourceAmount }
//
// Per Wise docs these quotes are display/estimation only and cannot create
// transfers — which is exactly the perimeter rule we want (spec §7: no feature
// may accept, hold, or transmit funds). This adapter reads prices; nothing more.

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";

const ENDPOINT = "https://api.wise.com/v3/quotes";
const UA = "KoridoBot/1.0 (+https://korido.app; rate comparison; contact: ops@korido.app)";

interface WisePaymentOption {
  disabled?: boolean;
  payIn?: string;
  payOut?: string;
  fee?: { total?: number };
  targetAmount?: number;
  sourceAmount?: number;
}

interface WiseQuoteResponse {
  rate?: number;
  sourceAmount?: number;
  paymentOptions?: WisePaymentOption[];
}

/**
 * Picks the payment option a comparison should show: cheapest enabled
 * bank-transfer-in option (card pay-in carries a higher fee and would
 * overstate Wise's cost vs how remitters typically pay).
 */
function pickOption(options: WisePaymentOption[]): WisePaymentOption | null {
  const enabled = options.filter((o) => !o.disabled && typeof o.fee?.total === "number");
  if (enabled.length === 0) return null;
  const bank = enabled.filter((o) => o.payIn === "BANK_TRANSFER");
  const pool = bank.length > 0 ? bank : enabled;
  return pool.reduce((best, o) => (o.fee!.total! < best.fee!.total! ? o : best));
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
    };
  },
};
