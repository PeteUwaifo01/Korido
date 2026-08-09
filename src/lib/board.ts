// Provider board assembly (spec §1 "amount-aware provider board", §4 staleness
// guard). Pure functions, no I/O, so the rules that decide whether a number is
// publishable are testable offline — see scripts/test-board.ts.
//
// The governing rule: "quotes older than 3h are hidden, provider row shows
// 'temporarily unavailable' instead of stale numbers. Accuracy is a compliance
// control, not a nicety."

export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/** Amount every quote is collected at (see the collect-quotes route). */
export const REFERENCE_AMOUNT_USD = 200;

export interface OfferRow {
  id: number;
  providerName: string;
}

export interface QuoteRow {
  offer_id: number;
  collected_at: string;
  fx_rate: number | null;
  fee_flat: number | null;
  fee_pct: number | null;
  /** Receive amount the provider stated for this exact amount, if they publish
   *  one. Always preferred over our arithmetic — see receiveAmount(). */
  receive?: number | null;
  /** The provider's own delivery wording. Null means they don't publish one,
   *  and we then show nothing rather than a guess. */
  delivery?: string | null;
}

export type BoardRow =
  | {
      offerId: number;
      providerName: string;
      /** The provider's own delivery wording, or null. Never invented. */
      delivery: string | null;
      available: true;
      rate: number;
      fee: number;
      receive: number;
      collectedAt: string;
    }
  | {
      offerId: number;
      providerName: string;
      delivery: null;
      available: false;
    };

export interface Board {
  rows: BoardRow[];
  /** Best available row, if any. */
  best: BoardRow | null;
  /** Extra destination currency the best row delivers over the worst one. */
  savingsVsWorst: number | null;
  /** Newest collection time among published rows — powers "as of X ago". */
  collectedAt: string | null;
  /** True when nothing is fresh enough to publish. */
  allUnavailable: boolean;
}

export function isFresh(collectedAt: string, now: number): boolean {
  const t = Date.parse(collectedAt);
  if (Number.isNaN(t)) return false;
  // A timestamp from the future means clock skew or bad data, not freshness.
  if (t > now + 60_000) return false;
  return now - t <= STALE_AFTER_MS;
}

/**
 * Newest quote per offer, keeping only quotes inside the freshness window.
 * A row with nothing fresh simply never appears in the map, which is what makes
 * it render as "temporarily unavailable" downstream.
 */
export function freshestQuotes(quotes: QuoteRow[], now: number): Map<number, QuoteRow> {
  const out = new Map<number, QuoteRow>();
  for (const q of quotes) {
    if (!isFresh(q.collected_at, now)) continue;
    const seen = out.get(q.offer_id);
    if (!seen || Date.parse(q.collected_at) > Date.parse(seen.collected_at)) {
      out.set(q.offer_id, q);
    }
  }
  return out;
}

/**
 * What the recipient gets for `amount`.
 *
 * If the provider published the figure themselves, use theirs — Wise states
 * `targetAmount` and Sendwave `receiveAmount`. Our arithmetic agrees with them
 * to a fraction of a naira today, but they are authoritative: any rounding or
 * pricing rule we don't know about is already baked into their number and not
 * into ours. We only compute when the provider states nothing (LemFi, Taptap),
 * which is what their own calculators do client-side anyway.
 */
export function receiveAmount(quote: QuoteRow, amount: number): number | null {
  if (typeof quote.receive === "number" && Number.isFinite(quote.receive) && quote.receive >= 0) {
    return quote.receive;
  }

  const { fx_rate, fee_flat, fee_pct } = quote;
  if (typeof fx_rate !== "number" || !Number.isFinite(fx_rate) || fx_rate <= 0) return null;
  const flat = typeof fee_flat === "number" && Number.isFinite(fee_flat) ? fee_flat : 0;
  const pct = typeof fee_pct === "number" && Number.isFinite(fee_pct) ? fee_pct : 0;
  if (flat < 0 || pct < 0) return null;
  const fee = flat + pct * amount;
  return Math.max(0, (amount - fee) * fx_rate);
}

export function totalFee(quote: QuoteRow, amount: number): number {
  const flat = typeof quote.fee_flat === "number" && Number.isFinite(quote.fee_flat) ? quote.fee_flat : 0;
  const pct = typeof quote.fee_pct === "number" && Number.isFinite(quote.fee_pct) ? quote.fee_pct : 0;
  return flat + pct * amount;
}

/**
 * Builds the ranked board. Available rows sort by receive amount descending;
 * unavailable rows fall to the bottom in stable provider order so the page does
 * not reshuffle around them.
 */
export function buildBoard(
  offers: OfferRow[],
  quotes: QuoteRow[],
  amount: number,
  now: number
): Board {
  const fresh = freshestQuotes(quotes, now);

  const rows: BoardRow[] = offers.map((offer) => {
    const q = fresh.get(offer.id);
    const receive = q ? receiveAmount(q, amount) : null;
    if (!q || receive === null) {
      return {
        offerId: offer.id,
        providerName: offer.providerName,
        delivery: null,
        available: false,
      };
    }
    return {
      offerId: offer.id,
      providerName: offer.providerName,
      // Only ever the provider's own words. `offers.speed_label` in the seed
      // data was invented and is deliberately not used: Wise's real estimate
      // is "in 30 minutes" at $200 but "by Mon" at $1,000, so a fixed label
      // per provider is wrong by roughly two days at larger amounts.
      delivery: q.delivery ?? null,
      available: true,
      rate: q.fx_rate as number,
      fee: totalFee(q, amount),
      receive,
      collectedAt: q.collected_at,
    };
  });

  const available = rows.filter((r): r is Extract<BoardRow, { available: true }> => r.available);
  available.sort((a, b) => b.receive - a.receive);
  const unavailable = rows.filter((r) => !r.available);

  const best = available[0] ?? null;
  const worst = available.length > 1 ? available[available.length - 1] : null;

  const collectedAt =
    available.length > 0
      ? available.reduce((newest, r) =>
          Date.parse(r.collectedAt) > Date.parse(newest.collectedAt) ? r : newest
        ).collectedAt
      : null;

  return {
    rows: [...available, ...unavailable],
    best,
    savingsVsWorst: best && worst ? best.receive - worst.receive : null,
    collectedAt,
    allUnavailable: available.length === 0,
  };
}

/** "4 min ago" / "2 hr 10 min ago". Used next to every published figure. */
export function timeAgo(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr ago` : `${hrs} hr ${rem} min ago`;
}
