import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Korido — compare ways to send money home",
  description:
    "Live comparison of money transfer rates and fees to Nigeria, Ghana, and Kenya. Free, always.",
};

// Fonts are self-hosted from /public/fonts (see globals.css) rather than
// fetched from Google. A visitor's browser therefore contacts no third party
// at all, which is what lets the privacy page say so plainly. Not next/font
// either: its build-time fetch breaks offline and CI builds.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
