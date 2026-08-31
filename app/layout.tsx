import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signals Bot — SMC · ICT · CRT",
  description:
    "Confluence-based trading signals for Gold, BTC and ETH — 4H bias, 15m entries, Telegram alerts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
