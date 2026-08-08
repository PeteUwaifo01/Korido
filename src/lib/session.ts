import { createHash } from "crypto";

// Spec §7: session identifiers are salted-hashed; raw IPs are not retained.
// The hash lets us count distinct sessions and de-dupe clicks without ever
// storing an address. Rotating CLICK_HASH_SALT invalidates linkability.

export function sessionHash(ip: string | null, userAgent: string | null): string {
  const salt = process.env.CLICK_HASH_SALT;
  if (!salt) throw new Error("Missing CLICK_HASH_SALT");
  return createHash("sha256")
    .update(`${salt}|${ip ?? "unknown"}|${userAgent ?? "unknown"}`)
    .digest("hex");
}

export function clientIpFrom(headers: Headers): string | null {
  // Every mainstream host sets x-forwarded-for; take the first hop.
  // Used transiently to build the salted hash, never stored.
  const fwd = headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}
