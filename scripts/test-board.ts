// Run: npx tsx scripts/test-board.ts
//
// The provider board's publishing rules (spec §4). The staleness guard is a
// compliance control, so it gets the same treatment as an adapter: prove that
// old numbers never render as current, and that a missing quote degrades to
// "temporarily unavailable" rather than to a zero or a blank row.

import {
  buildBoard,
  freshestQuotes,
  isFresh,
  receiveAmount,
  timeAgo,
  totalFee,
  STALE_AFTER_MS,
  type OfferRow,
  type QuoteRow,
} from "../src/lib/board";

const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

const offers: OfferRow[] = [
  { id: 1, providerName: "LemFi", supported: true },
  { id: 2, providerName: "Wise", supported: true },
  { id: 3, providerName: "Taptap Send", supported: true },
  { id: 4, providerName: "Xe", supported: true },
];

function q(offer_id: number, msAgo: number, fx_rate: number, fee_flat = 0, fee_pct = 0): QuoteRow {
  return { offer_id, collected_at: at(msAgo), fx_rate, fee_flat, fee_pct };
}

console.log("Staleness guard");
check("a 10-minute-old quote is fresh", isFresh(at(10 * MIN), NOW));
check("a 2h59m-old quote is fresh", isFresh(at(STALE_AFTER_MS - MIN), NOW));
check("a 3h01m-old quote is stale", !isFresh(at(STALE_AFTER_MS + MIN), NOW));
check("a future-dated quote is not treated as fresh", !isFresh(at(-2 * HOUR), NOW));
check("an unparseable timestamp is not fresh", !isFresh("not-a-date", NOW));

console.log("\nFreshest quote per offer");
const picked = freshestQuotes(
  [q(1, 90 * MIN, 1300), q(1, 10 * MIN, 1382), q(2, 4 * HOUR, 9999)],
  NOW
);
check("keeps the newest fresh quote", picked.get(1)?.fx_rate === 1382, picked.get(1));
check("drops an offer whose only quote is stale", picked.get(2) === undefined);

console.log("\nReceive amount");
check(
  "flat fee is deducted before conversion",
  receiveAmount(q(1, 0, 1000, 5), 200) === (200 - 5) * 1000
);
check(
  "percentage fee scales with the amount",
  receiveAmount(q(1, 0, 1000, 0, 0.01), 200) === (200 - 2) * 1000
);
check("combined flat + pct fee", totalFee(q(1, 0, 1000, 1.5, 0.01), 200) === 3.5);
check("a fee larger than the amount floors at zero, never negative",
  receiveAmount(q(1, 0, 1000, 500), 200) === 0);
check("a zero rate yields no publishable figure", receiveAmount(q(1, 0, 0), 200) === null);
check("a negative rate yields no publishable figure", receiveAmount(q(1, 0, -5), 200) === null);
check("a null rate yields no publishable figure",
  receiveAmount({ offer_id: 1, collected_at: at(0), fx_rate: null, fee_flat: 0, fee_pct: 0 }, 200) === null);

console.log("\nProvider-stated figures beat our arithmetic");
check(
  "uses the provider's stated receive amount when they publish one",
  receiveAmount({ ...q(1, 0, 1388.61, 4.47), receive: 271515.42 }, 200) === 271515.42
);
check(
  "computes only when the provider states nothing",
  receiveAmount({ ...q(1, 0, 1000, 5), receive: null }, 200) === (200 - 5) * 1000
);
check(
  "a nonsensical stated figure is ignored rather than published",
  receiveAmount({ ...q(1, 0, 1000, 5), receive: -1 }, 200) === (200 - 5) * 1000
);
{
  const withDelivery = buildBoard(
    [offers[1]],
    [{ ...q(2, 5 * MIN, 1388.61, 4.47), delivery: "in 30 minutes" }],
    200,
    NOW
  );
  const row = withDelivery.rows[0];
  check("carries the provider's own delivery wording", row.available && row.delivery === "in 30 minutes", row);
}
{
  const noDelivery = buildBoard([offers[0]], [q(1, 5 * MIN, 1376)], 200, NOW);
  const row = noDelivery.rows[0];
  check("no invented speed when the provider states none", row.available && row.delivery === null, row);
}

console.log("\nBoard assembly");
const board = buildBoard(
  offers,
  [
    q(1, 12 * MIN, 1382, 0),      // LemFi   → 276,400
    q(2, 30 * MIN, 1388.61, 4.47), // Wise    → 271,514
    q(3, 5 * MIN, 1383, 0),       // Taptap  → 276,600  (best)
    q(4, 5 * HOUR, 1400, 0),      // Xe      → stale, must not appear
  ],
  200,
  NOW
);
check("best row is the highest receive amount", board.best?.providerName === "Taptap Send", board.best);
check("rows are sorted by receive amount descending",
  board.rows.slice(0, 3).map((r) => r.providerName).join(",") === "Taptap Send,LemFi,Wise",
  board.rows.map((r) => r.providerName));
check("the stale provider sinks to the bottom as unavailable",
  board.rows[3].providerName === "Xe" && board.rows[3].available === false, board.rows[3]);
check("stale provider carries no numbers at all",
  !Object.prototype.hasOwnProperty.call(board.rows[3], "receive"), board.rows[3]);
check("savings vs worst is best minus worst available",
  Math.round(board.savingsVsWorst ?? 0) === Math.round(276600 - (200 - 4.47) * 1388.61),
  board.savingsVsWorst);
check("collectedAt reports the newest published quote",
  board.collectedAt === at(5 * MIN), board.collectedAt);
check("board is not flagged all-unavailable", board.allUnavailable === false);

console.log("\n\"Not covered\" is not the same claim as \"we tried and failed\"");
{
  const mixed = buildBoard(
    [
      { id: 1, providerName: "LemFi", supported: true },
      { id: 9, providerName: "Remitly", supported: false },
      { id: 2, providerName: "Wise", supported: true },
    ],
    [q(1, 5 * MIN, 1376)], // Wise covered but priceless; Remitly never asked
    200,
    NOW
  );
  const remitly = mixed.rows.find((r) => r.offerId === 9)!;
  const wise = mixed.rows.find((r) => r.offerId === 2)!;
  check("a provider with no adapter reads as unsupported",
    !remitly.available && remitly.reason === "unsupported", remitly);
  check("a covered provider with no price reads as no-price",
    !wise.available && wise.reason === "no-price", wise);
  check("uncovered providers sort last, below covered-but-unpriced",
    mixed.rows[mixed.rows.length - 1].offerId === 9,
    mixed.rows.map((r) => r.offerId));
}

console.log("\nAll-stale board");
const stale = buildBoard(offers, [q(1, 4 * HOUR, 1382), q(2, 9 * HOUR, 1388)], 200, NOW);
check("every row unavailable when nothing is fresh", stale.allUnavailable === true);
check("no best row", stale.best === null);
check("no savings line", stale.savingsVsWorst === null);
check("no collection timestamp to advertise", stale.collectedAt === null);
check("still renders one row per provider", stale.rows.length === offers.length);

console.log("\nSingle available provider");
const solo = buildBoard(offers, [q(1, 5 * MIN, 1382)], 200, NOW);
check("best is set", solo.best?.providerName === "LemFi");
check("no savings claim when there is nothing to compare against", solo.savingsVsWorst === null);

console.log("\ntimeAgo");
check("minutes", timeAgo(at(4 * MIN), NOW) === "4 min ago");
check("under a minute reads 'just now'", timeAgo(at(20_000), NOW) === "just now");
check("whole hours", timeAgo(at(2 * HOUR), NOW) === "2 hr ago");
check("hours and minutes", timeAgo(at(2 * HOUR + 10 * MIN), NOW) === "2 hr 10 min ago");

if (failures > 0) process.exit(1);
console.log("\nAll board tests passed.");
