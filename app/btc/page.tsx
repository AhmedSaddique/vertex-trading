import type { Metadata } from "next";
import { MARKETS } from "@/lib/markets";
import { MarketView } from "../components/market-page";

export const metadata: Metadata = {
  title: "Bitcoin Live — BTC/USDT | Signals Bot",
  description:
    "Live BTC/USDT chart with candles (TradingView), multi-timeframe market direction and the bot's current SMC/ICT analysis.",
};

export default function BtcPage() {
  return <MarketView market={MARKETS.btc} />;
}
