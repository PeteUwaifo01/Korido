import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2 } from "@/components/LegalPage";

// Spec §7: "Affiliate disclosure adjacent to every outbound CTA + footer
// statement." This is the full version the board's short disclosure links to.
//
// IMPORTANT: the "we have no commission arrangements yet" section below is true
// as of this commit and must be updated the moment any affiliate_url is set
// (npm run affiliate). A stale disclosure here is a straightforward lie.

export const metadata: Metadata = {
  title: "How we make money — Korido",
  description:
    "Korido is free to use. Providers may pay us a referral commission, and it never changes your rate or affects how we rank them.",
};

export default function AffiliateDisclosure() {
  return (
    <LegalPage title="How we make money" updated="9 August 2026">
      <p>
        Korido is free for you and always will be. When you continue to a
        provider through one of our buttons, that provider may pay us a
        commission for the referral.
      </p>

      <H2>What that does not change</H2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Your rate, fee and delivery time are unaffected.</strong> You
          get exactly the same deal you would get by going to the provider
          directly.
        </li>
        <li>
          <strong>It does not affect the ranking.</strong> Providers are sorted
          by one thing: how much money actually reaches the person you are
          sending to. Nothing else moves a row up or down — not commission, not a
          partnership, not how much a provider pays.
        </li>
      </ul>

      <H2>Where we are today</H2>
      <p>
        We currently have <strong>no commission arrangements in place</strong>.
        Every button on the board sends you straight to the provider&apos;s own
        site with no tracking of any kind. We are applying to affiliate
        programmes, and this page will be updated when any of them start paying —
        before it happens, not after.
      </p>

      <H2>The bit worth being suspicious about</H2>
      <p>
        Comparison sites are usually paid by the companies they compare, which
        gives them a reason to flatter whoever pays best. So here is how you can
        check us:
      </p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          Every provider on the board shows its rate, its fee and the resulting
          amount. Take the top row and the bottom row to their own sites and
          confirm the numbers.
        </li>
        <li>
          We name the providers we <em>cannot</em> price at the bottom of the
          board, and say plainly that one of them might beat our winner. A site
          optimising for commission would quietly leave them out.
        </li>
        <li>
          If a provider we earn from is the worst option for your amount, it will
          appear at the bottom. That already happens.
        </li>
      </ul>

      <H2>What we will never do</H2>
      <p>
        Korido will never accept, hold, or transfer your money, and will never
        ask for card or bank details. We compare prices and hand you over. If you
        are ever asked for payment details on a page that looks like Korido, it
        is not us — please tell us at{" "}
        <a className="underline" href="mailto:hello@korido.app?subject=Suspicious%20page">
          hello@korido.app
        </a>
        .
      </p>

      <p className="pt-2 text-xs text-[#6B7A73]">
        Related: <Link className="underline" href="/privacy">privacy</Link> and our{" "}
        <Link className="underline" href="/terms">terms</Link>.
      </p>
    </LegalPage>
  );
}
