import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2 } from "@/components/LegalPage";

// Spec §7 lists a Privacy/ToS attorney review as a post-trial budget line
// (~$300, once commissions clear). This is a plain-language draft written to be
// accurate about what the product actually does — it is not a substitute for
// that review, and it should be handed to the attorney as the starting point.

export const metadata: Metadata = {
  title: "Terms — Korido",
  description:
    "Korido compares money transfer prices and refers you to providers. It never handles your money.",
};

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="9 August 2026">
      <p>
        These terms cover your use of Korido. They are written to be readable
        rather than impressive.
      </p>

      <H2>What Korido is</H2>
      <p>
        A comparison site. We collect prices from money transfer providers and
        show you what each one would deliver for the amount you enter, ranked by
        how much actually reaches the recipient.
      </p>

      <H2>What Korido is not</H2>
      <p>
        We are not a money transmitter, a bank, or a financial adviser. Korido{" "}
        <strong>cannot accept, hold, or send funds</strong>, and has no mechanism
        to take a payment from you. Every transfer is a contract between you and
        the provider you choose, under their terms, with their protections and
        their complaints process.
      </p>
      <p>
        Nothing on Korido is financial advice. Which provider suits you may
        depend on things we do not model — how your recipient wants to be paid,
        identity checks, sending limits, or how quickly the money is needed.
      </p>

      <H2>About the prices</H2>
      <p>
        We ask each provider for a real quote at the moment you load the page,
        and we show the time next to every figure. We do not scale a price from a
        different amount, because fees and rates change with how much you send.
      </p>
      <p>
        Even so, prices move constantly, and the figure that binds is the one the
        provider shows you at their own checkout. If we cannot get a price we can
        stand behind, that row will say so rather than show you an old number.
      </p>
      <p>
        We cover the providers whose prices we can read openly, which is not
        every provider in the market. The board names the ones we leave out. One
        of them may beat our top result.
      </p>
      <p>
        We work hard to be accurate and we correct mistakes quickly, but we
        cannot guarantee every figure is free of error. Please check the
        provider&apos;s own quote before you send. If you spot something wrong,
        tell us at{" "}
        <a className="underline" href="mailto:hello@korido.app?subject=Incorrect%20rate">
          hello@korido.app
        </a>{" "}
        and we will look at it.
      </p>

      <H2>Referral links</H2>
      <p>
        Some outbound links may earn us a commission. This never changes your
        price and never affects the ranking — see{" "}
        <Link className="underline" href="/affiliate-disclosure">how we make money</Link>.
      </p>

      <H2>Fair use</H2>
      <p>
        Please do not scrape the site at volume, resell our data, or try to break
        it. If you want the data for something useful, email and ask — we would
        rather say yes than block you.
      </p>

      <H2>Liability</H2>
      <p>
        Korido is provided as is. To the extent the law allows, we are not liable
        for losses arising from your use of the site or from a transfer you make
        with a provider. Nothing here limits liability that cannot legally be
        limited, and none of it affects your statutory consumer rights.
      </p>

      <H2>Contact</H2>
      <p>
        <a className="underline" href="mailto:hello@korido.app">hello@korido.app</a>. A
        real person reads it.
      </p>

      <p className="pt-2 text-xs text-[#6B7A73]">
        Related: <Link className="underline" href="/privacy">privacy</Link> and{" "}
        <Link className="underline" href="/affiliate-disclosure">how we make money</Link>.
      </p>
    </LegalPage>
  );
}
