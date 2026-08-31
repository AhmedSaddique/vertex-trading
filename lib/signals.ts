// Confluence signal engine: 4H bias + CRT gate, 15m setups, scored confluence.
import { detectCandles } from "./candles";
import { detectCrt } from "./crt";
import { detectDouble } from "./patterns";
import {
  activeZonesAtPrice, dealingRange, findFvgs, findOrderBlocks, recentSweep,
} from "./smc";
import { atr, currentBias, findSwings, structureEvents } from "./structure";
import type { Candle, Signal, Zone } from "./types";

export const DEFAULT_WEIGHTS = {
  biasStrong: 1.0,
  biasWeak: 0.5,
  crt: 2.0,
  sweep: 2.0,
  structureConfirm: 2.0,
  orderBlock: 2.0,
  fvg: 1.5,
  candleFirst: 1.5,
  candleExtra: 0.5,
  doublePattern: 1.5,
  pdSide: 0.5,
  ote: 0.5,
};

export interface AnalysisResult {
  bias: "bull" | "bear";
  biasStrength: "strong" | "weak";
  score: number;
  reasons: string[];
  signal: Signal | null;
}

const g = (x: number) => Number(x.toPrecision(6));

export function analyze(
  pair: string,
  entry15: Candle[],
  htf4h: Candle[],
  minScore = 7.5,
  swingK = 2,
): AnalysisResult | null {
  if (entry15.length < 60 || htf4h.length < 30) return null;

  const reasons: string[] = [];
  const price = entry15[entry15.length - 1].close;
  const a15 = atr(entry15);
  const w = DEFAULT_WEIGHTS;

  // 1) HTF bias (gate)
  const htf = currentBias(htf4h, swingK);
  const bias = htf.bias;
  let score = htf.strength === "strong" ? w.biasStrong : w.biasWeak;
  reasons.push(`4H bias ${bias.toUpperCase()} (${htf.strength} structure)`);

  // 2) HTF CRT
  let crt = detectCrt(htf4h);
  if (crt && crt.direction === bias) {
    score += w.crt;
    const side = bias === "bull" ? "low" : "high";
    reasons.push(`4H CRT: swept previous candle ${side}, closed back inside range`);
  } else {
    crt = null;
  }

  // 3) Entry-TF structure confirmation
  const swings = findSwings(entry15, swingK);
  const events = structureEvents(entry15, swings);
  const recentEvents = events.filter((e) => e.idx >= entry15.length - 8);
  const confirm = [...recentEvents].reverse().find((e) => e.direction === bias) ?? null;
  if (confirm) {
    score += w.structureConfirm;
    reasons.push(`15m ${confirm.kind} ${bias} (broke ${g(confirm.brokenLevel)})`);
  }

  // 4) Liquidity sweep
  let sweep = recentSweep(entry15, swings, 6);
  if (sweep && sweep.favors === bias) {
    score += w.sweep;
    const what =
      sweep.type === "pool"
        ? `equal ${bias === "bull" ? "lows" : "highs"}`
        : bias === "bull" ? "swing low" : "swing high";
    reasons.push(`15m liquidity sweep of ${what} at ${g(sweep.level)}`);
  } else {
    sweep = null;
  }

  // 5) Order blocks & FVG at price
  const obs = findOrderBlocks(entry15, swings);
  const fvgs = findFvgs(entry15);
  const pad = 0.1 * a15;

  let obHit: Zone | null = null;
  for (const z of activeZonesAtPrice(obs, price, pad)) {
    if ((bias === "bull" && z.kind === "ob_bull") || (bias === "bear" && z.kind === "ob_bear")) obHit = z;
  }
  if (obHit) {
    score += w.orderBlock;
    reasons.push(`price inside ${bias} order block ${g(obHit.bottom)}–${g(obHit.top)}`);
  }

  let fvgHit: Zone | null = null;
  for (const z of activeZonesAtPrice(fvgs, price, pad)) {
    if ((bias === "bull" && z.kind === "fvg_bull") || (bias === "bear" && z.kind === "fvg_bear")) fvgHit = z;
  }
  if (fvgHit) {
    score += w.fvg;
    reasons.push(`price inside ${bias} FVG ${g(fvgHit.bottom)}–${g(fvgHit.top)}`);
  }

  // 6) Candlestick confirmation
  const cds = detectCandles(entry15).filter((c) => c.direction === bias);
  if (cds.length) {
    score += w.candleFirst + w.candleExtra * (cds.length - 1);
    reasons.push("candles: " + cds.map((c) => c.name).join(", "));
  }

  // 7) Chart pattern
  const dbl0 = detectDouble(entry15, swings);
  const dbl = dbl0 && dbl0.direction === bias ? dbl0 : null;
  if (dbl) {
    score += w.doublePattern;
    reasons.push(`chart pattern: ${dbl.name} (neckline ${g(dbl.neckline)})`);
  }

  // 8) Premium / discount (ICT)
  const dr = dealingRange(entry15, swings);
  if (dr) {
    if ((bias === "bull" && dr.discount) || (bias === "bear" && dr.premium)) {
      score += w.pdSide;
      reasons.push(`price in ${bias === "bull" ? "discount" : "premium"} of dealing range (${Math.round(dr.pos * 100)}%)`);
      if ((bias === "bull" && dr.oteLong) || (bias === "bear" && dr.oteShort)) {
        score += w.ote;
        reasons.push("inside ICT OTE zone (62–79% retracement)");
      }
    }
  }

  score = Math.round(score * 100) / 100;
  const base: AnalysisResult = { bias, biasStrength: htf.strength, score, reasons, signal: null };

  // Gate: score + at least TWO independent event triggers
  const triggers = [confirm, sweep, cds.length ? cds : null, dbl, crt].filter(Boolean).length;
  if (score < minScore || triggers < 2) return base;

  // Entry / SL / TP
  const direction: "BUY" | "SELL" = bias === "bull" ? "BUY" : "SELL";
  const buf = 0.35 * a15;
  const tail = entry15.slice(-6);
  const recentLow = Math.min(...tail.map((c) => c.low));
  const recentHigh = Math.max(...tail.map((c) => c.high));

  let sl: number, tp1: number, tp2: number, risk: number;
  if (direction === "BUY") {
    const cands = [recentLow];
    if (obHit) cands.push(obHit.bottom);
    if (sweep) cands.push(Math.min(sweep.level, recentLow));
    sl = Math.min(...cands) - buf;
    risk = price - sl;
    if (risk <= 0) return base;
    tp1 = price + 2 * risk;
    const targets = swings.filter((s) => s.kind === "high" && s.price > tp1).map((s) => s.price);
    if (crt && crt.target > tp1) targets.push(crt.target);
    tp2 = targets.length ? Math.min(...targets) : price + 3 * risk;
  } else {
    const cands = [recentHigh];
    if (obHit) cands.push(obHit.top);
    if (sweep) cands.push(Math.max(sweep.level, recentHigh));
    sl = Math.max(...cands) + buf;
    risk = sl - price;
    if (risk <= 0) return base;
    tp1 = price - 2 * risk;
    const targets = swings.filter((s) => s.kind === "low" && s.price < tp1).map((s) => s.price);
    if (crt && crt.target < tp1) targets.push(crt.target);
    tp2 = targets.length ? Math.max(...targets) : price - 3 * risk;
  }

  const signal: Signal = {
    pair,
    direction,
    entry: price,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    score,
    minScore,
    reasons,
    time: entry15[entry15.length - 1].time,
    rr1: Math.round((Math.abs(tp1 - price) / risk) * 100) / 100,
    rr2: Math.round((Math.abs(tp2 - price) / risk) * 100) / 100,
  };
  return { ...base, signal };
}
