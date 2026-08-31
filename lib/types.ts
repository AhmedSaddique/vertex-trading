export interface Candle {
  time: number; // candle OPEN time, ms UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Swing {
  idx: number;
  time: number;
  price: number;
  kind: "high" | "low";
}

export interface StructureEvent {
  idx: number;
  time: number;
  kind: "BOS" | "CHOCH";
  direction: "bull" | "bear";
  brokenLevel: number;
}

export interface Zone {
  kind: "fvg_bull" | "fvg_bear" | "ob_bull" | "ob_bear";
  top: number;
  bottom: number;
  idx: number;
  mitigated: boolean;
}

export interface LiquidityPool {
  kind: "highs" | "lows";
  level: number;
  idxs: number[];
  swept: boolean;
  sweepIdx: number | null;
}

export interface Sweep {
  favors: "bull" | "bear";
  level: number;
  idx: number;
  type: "pool" | "swing";
}

export interface CrtResult {
  direction: "bull" | "bear";
  rangeHigh: number;
  rangeLow: number;
  idx: number;
  time: number;
  target: number;
}

export interface CandlePattern {
  name: string;
  direction: "bull" | "bear";
}

export interface Signal {
  pair: string;
  direction: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  score: number;
  minScore: number;
  reasons: string[];
  time: number; // ms UTC of the entry-TF candle
  rr1: number;
  rr2: number;
}

export interface PairAnalysis {
  pair: string;
  price: number;
  bias: "bull" | "bear";
  biasStrength: "strong" | "weak";
  score: number;
  reasons: string[];
  signal: Signal | null;
  updatedAt: number;
  error?: string;
}

export interface PairConfig {
  name: string;
  source: "binance" | "yahoo";
  symbol: string;
}

export interface TfRating {
  tf: "15m" | "1h" | "4h" | "1D";
  rating: number; // TradingView Recommend.All, -1 (strong sell) … +1 (strong buy)
  rsi: number;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  changePct: number;
  changeAbs: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  ema50: number; // daily
  ema200: number; // daily
  timeframes: TfRating[];
  at: number;
}
