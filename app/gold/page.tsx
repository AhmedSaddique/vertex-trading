import type { Metadata } from "next";
import { MARKETS } from "@/lib/markets";
import { MarketView } from "../components/market-page";

export const metadata: Metadata = {
  title: "Gold Live — XAU/USD | Signals Bot",
  description:
    "Live XAU/USD chart with candles (TradingView), multi-timeframe market direction and the bot's current SMC/ICT analysis.",
};

export default function GoldPage() {
  return <MarketView market={MARKETS.gold} />;
}
