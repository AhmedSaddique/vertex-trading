// Classic chart patterns from swing points: double top / double bottom.
import { atr } from "./structure";
import type { Candle, Swing } from "./types";

export interface DoublePattern {
  name: string;
  direction: "bull" | "bear";
  neckline: number;
  level: number;
}

export function detectDouble(
  candles: Candle[], swings: Swing[],
  tolAtr = 0.5, recent = 10,
): DoublePattern | null {
  if (candles.length < 20 || swings.length < 3) return null;
  const tol = tolAtr * atr(candles);
  const close = candles[candles.length - 1].close;
  const n = candles.length;

  const lows = swings.filter((s) => s.kind === "low");
  const highs = swings.filter((s) => s.kind === "high");

  if (lows.length >= 2) {
    const l2 = lows[lows.length - 1];
    const l1 = lows[lows.length - 2];
    if (Math.abs(l1.price - l2.price) <= tol && l2.idx > l1.idx) {
      const necks = highs.filter((s) => s.idx > l1.idx && s.idx < l2.idx);
      if (necks.length) {
        const neckline = Math.max(...necks.map((s) => s.price));
        let broke = false;
        for (let i = Math.max(l2.idx, n - recent); i < n; i++) {
          if (candles[i].close > neckline) broke = true;
        }
        if (broke && close > Math.min(l1.price, l2.price)) {
          return { name: "Double Bottom", direction: "bull", neckline, level: (l1.price + l2.price) / 2 };
        }
      }
    }
  }

  if (highs.length >= 2) {
    const h2 = highs[highs.length - 1];
    const h1 = highs[highs.length - 2];
    if (Math.abs(h1.price - h2.price) <= tol && h2.idx > h1.idx) {
      const necks = lows.filter((s) => s.idx > h1.idx && s.idx < h2.idx);
      if (necks.length) {
        const neckline = Math.min(...necks.map((s) => s.price));
        let broke = false;
        for (let i = Math.max(h2.idx, n - recent); i < n; i++) {
          if (candles[i].close < neckline) broke = true;
        }
        if (broke && close < Math.max(h1.price, h2.price)) {
          return { name: "Double Top", direction: "bear", neckline, level: (h1.price + h2.price) / 2 };
        }
      }
    }
  }
  return null;
}
