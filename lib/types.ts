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
  /** TradingView symbol carrying the true SPOT price. When set, candles fetched
   *  from `symbol` are re-anchored onto this feed so the bot's numbers match the
   *  chart on screen — GC=F futures trade ~$50 above XAU/USD spot. */
  spotSymbol?: string;
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

// ---------------------------------------------------------------- multi-timeframe

export type Tf = "1m" | "5m" | "15m" | "1h" | "4h";

export interface TfAnalysis {
  tf: Tf;
  biasTf: string;
  bias: "bull" | "bear";
  biasStrength: "strong" | "weak";
  score: number;
  minScore: number;
  reasons: string[];
  signal: Signal | null;
  error?: string;
}

export interface FlowRead {
  direction: "bull" | "bear" | "mixed";
  agreement: number;   // 0..1 — share of weighted timeframes agreeing
  label: string;       // e.g. "strong down-flow"
  note: string;
}

export interface MtfResult {
  pair: string;
  price: number;       // live price, not a stale candle close
  priceSource: string;
  timeframes: TfAnalysis[];
  flow: FlowRead;
  updatedAt: number;
}

// ---------------------------------------------------------------- drawn chart

export interface ChartLine {
  kind: "swing_high" | "swing_low" | "eqh" | "eql" | "bos" | "choch" | "range_eq" | "pdh" | "pdl";
  price: number;
  label: string;
  fromTime: number;
  swept?: boolean;
}

export interface ChartBox {
  kind: Zone["kind"];
  top: number;
  bottom: number;
  fromTime: number;
  label: string;
}

export interface TrendLine {
  kind: "support" | "resistance";
  // y = slope * (time - t0) + intercept
  t0: number;
  slope: number;      // price per ms
  intercept: number;
  fromTime: number;
  toTime: number;
  touches: number;
  label: string;
}

export interface ChartPlan {
  pair: string;
  tf: Tf;
  candles: Candle[];
  livePrice: number;
  lines: ChartLine[];
  boxes: ChartBox[];
  trendlines: TrendLine[];
  flow: FlowRead;
  projection: { time: number; price: number }[]; // where the bot thinks price flows next
  updatedAt: number;
}

// ---------------------------------------------------------------- vision

export interface VisionLevel {
  label: string;
  price: string;
}

export interface VisionAnalysis {
  instrument: string;
  timeframe: string;
  direction: "UP" | "DOWN" | "UNCLEAR";
  confidence: number; // 0..10
  summary: string;
  htfBias: string;
  structure: string[];   // BOS / CHoCH / trend reads
  smc: string[];         // order blocks, FVGs, liquidity
  ict: string[];         // premium/discount, OTE, killzone
  crt: string[];         // candle range theory reads
  candlePatterns: string[];
  levels: VisionLevel[];
  trade: {
    bias: "BUY" | "SELL" | "WAIT";
    entry: string;
    stopLoss: string;
    takeProfit1: string;
    takeProfit2: string;
    riskReward: string;
    invalidation: string;
  };
  warnings: string[];
}
