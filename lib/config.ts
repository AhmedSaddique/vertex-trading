import type { PairConfig } from "./types";

export const PAIRS: PairConfig[] = [
  { name: "GOLD (XAU/USD)", source: "yahoo", symbol: "GC=F" },
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

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN ?? "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
// Set ENABLE_SCANNER=true to auto-scan every 15m inside `next start`
export const ENABLE_SCANNER = (process.env.ENABLE_SCANNER ?? "true") === "true";
