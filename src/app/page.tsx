import { supabasePublic } from "@/lib/supabase-public";
import { MID_RATE_SOURCE } from "@/lib/fx/mid-rates";
import { fetchLiveQuotes, type LiveOffer } from "@/lib/live-quotes";
import {
  buildBoard,
  isFresh,
  timeAgo,
  REFERENCE_AMOUNT_USD,
  type Board,
  type OfferRow,
  type QuoteRow,
} from "@/lib/board";

// Provider board for the send vertical (spec §1). Server component reading
// through the anon key — public read policies exist on the catalog, quotes and
// mid_rates tables, and nothing user-adjacent is reachable with that key.
//
// Corridor and amount live in the URL rather than client state, so the page
// stays a server component, works without JavaScript, and every view is a
// shareable link (which the §1 WhatsApp rate ticket will want anyway).

export const dynamic = "force-dynamic";

const DEFAULT_CORRIDOR = "US-NG"; // flagship (spec §1)
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50_000;

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
};

interface CorridorRow {
  id: string;
  dest_country: string;
  dest_currency: string;
  dest_symbol: string;
}

function flagOf(iso: string): string {
  return String.fromCodePoint(
    ...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

function parseAmount(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return REFERENCE_AMOUNT_USD;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(n * 100) / 100));
}

const money = (n: number, dp = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: dp, minimumFractionDigits: 0 }).format(n);

interface BoardData {
  corridors: CorridorRow[];
  corridor: CorridorRow | null;
  board: Board | null;
  midRate: { rate: number; collected_at: string } | null;
  /** How many rows fell back to a collected quote because the provider did not
   *  answer just now. 0 means everything on the page is live. */
  fallbackCount: number;
  failed: boolean;
}

async function loadBoard(corridorId: string, amount: number, now: number): Promise<BoardData> {
  const empty: BoardData = {
    corridors: [],
    corridor: null,
    board: null,
    midRate: null,
    fallbackCount: 0,
    failed: true,
  };

  let db;
  try {
    db = supabasePublic();
  } catch {
    // No Supabase configuration yet — render the unavailable state rather than
    // a 500, and never a placeholder number.
    return empty;
  }

  const { data: corridors, error: corridorErr } = await db
    .from("corridors")
    .select("id, dest_country, dest_currency, dest_symbol")
    .eq("active", true)
    .order("id");

  if (corridorErr || !corridors || corridors.length === 0) return empty;

  const list = corridors as unknown as CorridorRow[];
  const corridor = list.find((c) => c.id === corridorId) ?? list[0];

  const { data: offers, error: offerErr } = await db
    .from("offers")
    .select("id, provider_id, providers(name)")
    .eq("vertical_id", "send")
    .eq("corridor_id", corridor.id)
    .eq("active", true);

  if (offerErr || !offers) {
    return { corridors: list, corridor, board: null, midRate: null, fallbackCount: 0, failed: true };
  }

  const offerRows: OfferRow[] = offers.map((o) => ({
    id: o.id as number,
    providerName:
      (o.providers as unknown as { name: string } | null)?.name ?? `Offer ${o.id}`,
  }));

  // ALWAYS quote live, at every amount. A comparison that tells you to go and
  // re-check each provider has saved you nothing — the numbers have to be as
  // current as the providers' own pages, or there is no reason to be here.
  // Results are cached briefly (see live-quotes.ts) so this costs the providers
  // very little.
  const liveOffers: LiveOffer[] = offers.map((o) => ({
    id: o.id as number,
    providerId: String(o.provider_id),
  }));
  const liveRows = await fetchLiveQuotes(
    liveOffers,
    {
      id: corridor.id,
      dest_currency: corridor.dest_currency,
      dest_country: corridor.dest_country,
    },
    amount,
    now
  );

  let quotes: QuoteRow[] = liveRows;
  const answered = new Set(liveRows.map((r) => r.offer_id));
  let fallbackCount = 0;

  // If a provider did not answer just now, the collected quote is a genuine
  // fallback — but ONLY at the reference amount, where it describes the same
  // question. It is never a fallback at other amounts: there it would be a
  // figure from a different send size, which is exactly the wrong number.
  // buildBoard keeps the newest quote per offer, so live always wins.
  if (amount === REFERENCE_AMOUNT_USD && answered.size < offerRows.length) {
    const since = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from("quotes")
      .select("offer_id, collected_at, fx_rate, fee_flat, fee_pct, raw")
      .in("offer_id", offerRows.filter((o) => !answered.has(o.id)).map((o) => o.id))
      .gte("collected_at", since)
      .order("collected_at", { ascending: false });

    // Lift the provider-stated figures back out of `raw` so the board can
    // prefer them over its own arithmetic.
    const stored: QuoteRow[] = (data ?? []).map((r) => {
      const raw = r.raw as { stated_receive?: number | null; stated_delivery?: string | null } | null;
      return {
        offer_id: r.offer_id as number,
        collected_at: r.collected_at as string,
        fx_rate: r.fx_rate as number | null,
        fee_flat: r.fee_flat as number | null,
        fee_pct: r.fee_pct as number | null,
        receive: raw?.stated_receive ?? null,
        delivery: raw?.stated_delivery ?? null,
      };
    });
    fallbackCount = new Set(stored.map((s) => s.offer_id)).size;
    quotes = [...liveRows, ...stored];
  }

  const { data: mid } = await db
    .from("mid_rates")
    .select("rate, collected_at")
    .eq("corridor_id", corridor.id)
    .order("collected_at", { ascending: false })
    .limit(1);

  const midRow = (mid?.[0] as { rate: number; collected_at: string } | undefined) ?? null;

  return {
    corridors: list,
    corridor,
    board: buildBoard(offerRows, quotes, amount, now),
    // The mid-market reference obeys the same staleness rule as everything else.
    midRate: midRow && isFresh(midRow.collected_at, now) ? midRow : null,
    fallbackCount,
    failed: false,
  };
}

export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const requested = Array.isArray(sp.c) ? sp.c[0] : sp.c;
  const amount = parseAmount(sp.amount);
  const now = Date.now();

  const { corridors, corridor, board, midRate, fallbackCount } = await loadBoard(
    requested ?? DEFAULT_CORRIDOR,
    amount,
    now
  );

  const symbol = corridor?.dest_symbol ?? "";
  const country = corridor ? COUNTRY_NAMES[corridor.dest_country] ?? corridor.dest_country : "";

  return (
    <>
      <header className="bg-ink text-paper px-5 pt-6 pb-6">
        <div className="mx-auto max-w-md">
          <div className="display text-2xl font-extrabold tracking-tight">
            Korido<span className="text-mango">.</span>
          </div>
          <p className="mt-1 text-sm text-[#BFD8CC]">
            Every way to send money home — compared.
          </p>

          {corridors.length > 0 && (
            <nav className="mt-4 flex gap-2" aria-label="Destination country">
              {corridors.map((c) => {
                const active = c.id === corridor?.id;
                return (
                  <a
                    key={c.id}
                    href={`/?c=${c.id}&amount=${amount}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex-1 rounded-xl px-2 py-2 text-center text-sm font-semibold border " +
                      (active
                        ? "bg-mango/15 text-mango border-mango"
                        : "bg-white/6 text-paper border-transparent")
                    }
                  >
                    {flagOf(c.dest_country)}{" "}
                    {COUNTRY_NAMES[c.dest_country] ?? c.dest_country}
                  </a>
                );
              })}
            </nav>
          )}

          <form method="get" action="/" className="mt-3 rounded-2xl bg-ink-soft p-4">
            <input type="hidden" name="c" value={corridor?.id ?? DEFAULT_CORRIDOR} />
            <label
              htmlFor="amount"
              className="text-xs font-semibold tracking-[0.08em] text-[#BFD8CC]"
            >
              YOU SEND (USD) · 🇺🇸 UNITED STATES
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="display text-3xl font-bold">$</span>
              <input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step="1"
                defaultValue={amount}
                aria-label="Amount to send in US dollars"
                className="display tnum w-full bg-transparent text-3xl font-bold text-paper outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-mango px-3 py-2 text-sm font-bold text-ink"
              >
                Update
              </button>
            </div>
          </form>

          {midRate && corridor && (
            <div className="mt-4">
              {/* Deliberately NOT "just now". collected_at is when we polled,
                  but the source publishes once a day — showing our poll time
                  would imply a freshness the number does not have. */}
              <div className="text-xs text-[#BFD8CC]">
                Mid-market reference · {MID_RATE_SOURCE.name}, published daily
              </div>
              <div className="display tnum text-xl font-bold">
                $1 = {symbol}
                {money(midRate.rate, 2)}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-14">
        <section aria-label="Money transfer comparison" className="pt-4">
          <h1 className="display text-lg font-bold">
            Sending ${money(amount, 2)} to {country}
          </h1>

          {/* Spec §7: affiliate disclosure adjacent to the outbound CTAs. */}
          <p className="mt-1 text-xs leading-relaxed text-[#6B7A73]">
            Korido is free for you. When you continue to a provider through these
            buttons they may pay us a commission — it never changes your rate or fee.
          </p>

          {board?.allUnavailable !== false ? (
            <div className="mt-4 rounded-2xl border border-line bg-white p-4">
              <div className="display font-bold">Rates temporarily unavailable</div>
              <p className="mt-1 text-sm text-[#6B7A73]">
                We only show quotes collected in the last 3 hours. Nothing that fresh
                is available right now, so we are not showing older numbers. Please
                check back shortly.
              </p>
            </div>
          ) : (
            <>
              {board.savingsVsWorst !== null && board.savingsVsWorst > 0 && board.best?.available && (
                <p className="mt-3 text-sm font-semibold text-leaf">
                  {board.best.providerName} delivers {symbol}
                  {money(board.savingsVsWorst)} more than the worst option here.
                </p>
              )}

              <ul className="mt-3">
                {board.rows.map((row, i) => (
                  <li
                    key={row.offerId}
                    className={
                      "mb-3 rounded-2xl bg-white p-4 border " +
                      (i === 0 && row.available
                        ? "border-mango shadow-[0_4px_16px_rgba(245,179,1,0.18)]"
                        : "border-line shadow-[0_1px_3px_rgba(10,59,46,0.05)]")
                    }
                  >
                    {i === 0 && row.available && (
                      <div className="mb-2 inline-block rounded-full bg-mango px-2 py-0.5 text-xs font-bold tracking-[0.06em] text-ink">
                        BEST RATE
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="display text-lg font-bold leading-tight">
                          {row.providerName}
                        </div>
                        {row.available ? (
                          <div className="mt-0.5 text-xs text-[#6B7A73]">
                            {/* Delivery appears only when the provider states
                                it for this amount — never a generic label. */}
                            {row.delivery ? `Arrives ${row.delivery} · ` : ""}fee $
                            {row.fee.toFixed(2)} · {symbol}
                            {money(row.rate, 2)}/$
                          </div>
                        ) : (
                          <div className="mt-0.5 text-xs text-[#6B7A73]">
                            No quote in the last 3 hours
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        {row.available ? (
                          <>
                            <div className="text-xs text-[#6B7A73]">They receive</div>
                            <div
                              className={
                                "display tnum text-xl font-extrabold " +
                                (i === 0 ? "text-leaf" : "text-ink")
                              }
                            >
                              {symbol}
                              {money(row.receive)}
                            </div>
                            <div className="text-xs text-[#8A968F]">
                              {timeAgo(row.collectedAt, now)}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm font-semibold text-[#8A968F]">
                            Temporarily
                            <br />
                            unavailable
                          </div>
                        )}
                      </div>
                    </div>

                    {row.available && (
                      <a
                        href={`/go/${row.offerId}?from=/`}
                        rel="sponsored nofollow noopener"
                        className={
                          "mt-3 flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold " +
                          (i === 0
                            ? "bg-leaf text-white"
                            : "border border-line bg-paper text-ink")
                        }
                      >
                        Continue with {row.providerName} →
                      </a>
                    )}
                  </li>
                ))}
              </ul>

              <p className="text-xs leading-relaxed text-[#8A968F]">
                Every provider above was asked for a real quote on{" "}
                <strong className="font-semibold">${money(amount, 2)} to {country}</strong>{" "}
                just now — the same question you would ask on their own site, at
                the same moment. Fees and delivery times change with the amount,
                so we never scale a price from a different one.
                {fallbackCount > 0 && (
                  <>
                    {" "}
                    {fallbackCount === 1 ? "One provider" : `${fallbackCount} providers`}{" "}
                    did not respond just now, so {fallbackCount === 1 ? "that row shows" : "those rows show"}{" "}
                    our last collected quote with the time it was taken.
                  </>
                )}
              </p>
            </>
          )}
        </section>

        <footer className="mt-10 text-xs leading-relaxed text-[#8A968F]">
          <p>
            Korido compares prices and links you to providers. We never take, hold, or
            move your money, and we never ask for card or bank details.
          </p>
          <p className="mt-2">
            Some links are affiliate links: if you sign up through them the provider may
            pay us a commission. It never changes your rate, fee, or delivery time.
          </p>
          <p className="mt-2">
            We quote every provider live and rank by what actually lands in the
            recipient&apos;s account — not by the headline rate, which can hide a
            fee that puts the best-looking option last. Where a provider states a
            figure themselves, we show theirs. Where they state nothing, we say
            nothing. Anything we cannot verify in the last 3 hours reads
            &ldquo;temporarily unavailable&rdquo; instead of showing you an old
            number. Mid-market reference:{" "}
            <a
              className="underline"
              href={MID_RATE_SOURCE.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {MID_RATE_SOURCE.attribution}
            </a>
            .
          </p>
        </footer>
      </main>
    </>
  );
}
