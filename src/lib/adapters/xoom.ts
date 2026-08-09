// Xoom (PayPal) adapter — the guest calculator on xoom.com's public corridor
// pages (spec §4).
//
// Investigated 2026-08-09. The page hands every anonymous visitor a CSRF token
// and the calculator then posts:
//     POST https://www.xoom.com/wapi/guest-app/remittance
//     { CSRF, variables: { sourceCurrency, destinationCountry,
//                          destinationCurrency, amount, target: "SEND_AMOUNT" } }
// So we do exactly that: load the public page, take the token it gives us, and
// ask the same question. No login, no account. `Origin` and `Referer` are sent
// because they are true — we really did just load that page — and the
// User-Agent stays our own; we do not pretend to be a browser.
//
// FEE MODEL: Xoom ADDS its fee on top. Every payment option on a corridor
// reports the same `receiveAmount` (= amount × rate) and differs only in
// `feeAmount`. So its stated receive figure describes a spend of amount + fee.
// We publish it only when the fee is zero; otherwise the board computes
// (amount − fee) × rate, which holds the total spend at the amount the user
// actually typed. See types.ts.
//
// Read-only pricing. No funds, no credentials (spec §7).

import type { AdapterResult, Corridor, QuoteAdapter } from "./types";
import { KORIDO_UA, destCountry, toNumber, usable } from "./shared";

const QUOTE_URL = "https://www.xoom.com/wapi/guest-app/remittance";

// Xoom's public corridor pages, which is where the CSRF token comes from.
const CORRIDOR_PAGES: Record<string, string> = {
  NG: "https://www.xoom.com/nigeria/send-money",
  GH: "https://www.xoom.com/ghana/send-money",
  KE: "https://www.xoom.com/kenya/send-money",
};

// Funding methods an ordinary US sender can actually use. CRYPTO_PYUSD and
// PAYPAL_BALANCE are excluded: both presuppose an already-funded PayPal or
// stablecoin balance, so quoting them would flatter Xoom against providers
// priced for someone paying from a bank account or card.
const CONSUMER_PAYMENT_TYPES = new Set(["ACH", "DEBIT_CARD", "CREDIT_CARD"]);

interface XoomPricing {
  disbursementType?: string;
  paymentType?: { type?: string };
  validations?: unknown[];
  fxRate?: { rate?: string };
  feeAmount?: { rawValue?: string };
  receiveAmount?: { rawValue?: string };
}

interface XoomResponse {
  quote?: { pricing?: XoomPricing[] };
}

interface Priced {
  option: XoomPricing;
  rate: number;
  fee: number;
  /** What lands if the sender spends exactly `amount` in total. */
  netReceive: number;
}

/**
 * Picks the option that delivers the most money for a fixed total spend.
 *
 * Xoom quotes several disbursement types (bank deposit, mobile wallet, cash
 * pickup) at genuinely different rates — on US→NG at $200 a deposit rate of
 * 1354.24 beats cash pickup's 1327.15 — and several funding methods at
 * different fees. Ranking on rate alone would pick a route the fee then makes
 * worse, which is the same mistake the Wise adapter originally made.
 */
export function pickPricing(pricing: XoomPricing[], amount: number): Priced | null {
  let best: Priced | null = null;

  for (const option of pricing) {
    if (Array.isArray(option.validations) && option.validations.length > 0) continue;
    const type = option.paymentType?.type;
    if (typeof type !== "string" || !CONSUMER_PAYMENT_TYPES.has(type)) continue;

    const rate = toNumber(option.fxRate?.rate);
    const fee = toNumber(option.feeAmount?.rawValue);
    if (!usable(rate) || fee === null || fee < 0) continue;

    const netReceive = Math.max(0, (amount - fee) * rate);
    if (!best || netReceive > best.netReceive) best = { option, rate, fee, netReceive };
  }

  return best;
}

export const xoomAdapter: QuoteAdapter = {
  providerId: "xoom",

  async fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl: typeof fetch = fetch
  ): Promise<AdapterResult> {
    const dest = destCountry(corridor);
    if (!dest) {
      return { available: false, reason: `cannot derive destination country from "${corridor.id}"` };
    }
    const page = CORRIDOR_PAGES[dest];
    if (!page) {
      return { available: false, reason: `no Xoom corridor page known for ${dest}` };
    }

    // Step 1: the public page, for the CSRF token and cookies it issues.
    let csrf: string | undefined;
    let cookieHeader = "";
    try {
      const res = await fetchImpl(page, { headers: { "User-Agent": KORIDO_UA }, redirect: "follow" });
      if (!res.ok) {
        return { available: false, reason: `HTTP ${res.status} loading the Xoom ${dest} page` };
      }
      const html = await res.text();
      cookieHeader = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
      csrf = (html.match(/\\?"csrf\\?":\\?"([A-Za-z0-9_-]+)\\?"/) ?? [])[1];
    } catch (err) {
      return { available: false, reason: `network error loading Xoom page: ${String(err)}` };
    }

    if (!csrf) {
      return { available: false, reason: "no CSRF token in the Xoom page — layout changed" };
    }

    // Step 2: the quote, exactly as the page's own calculator asks for it.
    let res: Response;
    try {
      res = await fetchImpl(QUOTE_URL, {
        method: "POST",
        headers: {
          "User-Agent": KORIDO_UA,
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.xoom.com",
          Referer: page,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({
          CSRF: csrf,
          variables: {
            sourceCurrency: "USD",
            destinationCountry: dest,
            destinationCurrency: corridor.dest_currency,
            amount: String(sourceAmountUsd),
            target: "SEND_AMOUNT",
          },
        }),
      });
    } catch (err) {
      return { available: false, reason: `network error: ${String(err)}` };
    }

    if (!res.ok) {
      return { available: false, reason: `HTTP ${res.status} for USD→${corridor.dest_currency}` };
    }

    let data: XoomResponse;
    try {
      data = (await res.json()) as XoomResponse;
    } catch (err) {
      return { available: false, reason: `unparseable response: ${String(err)}` };
    }

    const pricing = data.quote?.pricing;
    if (!Array.isArray(pricing) || pricing.length === 0) {
      return { available: false, reason: `no pricing options for ${corridor.id}`, raw: data };
    }

    const best = pickPricing(pricing, sourceAmountUsd);
    if (!best) {
      return {
        available: false,
        reason: `no consumer-usable payment option for ${corridor.id}`,
        raw: data,
      };
    }

    const statedReceive = toNumber(best.option.receiveAmount?.rawValue);

    return {
      available: true,
      fx_rate: best.rate,
      fee_flat: best.fee,
      fee_pct: 0,
      raw: {
        chosen: {
          disbursementType: best.option.disbursementType,
          paymentType: best.option.paymentType?.type,
          fxRate: best.option.fxRate,
          feeAmount: best.option.feeAmount,
          receiveAmount: best.option.receiveAmount,
        },
        optionCount: pricing.length,
        sourceAmountUsd,
        fee_model: "added on top of the send amount",
      },
      pay_in: best.option.paymentType?.type ?? null,
      // Only publishable when the fee is zero — otherwise Xoom's figure assumes
      // a spend of amount + fee. See the fee-model note above.
      receive: best.fee === 0 && statedReceive !== null ? statedReceive : null,
      delivery: null, // Xoom publishes no per-quote delivery estimate here
    };
  },
};
