import type { PairConfig, Tf } from "./types";

export const PAIRS: PairConfig[] = [
  // GC=F is COMEX gold FUTURES — it prints ~$40-60 above XAU/USD spot. We keep it
  // as the OHLC source (deep history, clean 24h sessions) but re-anchor every
  // candle onto OANDA:XAUUSD spot so the numbers match the chart. See lib/data.ts.
  { name: "GOLD (XAU/USD)", source: "yahoo", symbol: "GC=F", spotSymbol: "OANDA:XAUUSD" },
  { name: "BTC/USDT", source: "binance", symbol: "BTCUSDT" },
  { name: "ETH/USDT", source: "binance", symbol: "ETHUSDT" },
];

export const ENTRY_TF = "15m";
export const BIAS_TF = "4h";
export const CANDLES_ENTRY = 300;
export const CANDLES_BIAS = 200;
export const MIN_SCORE = Number(process.env.MIN_SCORE ?? 7.5);
export const SWING_K = 2;
export const COOLDOWN_CANDLES = 8; // same pair+direction, 8 x 15m = 2h

/** The timeframe ladder shown on the market pages. Each entry timeframe is
 *  gated by the higher timeframe directly above it — a 1m entry is only taken
 *  in the direction 15m structure allows, and so on up the chain. */
export const TF_LADDER: { tf: Tf; biasTf: string; minScore: number; weight: number }[] = [
  { tf: "1m", biasTf: "15m", minScore: 6.5, weight: 0.5 },
  { tf: "5m", biasTf: "1h", minScore: 7.0, weight: 1.0 },
  { tf: "15m", biasTf: "4h", minScore: 7.5, weight: 1.5 },
  { tf: "1h", biasTf: "4h", minScore: 7.5, weight: 2.0 },
  { tf: "4h", biasTf: "1d", minScore: 7.5, weight: 2.5 },
];

/** Every distinct timeframe the ladder needs fetched, entry + bias. */
export const REQUIRED_TFS = [
  ...new Set(TF_LADDER.flatMap((l) => [l.tf as string, l.biasTf])),
];

/** How many candles to pull per timeframe. Lower TFs need more bars to cover
 *  a meaningful window; higher TFs are capped by what the provider returns. */
export const CANDLES_PER_TF: Record<string, number> = {
  "1m": 400, "5m": 400, "15m": 300, "1h": 300, "4h": 250, "1d": 200,
};

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN ?? "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
// Set ENABLE_SCANNER=true to auto-scan every 15m inside `next start`
export const ENABLE_SCANNER = (process.env.ENABLE_SCANNER ?? "true") === "true";

// Screenshot analysis. Either provider works; with no key /api/vision returns 503
// and the uploader greys itself out. Gemini wins by default when both are set —
// its free tier needs no card, while the Anthropic API bills separately from a
// claude.ai subscription. Set VISION_PROVIDER=anthropic to override.
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const VISION_MODEL = process.env.VISION_MODEL ?? "claude-opus-5";
export const VISION_PROVIDER = process.env.VISION_PROVIDER ?? "";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
