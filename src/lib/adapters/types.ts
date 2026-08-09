// Adapter contract (spec §4): one module per provider implementing
// fetchQuote(corridor, amount) -> { fx_rate, fee_flat, fee_pct }.
// Output mirrors the `quotes` table so the collector can insert rows 1:1.

export interface Corridor {
  id: string;             // 'US-NG'
  dest_currency: string;  // 'NGN'
  dest_country?: string;  // 'NG' — scraped calculators key on country, not currency
}

export type AdapterResult =
  | {
      available: true;
      fx_rate: number;   // dest currency per USD
      fee_flat: number;  // observed total fee for the quoted amount, USD
      fee_pct: number;   // percentage component when the provider exposes one
      raw: unknown;      // full provider payload, stored in quotes.raw for audit
      pay_in?: string | null; // funding method the quote assumes, when the provider exposes one

      // Figures the provider STATES rather than ones we derive. Prefer these
      // wherever they exist: if our arithmetic ever disagrees with the
      // provider's own number, the provider is right by definition.
      /**
       * Receive amount as published by the provider — but ONLY set this when it
       * corresponds to a total spend of exactly `sourceAmountUsd`.
       *
       * Providers use two different fee models:
       *   deducted — Wise: you pay the amount, they take the fee out of it, and
       *              the recipient gets (amount − fee) × rate.
       *   added    — Xoom, Sendwave: you pay amount + fee, and the recipient
       *              gets amount × rate.
       *
       * The board holds "what you pay" constant so providers are comparable, so
       * an added-fee provider's stated figure describes a bigger spend than the
       * user budgeted and must not be published. Leave this null whenever the
       * fee is non-zero under the "added" model and let the board compute.
       */
      receive?: number | null;
      /** The provider's own delivery estimate, verbatim ("in 30 minutes", "by Mon").
       *  Null when the provider does not publish one — we then say nothing rather
       *  than inventing a speed. */
      delivery?: string | null;
    }
  | {
      available: false;
      reason: string;    // e.g. corridor not served, HTTP error — logged, no row hidden behind stale data
      raw?: unknown;
    };

export interface QuoteAdapter {
  providerId: string;
  fetchQuote(
    corridor: Corridor,
    sourceAmountUsd: number,
    fetchImpl?: typeof fetch
  ): Promise<AdapterResult>;
}
