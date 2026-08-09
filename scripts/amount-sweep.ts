// Run: npx tsx scripts/amount-sweep.ts
//
// Diagnostic, not a test. Asks every provider for a real quote at several send
// amounts and compares it against what the board would have *extrapolated* from
// the single $200 reference collection. Measures the size of the estimation
// error rather than assuming it is small.

import { wiseAdapter } from "../src/lib/adapters/wise";
import { lemfiAdapter } from "../src/lib/adapters/lemfi";
import { sendwaveAdapter } from "../src/lib/adapters/sendwave";
import { taptapAdapter } from "../src/lib/adapters/taptap";
import type { Corridor, QuoteAdapter } from "../src/lib/adapters/types";

const NG: Corridor = { id: "US-NG", dest_currency: "NGN", dest_country: "NG" };
const AMOUNTS = [200, 500, 1000, 2000, 5000];
const ADAPTERS: QuoteAdapter[] = [wiseAdapter, lemfiAdapter, sendwaveAdapter, taptapAdapter];

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

(async () => {
  console.log("USD→NGN. 'extrapolated' = what the board shows today from the $200 collection.\n");

  for (const adapter of ADAPTERS) {
    const base = await adapter.fetchQuote(NG, 200);
    if (!base.available) {
      console.log(`${adapter.providerId}: unavailable (${base.reason})\n`);
      continue;
    }
    console.log(`${adapter.providerId}  (at $200: rate ${base.fx_rate}, fee $${base.fee_flat}, pct ${base.fee_pct})`);
    console.log("  amount     actual rate     actual fee   actual receive   extrapolated   error");

    for (const amt of AMOUNTS) {
      const live = await adapter.fetchQuote(NG, amt);
      if (!live.available) {
        console.log(`  $${String(amt).padEnd(8)} unavailable (${live.reason})`);
        continue;
      }
      const actualFee = live.fee_flat + live.fee_pct * amt;
      const actualReceive = (amt - actualFee) * live.fx_rate;

      // What the board does today: reuse the $200 rate and fee model.
      const guessFee = base.fee_flat + base.fee_pct * amt;
      const guessReceive = (amt - guessFee) * base.fx_rate;

      const err = guessReceive - actualReceive;
      const pct = (err / actualReceive) * 100;
      console.log(
        `  $${String(amt).padEnd(8)} ${String(live.fx_rate).padEnd(15)} $${String(actualFee.toFixed(2)).padEnd(11)} ${fmt(actualReceive).padEnd(16)} ${fmt(guessReceive).padEnd(14)} ${err >= 0 ? "+" : ""}${fmt(err)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`
      );
    }
    console.log("");
  }
})();
