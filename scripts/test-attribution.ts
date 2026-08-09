// Run: npx tsx scripts/test-attribution.ts
//
// The /go/ redirect is the only machinery that earns anything, and its failure
// mode is silent — a link missing {subid} still redirects and still pays, but
// the commission can never be traced back to a corridor or page. These tests
// pin that shut.

import {
  buildDestination,
  validateAffiliateUrl,
  SUBID_PLACEHOLDER,
  UNATTRIBUTED,
} from "../src/lib/attribution";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

const HOME = "https://wise.com";
const CLICK = "3f2b9c10-8d4e-4a77-9f22-7c1e5a0b6d84";

console.log("Destination building");
check(
  "substitutes the click id into the network's slot",
  buildDestination(`https://track.flexoffers.com/x?subid1=${SUBID_PLACEHOLDER}`, HOME, CLICK) ===
    `https://track.flexoffers.com/x?subid1=${CLICK}`
);
check(
  "substitutes every occurrence, not just the first",
  buildDestination(
    `https://t.example.com/a?s=${SUBID_PLACEHOLDER}&t=${SUBID_PLACEHOLDER}`,
    HOME,
    CLICK
  ) === `https://t.example.com/a?s=${CLICK}&t=${CLICK}`
);
check(
  "falls back to the provider homepage before approval",
  buildDestination(null, HOME, CLICK) === HOME
);
check("empty affiliate_url also falls back", buildDestination("", HOME, CLICK) === HOME);
check(
  "a failed click log still redirects, flagged unattributed",
  buildDestination(`https://t.example.com/a?s=${SUBID_PLACEHOLDER}`, HOME, UNATTRIBUTED) ===
    `https://t.example.com/a?s=${UNATTRIBUTED}`
);
check(
  "the substituted value is URL-encoded, so it cannot inject extra parameters",
  buildDestination(`https://t.example.com/a?s=${SUBID_PLACEHOLDER}`, HOME, "abc&evil=1") ===
    "https://t.example.com/a?s=abc%26evil%3D1"
);

console.log("\nRefusing links that would silently lose attribution");
{
  const bad = validateAffiliateUrl("https://track.flexoffers.com/x?aff=123");
  check("no {subid} placeholder → rejected", bad.ok === false, bad);
  check(
    "and the reason explains the silent failure",
    bad.ok === false && bad.reason.includes("unattributable"),
    bad
  );
}
check(
  "http is rejected — clicks must not leak over plaintext",
  validateAffiliateUrl(`http://track.example.com/x?s=${SUBID_PLACEHOLDER}`).ok === false
);
check("garbage is rejected", validateAffiliateUrl("not a url").ok === false);
check("empty is rejected", validateAffiliateUrl("   ").ok === false);
{
  const good = validateAffiliateUrl(`  https://track.impact.com/c/1?subId1=${SUBID_PLACEHOLDER}  `);
  check("a correct link is accepted", good.ok === true, good);
  check(
    "and stored trimmed",
    good.ok === true && good.url === `https://track.impact.com/c/1?subId1=${SUBID_PLACEHOLDER}`,
    good
  );
}

if (failures > 0) process.exit(1);
console.log("\nAll attribution tests passed.");
