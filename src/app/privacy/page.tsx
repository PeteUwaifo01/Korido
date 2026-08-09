import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2 } from "@/components/LegalPage";

// Spec §7: "Privacy page: plain language; data collected = email (encrypted) +
// target rate + anonymized clicks; delete-on-request mailbox."
//
// Every claim below is checked against what the code actually does. If you
// change data handling, change this page in the same commit — a privacy page
// that has drifted from the code is worse than none, because people rely on it.
//
// Rate alerts (§6) are NOT built yet, so this does not claim to collect email
// addresses. Add that section in the same commit that ships alerts.

export const metadata: Metadata = {
  title: "Privacy — Korido",
  description:
    "What Korido records, what it does not, and how to have it deleted. No accounts, no cookies, no third-party trackers.",
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="9 August 2026">
      <p>
        Korido is a price comparison site. You do not need an account, and we
        never ask for your bank details, card details, or the details of whoever
        you are sending money to.
      </p>

      <H2>What we don&apos;t do</H2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>We set no cookies.</strong> Not for analytics, not for
          advertising, not for &ldquo;preferences&rdquo;. None at all.
        </li>
        <li>
          <strong>We load nothing from third parties.</strong> No Google
          Analytics, no Facebook pixel, no ad networks. Even our fonts are served
          from our own servers, so that visiting Korido does not tell any other
          company you were here.
        </li>
        <li>
          <strong>We never store your IP address.</strong> See below for what we
          store instead.
        </li>
        <li>
          <strong>We never handle money.</strong> Korido cannot accept, hold, or
          send funds, and has no way to take a payment from you.
        </li>
      </ul>

      <H2>What we record</H2>
      <p>
        Only one thing: when you click through to a provider. We record which
        provider and corridor you clicked, the time, which page you clicked from,
        and a <strong>salted hash</strong> in place of your identity.
      </p>
      <p>
        That hash is made from your IP address and browser description mixed with
        a secret value, then scrambled one way so it cannot be turned back. It
        lets us count how many separate people clicked without knowing who they
        are. We change the secret value periodically, which permanently breaks
        the link between old records and new ones.
      </p>
      <p>
        We keep these records because providers pay us per referral, and we need
        to check their reports against our own. It is also how we tell whether
        Korido is useful enough to keep running.
      </p>

      <H2>Who else sees it</H2>
      <p>
        Our database is hosted by Supabase, and our site is served by our hosting
        provider. Both process this data on our behalf and neither is permitted
        to use it for anything else. We do not sell data, and we do not share it
        with advertisers, because we do not have any.
      </p>
      <p>
        When you click a link to a provider, you leave Korido and land on their
        site, where their own privacy policy applies. Some of those links carry a
        reference code so the provider can tell us the referral came from Korido.
        That code identifies <em>us</em>, not you.
      </p>

      <H2>Deleting your data</H2>
      <p>
        Email{" "}
        <a className="underline" href="mailto:hello@korido.app?subject=Data%20request">
          hello@korido.app
        </a>{" "}
        and we will delete what we hold and confirm when it is done. Because we
        deliberately do not know who you are, it helps if you tell us roughly
        when you visited and from where, so we can find the right records.
      </p>
      <p>
        You are welcome to email that address with any question about this page.
        A short, plain answer from a person is the intention.
      </p>

      <H2>Children</H2>
      <p>Korido is not intended for anyone under 18.</p>

      <H2>Changes</H2>
      <p>
        If we start collecting anything new — for example when we launch rate
        alerts, which will need your email address — this page will say so before
        that feature goes live, not afterwards.
      </p>

      <p className="pt-2 text-xs text-[#6B7A73]">
        Related: <Link className="underline" href="/affiliate-disclosure">how we make money</Link>{" "}
        and our <Link className="underline" href="/terms">terms</Link>.
      </p>
    </LegalPage>
  );
}
