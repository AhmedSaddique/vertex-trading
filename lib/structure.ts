// Market structure: swing points, BOS/CHoCH, trend bias, ATR.
import type { Candle, StructureEvent, Swing } from "./types";

export function findSwings(candles: Candle[], k = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) swings.push({ idx: i, time: candles[i].time, price: candles[i].high, kind: "high" });
    if (isLow) swings.push({ idx: i, time: candles[i].time, price: candles[i].low, kind: "low" });
  }
  swings.sort((a, b) => a.idx - b.idx);
  return swings;
}

export function structureEvents(candles: Candle[], swings: Swing[]): StructureEvent[] {
  const events: StructureEvent[] = [];
  let trend: "bull" | "bear" | null = null;
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;
  let si = 0;

  for (let i = 0; i < candles.length; i++) {
    while (si < swings.length && swings[si].idx <= i - 1) {
      const s = swings[si];
      if (s.kind === "high") lastHigh = s;
      else lastLow = s;
      si++;
    }
    const c = candles[i].close;
    if (lastHigh && c > lastHigh.price) {
      const kind: "BOS" | "CHOCH" = trend === "bear" ? "CHOCH" : "BOS";
      events.push({ idx: i, time: candles[i].time, kind, direction: "bull", brokenLevel: lastHigh.price });
      trend = "bull";
      lastHigh = null;
    } else if (lastLow && c < lastLow.price) {
      const kind: "BOS" | "CHOCH" = trend === "bull" ? "CHOCH" : "BOS";
      events.push({ idx: i, time: candles[i].time, kind, direction: "bear", brokenLevel: lastLow.price });
      trend = "bear";
      lastLow = null;
    }
  }
  return events;
}

export function ema(values: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

export interface BiasResult {
  bias: "bull" | "bear";
  strength: "strong" | "weak";
  events: StructureEvent[];
  swings: Swing[];
}

export function currentBias(candles: Candle[], k = 2): BiasResult {
  const swings = findSwings(candles, k);
  const events = structureEvents(candles, swings);
  const structDir = events.length ? events[events.length - 1].direction : null;

  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, 50);
  const emaDir: "bull" | "bear" = closes[closes.length - 1] > e50[e50.length - 1] ? "bull" : "bear";

  let bias: "bull" | "bear";
  let strength: "strong" | "weak";
  if (structDir === null) {
    bias = emaDir;
    strength = "weak";
  } else if (structDir === emaDir) {
    bias = structDir;
    strength = "strong";
  } else {
    bias = structDir;
    strength = "weak";
  }
  return { bias, strength, events, swings };
}

export function atr(candles: Candle[], period = 14): number {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      trs.push(c.high - c.low);
    } else {
      const pc = candles[i - 1].close;
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
    }
  }
  const tail = trs.slice(-period);
  const src = tail.length >= period ? tail : trs;
  return src.reduce((a, b) => a + b, 0) / src.length;
}
