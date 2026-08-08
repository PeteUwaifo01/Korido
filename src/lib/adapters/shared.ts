import type { Corridor } from "./types";

// Shared bits for the scraped adapters (spec §4: "scheduled scrape of public
// price calculators — respect robots/ToS posture; low frequency; identifiable
// UA"). One honest User-Agent with contact details across every provider we
// call, so anyone reading their logs can find us and ask us to stop.
export const KORIDO_UA =
  "KoridoBot/1.0 (+https://korido.app; rate comparison; contact: ops@korido.app)";

/**
 * Destination ISO country for a corridor. Providers key their calculators by
 * country (`NG`), not currency, so we need both. Prefers the column from the
 * `corridors` table and falls back to the corridor id convention `US-NG`.
 */
export function destCountry(corridor: Corridor): string | null {
  if (corridor.dest_country) return corridor.dest_country.toUpperCase();
  const tail = corridor.id.split("-")[1];
  return tail && tail.length === 2 ? tail.toUpperCase() : null;
}

/** A rate or fee we are willing to publish. Anything else is "unavailable". */
export function usable(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Parses a provider's numeric string ("1376.05650"). Non-numeric → null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
