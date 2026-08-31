import type { Metadata } from "next";
import { MARKETS } from "@/lib/markets";
import { MarketView } from "../components/market-page";

export const metadata: Metadata = {
  title: "Ethereum Live — ETH/USDT | Signals Bot",
  description:
    "Live ETH/USDT chart with candles (TradingView), multi-timeframe market direction and the bot's current SMC/ICT analysis.",
};

export default function EthPage() {
  return <MarketView market={MARKETS.eth} />;
}
