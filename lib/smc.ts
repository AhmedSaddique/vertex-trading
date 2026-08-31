// Smart Money Concepts / ICT: FVGs, order blocks, liquidity, premium/discount.
import { atr } from "./structure";
import type { Candle, LiquidityPool, Swing, Sweep, Zone } from "./types";

// ---------------------------------------------------------------- FVG

export function findFvgs(candles: Candle[], lookback = 120): Zone[] {
  const zones: Zone[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    if (candles[i].low > candles[i - 2].high) {
      zones.push({ kind: "fvg_bull", top: candles[i].low, bottom: candles[i - 2].high, idx: i, mitigated: false });
    } else if (candles[i].high < candles[i - 2].low) {
      zones.push({ kind: "fvg_bear", top: candles[i - 2].low, bottom: candles[i].high, idx: i, mitigated: false });
    }
  }
  for (const z of zones) {
    for (let i = z.idx + 1; i < candles.length; i++) {
      if (z.kind === "fvg_bull" && candles[i].low <= z.bottom) { z.mitigated = true; break; }
      if (z.kind === "fvg_bear" && candles[i].high >= z.top) { z.mitigated = true; break; }
    }
  }
  return zones;
}

// ---------------------------------------------------------------- Order blocks

export function findOrderBlocks(
  candles: Candle[], swings: Swing[],
  displacementMult = 1.2, lookback = 120,
): Zone[] {
  const zones: Zone[] = [];
  const a = atr(candles);
  const swingHighs = swings.filter((s) => s.kind === "high");
  const swingLows = swings.filter((s) => s.kind === "low");
  const start = Math.max(3, candles.length - lookback);

  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    if (body < displacementMult * a) continue;

    if (c.close > c.open) {
      const priors = swingHighs.filter((s) => s.idx < i).map((s) => s.price);
      if (!priors.length || c.close <= Math.max(...priors)) continue;
      for (let j = i - 1; j >= Math.max(i - 6, 0); j--) {
        if (candles[j].close < candles[j].open) {
          zones.push({ kind: "ob_bull", top: candles[j].high, bottom: candles[j].low, idx: j, mitigated: false });
          break;
        }
      }
    } else {
      const priors = swingLows.filter((s) => s.idx < i).map((s) => s.price);
      if (!priors.length || c.close >= Math.min(...priors)) continue;
      for (let j = i - 1; j >= Math.max(i - 6, 0); j--) {
        if (candles[j].close > candles[j].open) {
          zones.push({ kind: "ob_bear", top: candles[j].high, bottom: candles[j].low, idx: j, mitigated: false });
          break;
        }
      }
    }
  }

  for (const z of zones) {
    for (let i = z.idx + 2; i < candles.length; i++) {
      if (z.kind === "ob_bull" && candles[i].close < z.bottom) { z.mitigated = true; break; }
      if (z.kind === "ob_bear" && candles[i].close > z.top) { z.mitigated = true; break; }
    }
  }
  return zones;
}

// ---------------------------------------------------------------- Liquidity

export function findLiquidityPools(candles: Candle[], swings: Swing[], eqTolAtr = 0.25): LiquidityPool[] {
  const tol = eqTolAtr * atr(candles);
  const pools: LiquidityPool[] = [];
  for (const kind of ["high", "low"] as const) {
    const pts = swings.filter((s) => s.kind === kind);
    const used = new Set<number>();
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue;
      const group = [pts[i]];
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.abs(pts[j].price - pts[i].price) <= tol) {
          group.push(pts[j]);
          used.add(j);
        }
      }
      if (group.length >= 2) {
        const level = group.reduce((s, g) => s + g.price, 0) / group.length;
        pools.push({
          kind: kind === "high" ? "highs" : "lows",
          level,
          idxs: group.map((g) => g.idx),
          swept: false,
          sweepIdx: null,
        });
      }
    }
  }
  markSweeps(candles, pools);
  return pools;
}

function markSweeps(candles: Candle[], pools: LiquidityPool[]): void {
  for (const p of pools) {
    const start = Math.max(...p.idxs) + 1;
    for (let i = start; i < candles.length; i++) {
      const c = candles[i];
      if (p.kind === "highs" && c.high > p.level && c.close < p.level) {
        p.swept = true;
        p.sweepIdx = i;
      } else if (p.kind === "lows" && c.low < p.level && c.close > p.level) {
        p.swept = true;
        p.sweepIdx = i;
      }
    }
  }
}

export function recentSweep(candles: Candle[], swings: Swing[], within = 6): Sweep | null {
  const pools = findLiquidityPools(candles, swings);
  const n = candles.length;
  let best: Sweep | null = null;
  for (const p of pools) {
    if (p.swept && p.sweepIdx !== null && p.sweepIdx >= n - within) {
      best = { favors: p.kind === "lows" ? "bull" : "bear", level: p.level, idx: p.sweepIdx, type: "pool" };
    }
  }
  if (best) return best;

  for (let i = Math.max(1, n - within); i < n; i++) {
    const c = candles[i];
    for (const s of swings) {
      if (s.idx >= i) continue;
      if (s.kind === "low" && c.low < s.price && c.close > s.price) {
        best = { favors: "bull", level: s.price, idx: i, type: "swing" };
      } else if (s.kind === "high" && c.high > s.price && c.close < s.price) {
        best = { favors: "bear", level: s.price, idx: i, type: "swing" };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- Premium / discount

export interface DealingRange {
  top: number;
  bottom: number;
  pos: number;
  discount: boolean;
  premium: boolean;
  oteLong: boolean;
  oteShort: boolean;
}

export function dealingRange(candles: Candle[], swings: Swing[]): DealingRange | null {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  if (!highs.length || !lows.length) return null;
  const hi = highs[highs.length - 1];
  const lo = lows[lows.length - 1];
  if (hi.price <= lo.price) return null;
  const price = candles[candles.length - 1].close;
  const pos = (price - lo.price) / (hi.price - lo.price);
  const legUp = lo.idx < hi.idx;
  return {
    top: hi.price,
    bottom: lo.price,
    pos,
    discount: pos < 0.5,
    premium: pos > 0.5,
    oteLong: legUp && pos >= 0.21 && pos <= 0.38,
    oteShort: !legUp && pos >= 0.62 && pos <= 0.79,
  };
}

export function activeZonesAtPrice(zones: Zone[], price: number, pad = 0): Zone[] {
  return zones.filter((z) => !z.mitigated && z.bottom - pad <= price && price <= z.top + pad);
}
