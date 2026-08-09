// Affiliate link handling (spec §5).
//
// Networks hand you a tracking URL containing a slot for your own sub-ID, e.g.
//   https://track.flexoffers.com/...&subid1={subid}
// We substitute the click UUID into that slot, and the weekly reconciliation
// job joins the network's conversion report back on it.
//
// The failure this module exists to prevent is silent: an affiliate URL saved
// WITHOUT a {subid} placeholder still redirects perfectly and still earns
// commission — but every conversion comes back unattributable, so we can never
// tell which corridor, provider or page actually earns. That looks like "no
// conversions" rather than like a bug, which is the worst way to be wrong.
//
// Nothing here touches money. It builds a URL and hands the user over.

export const SUBID_PLACEHOLDER = "{subid}";

/** Marker used when a click could not be logged, so gaps are visible in reports. */
export const UNATTRIBUTED = "unattributed";

export interface AffiliateUrlProblem {
  ok: false;
  reason: string;
}
export interface AffiliateUrlOk {
  ok: true;
  /** Normalised URL to store. */
  url: string;
}

/**
 * Checks an affiliate URL before it is stored. Called by the admin script so a
 * bad link is rejected at entry rather than discovered months later in a
 * reconciliation that cannot be reconciled.
 */
export function validateAffiliateUrl(raw: string): AffiliateUrlOk | AffiliateUrlProblem {
  const url = raw.trim();
  if (url === "") return { ok: false, reason: "empty" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `must be https, got ${parsed.protocol}` };
  }

  if (!url.includes(SUBID_PLACEHOLDER)) {
    return {
      ok: false,
      reason:
        `missing the ${SUBID_PLACEHOLDER} placeholder — the link would still work and still ` +
        `earn, but every conversion would come back unattributable`,
    };
  }

  return { ok: true, url };
}

/**
 * Where /go/{offerId} sends the user.
 *
 * Falls back to the provider's own homepage while `affiliate_url` is null —
 * before network approval the CTA must still take people somewhere useful.
 * A failed click insert yields UNATTRIBUTED rather than blocking the redirect:
 * losing attribution is a reporting gap, stranding the user is a broken site.
 */
export function buildDestination(
  affiliateUrl: string | null | undefined,
  homepage: string,
  subid: string
): string {
  if (!affiliateUrl) return homepage;
  return affiliateUrl.replaceAll(SUBID_PLACEHOLDER, encodeURIComponent(subid));
}
