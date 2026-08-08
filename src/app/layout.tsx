import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Korido — compare ways to send money home",
  description:
    "Live comparison of money transfer rates and fees to Nigeria, Ghana, and Kenya. Free, always.",
};

// Fonts load at runtime (not next/font build-time fetch) so builds work
// offline/CI; Bricolage Grotesque + Inter per the korido.jsx design tokens.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
