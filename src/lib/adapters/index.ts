import { wiseAdapter } from "./wise";
import type { QuoteAdapter } from "./types";

// Scraped adapters (spec §4) get added here as they're built —
// LemFi / Sendwave / Taptap Send calculators, low frequency, honest UA.
export const ADAPTERS: Record<string, QuoteAdapter> = {
  [wiseAdapter.providerId]: wiseAdapter,
};
