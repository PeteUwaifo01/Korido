// Adapter contract (spec §4): one module per provider implementing
// fetchQuote(corridor, amount) -> { fx_rate, fee_flat, fee_pct }.
// Output mirrors the `quotes` table so the collector can insert rows 1:1.

export interface Corridor {
  id: string;            // 'US-NG'
  dest_currency: string; // 'NGN'
}

export type AdapterResult =
  | {
      available: true;
      fx_rate: number;   // dest currency per USD
      fee_flat: number;  // observed total fee for the quoted amount, USD
      fee_pct: number;   // percentage component when the provider exposes one
      raw: unknown;      // full provider payload, stored in quotes.raw for audit
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
