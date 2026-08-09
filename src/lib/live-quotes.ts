// Server-side only. Deliberately not marked with `server-only` (which Next
// aliases at build time and so cannot be resolved by the tsx test scripts) —
// unlike supabase-server.ts this module holds no secret, so an accidental
// client import would be a bundle-size and CORS problem, not a leak. It is
// imported solely by the board's server component.
import { ADAPTERS } from "./adapters";
import type { Corridor } from "./adapters/types";
import type { QuoteRow } from "./board";

// Live quotes for an amount we have not collected at.
//
// WHY THIS EXISTS. Quotes are collected once per round at a $200 reference
// amount (see the collect-quotes route). Reusing that snapshot for other
// amounts is not a rounding compromise — measured 2026-08-08 on USD→NGN, it
// inverts the ranking. Wise's fee scales ($4.47 at $200, $32.48 at $5,000) and
// Sendwave's rate improves above $750, so at $1,000 the extrapolated board put
// Wise first at ₦1,382,403 when it actually delivers ₦1,371,697 and finishes
// last. Badging the worst provider "BEST RATE" on a money page is the failure
// mode that ends the product, so away from the reference amount we ask the
// providers directly and publish only what they actually said.
//
// scripts/amount-sweep.ts re-runs that measurement against any provider.
//
// A provider that errors or times out is simply absent from the result, which
// renders as "temporarily unavailable". It must never fall back to the stored
// $200 figure — that is the very number we know to be wrong here.

const TIMEOUT_MS = 8_000;

// Short cache so a refresh, a shared link, or two visitors on the same amount
// do not each hit four providers. Deliberately brief: these are live prices.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  rows: QuoteRow[];
  at: number;
}
const cache = new Map<string, CacheEntry>();

export interface LiveOffer {
  id: number;
  providerId: string;
}

/** fetch with a hard ceiling, so one slow provider cannot hang the page. */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

export function clearLiveQuoteCache(): void {
  cache.clear();
}

export async function fetchLiveQuotes(
  offers: LiveOffer[],
  corridor: Corridor,
  amount: number,
  now: number = Date.now(),
  fetchImpl: typeof fetch = timedFetch
): Promise<QuoteRow[]> {
  const key = `${corridor.id}:${amount}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.rows;

  // In parallel: four sequential calls would put the user through ~4s of
  // waiting for no reason. The collector stays sequential — it is a background
  // job with no one watching, and gentler on the providers.
  const settled = await Promise.all(
    offers.map(async (offer): Promise<QuoteRow | null> => {
      const adapter = ADAPTERS[offer.providerId];
      if (!adapter) return null; // seeded provider with no adapter yet
      try {
        const quote = await adapter.fetchQuote(corridor, amount, fetchImpl);
        if (!quote.available) return null;
        return {
          offer_id: offer.id,
          collected_at: new Date(now).toISOString(),
          fx_rate: quote.fx_rate,
          fee_flat: quote.fee_flat,
          fee_pct: quote.fee_pct,
        };
      } catch {
        // Timeout or thrown error — unavailable, never a guess.
        return null;
      }
    })
  );

  const rows = settled.filter((r): r is QuoteRow => r !== null);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { rows, at: now });

  return rows;
}
