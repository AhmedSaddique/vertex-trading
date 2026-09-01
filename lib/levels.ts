// The "draw it on the chart" layer: turns raw candles into the lines, zones and
// trendlines a chartist would pencil in — swing highs/lows, equal-high/low
// liquidity, BOS/CHoCH breaks, order blocks, FVGs, range equilibrium, previous
// day high/low, fitted trendlines — plus a forward projection of where the
// bot expects flow to go next.
import { detectCrt } from "./crt";
import { readFlow } from "./mtf";
import {
  dealingRange, findFvgs, findLiquidityPools, findOrderBlocks,
} from "./smc";
import { atr, findSwings, structureEvents } from "./structure";
import type {
  Candle, ChartBox, ChartLine, ChartPlan, FlowRead, Swing, Tf, TrendLine,
} from "./types";

const g = (x: number) => Number(x.toPrecision(7));

/** Horizontal levels worth drawing, most recent and most relevant first. */
export function drawLines(candles: Candle[], swings: Swing[]): ChartLine[] {
  const lines: ChartLine[] = [];
  const n = candles.length;
  const a = atr(candles);
  const price = candles[n - 1].close;

  // --- recent unbroken swing highs / lows (the obvious S/R a trader marks)
  const recentSwings = swings.filter((s) => s.idx >= n - 120);
  const highs = recentSwings.filter((s) => s.kind === "high").slice(-6);
  const lows = recentSwings.filter((s) => s.kind === "low").slice(-6);

  for (const s of highs) {
    // A high that price has already closed above is no longer resistance.
    const broken = candles.slice(s.idx + 1).some((c) => c.close > s.price);
    if (broken) continue;
    lines.push({ kind: "swing_high", price: g(s.price), label: `swing high ${g(s.price)}`, fromTime: s.time });
  }
  for (const s of lows) {
    const broken = candles.slice(s.idx + 1).some((c) => c.close < s.price);
    if (broken) continue;
    lines.push({ kind: "swing_low", price: g(s.price), label: `swing low ${g(s.price)}`, fromTime: s.time });
  }

  // --- equal highs / equal lows = resting liquidity (where stops sit)
  for (const pool of findLiquidityPools(candles, swings)) {
    if (Math.max(...pool.idxs) < n - 150) continue;
    const kind = pool.kind === "highs" ? "eqh" : "eql";
    lines.push({
      kind,
      price: g(pool.level),
      label: `${pool.kind === "highs" ? "equal highs" : "equal lows"} — liquidity${pool.swept ? " (swept)" : ""}`,
      fromTime: candles[Math.min(...pool.idxs)].time,
      swept: pool.swept,
    });
  }

  // --- the structure breaks themselves
  for (const e of structureEvents(candles, swings).slice(-4)) {
    lines.push({
      kind: e.kind === "BOS" ? "bos" : "choch",
      price: g(e.brokenLevel),
      label: `${e.kind} ${e.direction} @ ${g(e.brokenLevel)}`,
      fromTime: e.time,
    });
  }

  // --- dealing-range equilibrium (ICT 50%): premium above, discount below
  const dr = dealingRange(candles, swings);
  if (dr) {
    const eq = (dr.top + dr.bottom) / 2;
    lines.push({
      kind: "range_eq",
      price: g(eq),
      label: `range equilibrium (50%) — price is in ${price > eq ? "premium" : "discount"}`,
      fromTime: candles[Math.max(0, n - 100)].time,
    });
  }

  // --- previous day high / low: the levels every desk watches
  const pd = previousDay(candles);
  if (pd) {
    lines.push({ kind: "pdh", price: g(pd.high), label: `previous day high ${g(pd.high)}`, fromTime: pd.from });
    lines.push({ kind: "pdl", price: g(pd.low), label: `previous day low ${g(pd.low)}`, fromTime: pd.from });
  }

  // Collapse levels that sit within a fraction of ATR of each other — two lines
  // $0.30 apart on gold is visual noise, not two separate levels.
  return dedupe(lines, 0.15 * a);
}

function dedupe(lines: ChartLine[], tol: number): ChartLine[] {
  const out: ChartLine[] = [];
  for (const l of lines) {
    const clash = out.find((o) => Math.abs(o.price - l.price) <= tol && o.kind === l.kind);
    if (!clash) out.push(l);
  }
  return out.sort((a, b) => b.price - a.price);
}

function previousDay(candles: Candle[]): { high: number; low: number; from: number } | null {
  const DAY = 86_400_000;
  const lastDay = Math.floor(candles[candles.length - 1].time / DAY) * DAY;
  const prev = candles.filter((c) => c.time >= lastDay - DAY && c.time < lastDay);
  if (prev.length < 3) return null;
  return {
    high: Math.max(...prev.map((c) => c.high)),
    low: Math.min(...prev.map((c) => c.low)),
    from: prev[0].time,
  };
}

/** Unmitigated order blocks and fair-value gaps, as boxes. */
export function drawBoxes(candles: Candle[], swings: Swing[]): ChartBox[] {
  const n = candles.length;
  const boxes: ChartBox[] = [];
  const label: Record<string, string> = {
    ob_bull: "bullish order block",
    ob_bear: "bearish order block",
    fvg_bull: "bullish FVG",
    fvg_bear: "bearish FVG",
  };

  const zones = [
    ...findOrderBlocks(candles, swings).slice(-6),
    ...findFvgs(candles).slice(-8),
  ];
  for (const z of zones) {
    if (z.mitigated || z.idx < n - 150) continue;
    boxes.push({
      kind: z.kind,
      top: g(z.top),
      bottom: g(z.bottom),
      fromTime: candles[z.idx].time,
      label: label[z.kind] ?? z.kind,
    });
  }
  return boxes;
}

/** Fit a support line under the swing lows and a resistance line over the swing
 *  highs. We take the two most recent qualifying pivots, then count how many
 *  other pivots respect the line — a line with 2 touches is a guess, 3+ is a
 *  trendline worth drawing. */
export function drawTrendlines(candles: Candle[], swings: Swing[]): TrendLine[] {
  const n = candles.length;
  const a = atr(candles);
  const out: TrendLine[] = [];
  const last = candles[n - 1];

  for (const kind of ["support", "resistance"] as const) {
    const pts = swings
      .filter((s) => s.kind === (kind === "support" ? "low" : "high") && s.idx >= n - 120)
      .slice(-5);
    if (pts.length < 2) continue;

    let best: TrendLine | null = null;
    // Try every pair of pivots; keep the line with the most touches that no
    // candle body has decisively broken.
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const p1 = pts[i];
        const p2 = pts[j];
        const dt = p2.time - p1.time;
        if (dt <= 0) continue;
        const slope = (p2.price - p1.price) / dt;
        const at = (t: number) => p1.price + slope * (t - p1.time);

        // Reject a line price has already invalidated.
        let violated = false;
        for (let x = p1.idx; x < n; x++) {
          const c = candles[x];
          const y = at(c.time);
          const bodyLow = Math.min(c.open, c.close);
          const bodyHigh = Math.max(c.open, c.close);
          if (kind === "support" && bodyLow < y - 0.5 * a) { violated = true; break; }
          if (kind === "resistance" && bodyHigh > y + 0.5 * a) { violated = true; break; }
        }
        if (violated) continue;

        const touches = pts.filter((p) => Math.abs(p.price - at(p.time)) <= 0.4 * a).length;
        if (touches < 2) continue;
        if (!best || touches > best.touches) {
          best = {
            kind,
            t0: p1.time,
            slope,
            intercept: p1.price,
            fromTime: p1.time,
            toTime: last.time,
            touches,
            label: `${kind} trendline (${touches} touches, ${slope > 0 ? "rising" : "falling"})`,
          };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** A short forward path showing where the bot expects price to travel: toward
 *  the nearest liquidity in the direction of flow, then on to the next level.
 *  It is a read of intent from structure, not a prediction of the actual path. */
export function projectFlow(
  candles: Candle[],
  lines: ChartLine[],
  flow: FlowRead,
  stepMs: number,
): { time: number; price: number }[] {
  const last = candles[candles.length - 1];
  const price = last.close;
  const a = atr(candles);
  if (flow.direction === "mixed") {
    // No conviction: show it ranging inside the last swing envelope.
    return [
      { time: last.time, price: g(price) },
      { time: last.time + 4 * stepMs, price: g(price + 0.6 * a) },
      { time: last.time + 8 * stepMs, price: g(price - 0.6 * a) },
      { time: last.time + 12 * stepMs, price: g(price) },
    ];
  }

  const up = flow.direction === "bull";
  // Targets = levels sitting ahead of price in the direction of flow.
  const ahead = lines
    .filter((l) => (up ? l.price > price + 0.2 * a : l.price < price - 0.2 * a))
    .filter((l) => l.kind !== "bos" && l.kind !== "choch")
    .sort((x, y) => (up ? x.price - y.price : y.price - x.price));

  const t1 = ahead[0]?.price ?? price + (up ? 2 : -2) * a;
  const t2 = ahead[1]?.price ?? t1 + (up ? 1.5 : -1.5) * a;

  // Structure rarely travels in a straight line — show the pullback before the
  // continuation so the path reads like price action, not a ruler.
  const pullback = price - (up ? 0.5 : -0.5) * a;
  return [
    { time: last.time, price: g(price) },
    { time: last.time + 3 * stepMs, price: g(pullback) },
    { time: last.time + 9 * stepMs, price: g(t1) },
    { time: last.time + 16 * stepMs, price: g(t2) },
  ];
}

export interface BuildPlanArgs {
  pair: string;
  tf: Tf;
  candles: Candle[];
  livePrice: number;
  flow: FlowRead;
  stepMs: number;
  swingK?: number;
  bars?: number;
}

export function buildChartPlan({
  pair, tf, candles, livePrice, flow, stepMs, swingK = 2, bars = 160,
}: BuildPlanArgs): ChartPlan {
  const swings = findSwings(candles, swingK);
  const lines = drawLines(candles, swings);
  const boxes = drawBoxes(candles, swings);
  const trendlines = drawTrendlines(candles, swings);

  // Add the CRT range on this timeframe — it's the level set the bot trades from.
  const crt = detectCrt(candles, 4);
  if (crt) {
    lines.push({
      kind: crt.direction === "bull" ? "swing_low" : "swing_high",
      price: g(crt.target),
      label: `CRT ${crt.direction} target ${g(crt.target)}`,
      fromTime: crt.time,
    });
  }

  const view = candles.slice(-bars);
  const from = view[0]?.time ?? 0;

  return {
    pair,
    tf,
    candles: view,
    livePrice,
    // Horizontal levels stay valid no matter when they formed, so they all get
    // drawn; boxes and trendlines are anchored to bars and only make sense
    // while their origin is still in the rendered window.
    lines: lines.sort((a, b) => b.price - a.price),
    boxes: boxes.filter((b) => b.fromTime >= from),
    trendlines: trendlines.filter((t) => t.toTime >= from),
    flow,
    projection: projectFlow(candles, lines, flow, stepMs),
    updatedAt: Date.now(),
  };
}

export { readFlow };
