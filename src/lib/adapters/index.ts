import { wiseAdapter } from "./wise";
import { lemfiAdapter } from "./lemfi";
import { sendwaveAdapter } from "./sendwave";
import { taptapAdapter } from "./taptap";
import { xoomAdapter } from "./xoom";
import type { QuoteAdapter } from "./types";

// Providers seeded without an adapter (remitly, worldremit, xe) simply produce
// no quotes: the collector skips them and the board's staleness guard shows
// "temporarily unavailable" rather than an empty or invented row.
export const ADAPTERS: Record<string, QuoteAdapter> = {
  [wiseAdapter.providerId]: wiseAdapter,
  [lemfiAdapter.providerId]: lemfiAdapter,
  [sendwaveAdapter.providerId]: sendwaveAdapter,
  [taptapAdapter.providerId]: taptapAdapter,
  [xoomAdapter.providerId]: xoomAdapter,
};
