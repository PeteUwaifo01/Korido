import type { Metadata } from "next";
import Link from "next/link";
import { supabasePublic } from "@/lib/supabase-public";

// Top-up (spec §1 v1.1) as an added service and a traffic surface — NOT a
// comparison. That distinction governs the whole page.
//
// We publish NO airtime prices, because we have none we can verify. Rebtel is
// the only provider in this market whose pages are open to us at all, and even
// theirs only reveal prices after a recipient's phone number is submitted —
// any number we probed with would belong to a real person, sent to a third
// party on a schedule. So this page carries information we have checked (which
// operators each country supports, how top-up works) and refers onward. If
// price access ever arrives, the offer rows already exist and a board can be
// added here without restructuring.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Send airtime to Nigeria, Ghana and Kenya — Korido",
  description:
    "How to top up a mobile phone in Nigeria, Ghana or Kenya from the US: which networks are supported, what to check before you send, and where to do it.",
};

// Operators verified against Rebtel's own country pages, 2026-08-09.
const NETWORKS: Record<string, { name: string; flag: string; networks: string[] }> = {
  "US-NG": { name: "Nigeria", flag: "🇳🇬", networks: ["MTN", "Glo", "Airtel", "9mobile"] },
  "US-GH": { name: "Ghana", flag: "🇬🇭", networks: ["MTN", "Telecel", "AirtelTigo"] },
  "US-KE": { name: "Kenya", flag: "🇰🇪", networks: ["Safaricom", "Airtel"] },
};

async function topupOffers(): Promise<Record<string, number>> {
  try {
    const db = supabasePublic();
    const { data } = await db
      .from("offers")
      .select("id, corridor_id")
      .eq("vertical_id", "topup")
      .eq("active", true);
    return Object.fromEntries((data ?? []).map((o) => [String(o.corridor_id), o.id as number]));
  } catch {
    return {};
  }
}

export default async function Airtime() {
  const offers = await topupOffers();

  return (
    <>
      <header className="bg-ink text-paper px-5 pt-6 pb-6">
        <div className="mx-auto max-w-md">
          <Link href="/" className="display text-2xl font-extrabold tracking-tight">
            Korido<span className="text-mango">.</span>
          </Link>
          <h1 className="display mt-3 text-2xl font-bold leading-tight">
            Top up a phone back home
          </h1>
          <p className="mt-2 text-sm text-[#BFD8CC]">
            Airtime lands on the phone in seconds, and the person receiving it
            doesn&apos;t need a bank account — which is why it&apos;s often the
            fastest way to help with something small and urgent.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
        <section className="space-y-3">
          {Object.entries(NETWORKS).map(([corridorId, c]) => {
            const offerId = offers[corridorId];
            return (
              <div key={corridorId} className="rounded-2xl border border-line bg-white p-4">
                <div className="display text-lg font-bold">
                  {c.flag} {c.name}
                </div>
                <div className="mt-1 text-xs text-[#6B7A73]">
                  Networks supported: {c.networks.join(" · ")}
                </div>
                {offerId ? (
                  <a
                    href={`/go/${offerId}`}
                    rel="sponsored nofollow noopener"
                    className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-line bg-paper py-2.5 text-sm font-bold text-ink"
                  >
                    Top up a {c.name} number →
                  </a>
                ) : (
                  <div className="mt-3 text-sm text-[#8A968F]">Temporarily unavailable</div>
                )}
              </div>
            );
          })}
        </section>

        {/* The honest part. We are not comparing, and we say so rather than
            implying a market survey we have not done. */}
        <section className="mt-8 rounded-2xl border border-line bg-white p-4">
          <h2 className="display text-base font-bold">Why there are no prices here</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A73]">
            On our{" "}
            <Link className="underline" href="/">
              money transfer board
            </Link>{" "}
            we quote every provider live and rank them by what actually arrives.
            We can&apos;t do that for airtime yet: the providers in this market
            either don&apos;t publish prices we can read, or only reveal them
            after you enter the recipient&apos;s phone number.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A73]">
            Rather than show you numbers we can&apos;t stand behind, we show
            none. The link above takes you to a provider who serves these
            networks, and you&apos;ll see their real price before paying
            anything. When we can verify airtime prices properly, they&apos;ll
            appear here and be ranked the same way as everything else.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="display text-base font-bold">Worth checking before you send</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#6B7A73]">
            <li>
              <strong>The network must match the number.</strong> Airtime is
              network-specific — MTN credit can&apos;t be used on a Glo line.
            </li>
            <li>
              <strong>Confirm the number with them first.</strong> Airtime sent
              to a wrong number is generally gone; there&apos;s no recall.
            </li>
            <li>
              <strong>Check the amount in local currency</strong>, not just the
              dollars you pay — bonus promotions come and go, and they change
              what actually lands.
            </li>
          </ul>
        </section>

        <footer className="mt-10 text-xs leading-relaxed text-[#8A968F]">
          <p>
            Korido never accepts, holds, or moves money, and never asks for card
            or bank details. Links to providers may earn us a commission — it
            never changes your price.{" "}
            <Link className="underline" href="/affiliate-disclosure">
              How we make money
            </Link>
          </p>
          <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4">
            <Link className="underline" href="/">Compare transfers</Link>
            <Link className="underline" href="/privacy">Privacy</Link>
            <Link className="underline" href="/terms">Terms</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
