// Markets that get a dedicated live-chart page (/gold, /btc, /eth).
export interface MarketDef {
  id: string; // URL segment + /api/market/[asset] key
  short: string; // label for nav links
  title: string; // page heading
  tvSymbol: string; // TradingView symbol (scanner API + chart widget)
  pairMatch: string; // substring to find this market in PairAnalysis.pair
  accent: string; // Tailwind text color for the heading dot
}

export const MARKETS: Record<string, MarketDef> = {
  gold: {
    id: "gold",
    short: "Gold",
    title: "Gold · XAU/USD Live",
    tvSymbol: "OANDA:XAUUSD",
    pairMatch: "XAU",
    accent: "text-amber-400",
  },
  btc: {
    id: "btc",
    short: "BTC",
    title: "Bitcoin · BTC/USDT Live",
    tvSymbol: "BINANCE:BTCUSDT",
    pairMatch: "BTC",
    accent: "text-orange-400",
  },
  eth: {
    id: "eth",
    short: "ETH",
    title: "Ethereum · ETH/USDT Live",
    tvSymbol: "BINANCE:ETHUSDT",
    pairMatch: "ETH",
    accent: "text-indigo-400",
  },
};
