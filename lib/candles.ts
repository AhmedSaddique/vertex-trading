// Candlestick patterns on the entry timeframe (last closed candles).
import type { Candle, CandlePattern } from "./types";

const body = (r: Candle) => Math.abs(r.close - r.open);
const isBull = (r: Candle) => r.close > r.open;

function engulfing(c: Candle[]): CandlePattern | null {
  const a = c[c.length - 2];
  const b = c[c.length - 1];
  if (body(a) === 0) return null;
  if (isBull(b) && !isBull(a) && b.close >= a.open && b.open <= a.close && body(b) > body(a)) {
    return { name: "Bullish Engulfing", direction: "bull" };
  }
  if (!isBull(b) && isBull(a) && b.close <= a.open && b.open >= a.close && body(b) > body(a)) {
    return { name: "Bearish Engulfing", direction: "bear" };
  }
  return null;
}

function pinBar(c: Candle[], wickMult = 2.0): CandlePattern | null {
  const r = c[c.length - 1];
  const b = body(r);
  const rng = r.high - r.low;
  if (rng <= 0 || b === 0) return null;
  const lower = Math.min(r.open, r.close) - r.low;
  const upper = r.high - Math.max(r.open, r.close);
  if (lower >= wickMult * b && lower > 0.6 * rng) return { name: "Bullish Pin Bar (Hammer)", direction: "bull" };
  if (upper >= wickMult * b && upper > 0.6 * rng) return { name: "Bearish Pin Bar (Shooting Star)", direction: "bear" };
  return null;
}

function insideBarBreakout(c: Candle[]): CandlePattern | null {
  const a = c[c.length - 3];
  const b = c[c.length - 2];
  const d = c[c.length - 1];
  const inside = b.high <= a.high && b.low >= a.low;
  if (!inside) return null;
  if (d.close > a.high) return { name: "Inside Bar Breakout Up", direction: "bull" };
  if (d.close < a.low) return { name: "Inside Bar Breakout Down", direction: "bear" };
  return null;
}

function star(c: Candle[]): CandlePattern | null {
  const a = c[c.length - 3];
  const b = c[c.length - 2];
  const d = c[c.length - 1];
  if (!body(a) || !body(d)) return null;
  const smallMid = body(b) < 0.5 * body(a) && body(b) < 0.5 * body(d);
  if (!smallMid) return null;
  const mid = (a.open + a.close) / 2;
  if (!isBull(a) && isBull(d) && d.close > mid) return { name: "Morning Star", direction: "bull" };
  if (isBull(a) && !isBull(d) && d.close < mid) return { name: "Evening Star", direction: "bear" };
  return null;
}

export function detectCandles(candles: Candle[]): CandlePattern[] {
  if (candles.length < 3) return [];
  const out: CandlePattern[] = [];
  for (const fn of [engulfing, pinBar, insideBarBreakout, star]) {
    const r = fn(candles);
    if (r) out.push(r);
  }
  return out;
}
