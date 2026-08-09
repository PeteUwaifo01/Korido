import Link from "next/link";
import type { ReactNode } from "react";

// Shared chrome for the pages spec §7 requires. Same tokens as the board so
// these read as part of the product rather than as bolted-on boilerplate —
// a privacy page that looks like an afterthought is treated like one.

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="bg-ink text-paper px-5 pt-6 pb-6">
        <div className="mx-auto max-w-md">
          <Link href="/" className="display text-2xl font-extrabold tracking-tight">
            Korido<span className="text-mango">.</span>
          </Link>
          <h1 className="display mt-3 text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-1 text-sm text-[#BFD8CC]">Last updated {updated}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
        <div className="legal space-y-5 text-sm leading-relaxed text-ink">{children}</div>

        <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-5 text-xs text-[#6B7A73]">
          <Link className="underline" href="/">Compare rates</Link>
          <Link className="underline" href="/privacy">Privacy</Link>
          <Link className="underline" href="/affiliate-disclosure">How we make money</Link>
          <Link className="underline" href="/terms">Terms</Link>
        </nav>
      </main>
    </>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="display mt-7 text-lg font-bold">{children}</h2>;
}
