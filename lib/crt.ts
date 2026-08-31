// CRT — Candle Range Theory on the higher timeframe.
import type { Candle, CrtResult } from "./types";

export function detectCrt(htf: Candle[], lookback = 3): CrtResult | null {
  const n = htf.length;
  if (n < 3) return null;
  let best: CrtResult | null = null;
  for (let i = Math.max(2, n - lookback); i < n; i++) {
    const rh = htf[i - 1].high;
    const rl = htf[i - 1].low;
    if (rh <= rl) continue;
    const c = htf[i];
    if (c.low < rl && c.close > rl) {
      best = { direction: "bull", rangeHigh: rh, rangeLow: rl, idx: i, time: c.time, target: rh };
    } else if (c.high > rh && c.close < rh) {
      best = { direction: "bear", rangeHigh: rh, rangeLow: rl, idx: i, time: c.time, target: rl };
    }
  }
  return best;
}
