import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Korido — compare ways to send money home",
  description:
    "Live comparison of money transfer rates and fees to Nigeria, Ghana, and Kenya. Free, always.",
  // Installable to the home screen — an icon and a chrome-less launch, with no
  // app store, no $99/yr developer account, and no multi-day review between
  // finding a wrong rate and fixing it. Spec §1 puts native apps out of scope
  // for the trial; this delivers the part users actually feel.
  manifest: "/manifest.webmanifest",
  applicationName: "Korido",
  appleWebApp: {
    capable: true,
    title: "Korido",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A3B2E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
