// Market data fetchers (server-side only).
// - Binance public API for crypto (no key needed)
// - Yahoo Finance chart API for Gold GC=F (no key needed); 4h resampled from 1h
//
// SPOT ANCHORING (gold): Yahoo has no working XAU/USD spot symbol — GC=F is the
// COMEX futures contract, which carries a cost-of-carry premium of roughly $40-60
// over spot. Reading it raw made the bot quote ~4478 while the OANDA:XAUUSD chart
// showed ~4429. We therefore keep GC=F for shape (its OHLC is the real gold market)
// and shift every candle by `spot - futures`, measured live on each fetch, so the
// levels the bot prints line up with the chart the user trades from.
import type { Candle, PairConfig } from "./types";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

export function intervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? 900_000;
}

const BINANCE_BASES = ["https://api.binance.com", "https://data-api.binance.vision"];

export async function fetchBinance(symbol: string, interval: string, limit = 300): Promise<Candle[]> {
  let lastErr: unknown = null;
  for (const base of BINANCE_BASES) {
    try {
      const url = `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit + 1}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: (string | number)[][] = await res.json();
      let candles: Candle[] = raw.map((r) => ({
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      }));
      // drop the still-forming candle
      const step = INTERVAL_MS[interval];
      if (candles.length && candles[candles.length - 1].time + step > Date.now()) {
        candles = candles.slice(0, -1);
      }
      return candles.slice(-limit);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Binance fetch failed for ${symbol}: ${String(lastErr)}`);
}

// Range must be long enough to fill `limit` bars but short enough that Yahoo
// still serves the interval (1m is capped at 7d, 5m/15m at 60d).
const YF_RANGE: Record<string, string> = {
  "1m": "5d", "5m": "1mo", "15m": "1mo", "1h": "3mo", "4h": "6mo", "1d": "2y",
};

// Yahoo intermittently answers 200-with-no-result or drops the connection under
// repeated polling. One quick retry turns those blips into a normal response
// instead of a blank chart.
const YF_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

export async function fetchYahoo(symbol: string, interval: string, limit = 300): Promise<Candle[]> {
  const yfInterval = interval === "4h" ? "1h" : interval;
  const range = YF_RANGE[interval] ?? "1mo";

  let result: {
    timestamp?: number[];
    indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
  } | null = null;
  let lastErr: unknown = null;

  for (const host of YF_HOSTS) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?interval=${yfInterval}&range=${range}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) signals-bot" },
      });
      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      if (!r?.timestamp?.length) throw new Error(`Yahoo returned no candles for ${symbol} ${interval}`);
      result = r;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!result) throw new Error(`Yahoo fetch failed for ${symbol} ${interval}: ${String(lastErr)}`);

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  let candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ time: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
  }
  if (interval === "4h") candles = resample(candles, 4 * 3_600_000);
  const step = INTERVAL_MS[interval];
  if (candles.length && candles[candles.length - 1].time + step > Date.now()) {
    candles = candles.slice(0, -1);
  }
  return candles.slice(-limit);
}

function resample(candles: Candle[], bucketMs: number): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const c of candles) {
    const key = Math.floor(c.time / bucketMs) * bucketMs;
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, { ...c, time: key });
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------- live price

export interface LivePrice {
  price: number;
  source: string;
}

/** TradingView's public scanner — same feed the embedded chart widget renders,
 *  so this is the number the user sees on screen. */
async function tvPrice(tvSymbol: string): Promise<number | null> {
  try {
    const url =
      `https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(tvSymbol)}` +
      `&fields=close&no_404=true`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.close === "number" ? d.close : null;
  } catch {
    return null;
  }
}

/** Free spot-metal quote, used only if TradingView is unreachable. */
async function goldApiPrice(): Promise<number | null> {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.price === "number" ? d.price : null;
  } catch {
    return null;
  }
}

async function binancePrice(symbol: string): Promise<number | null> {
  for (const base of BINANCE_BASES) {
    try {
      const res = await fetch(`${base}/api/v3/ticker/price?symbol=${symbol}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const p = Number(d?.price);
      if (Number.isFinite(p) && p > 0) return p;
    } catch {
      /* try next base */
    }
  }
  return null;
}

/** The tradeable price right now — never a stale candle close. */
export async function fetchLivePrice(pair: PairConfig): Promise<LivePrice | null> {
  if (pair.spotSymbol) {
    const tv = await tvPrice(pair.spotSymbol);
    if (tv) return { price: tv, source: pair.spotSymbol };
    const alt = await goldApiPrice();
    if (alt) return { price: alt, source: "gold-api.com (XAU spot)" };
    return null;
  }
  if (pair.source === "binance") {
    const p = await binancePrice(pair.symbol);
    if (p) return { price: p, source: `Binance ${pair.symbol}` };
  }
  return null;
}

// Last known good futures→spot basis per symbol. If the spot feed blips we must
// NOT fall back to raw futures prices — that is exactly the ~$50 error this
// module exists to remove. Cost of carry moves slowly, so a recent basis is a far
// better estimate than none at all.
const basisCache = new Map<string, { basis: number; at: number }>();
const BASIS_TTL_MS = 6 * 60 * 60 * 1000;

export interface Anchor {
  basis: number;
  livePrice: number;
  priceSource: string;
}

/** Work out the shift from the candle feed onto the live/spot feed. */
async function resolveAnchor(pair: PairConfig, reference: number): Promise<Anchor> {
  const live = await fetchLivePrice(pair);

  if (!pair.spotSymbol) {
    // Crypto: klines and ticker are the same market, so no shift is needed.
    return {
      basis: 0,
      livePrice: live?.price ?? reference,
      priceSource: live?.source ?? `${pair.symbol} last close`,
    };
  }

  if (live && reference) {
    const basis = live.price - reference;
    basisCache.set(pair.symbol, { basis, at: Date.now() });
    return { basis, livePrice: live.price, priceSource: live.source };
  }

  const cached = basisCache.get(pair.symbol);
  if (cached && Date.now() - cached.at < BASIS_TTL_MS) {
    const mins = Math.round((Date.now() - cached.at) / 60_000);
    return {
      basis: cached.basis,
      livePrice: reference + cached.basis,
      priceSource: `${pair.spotSymbol} (spot feed down — basis from ${mins}m ago)`,
    };
  }

  // Nothing to anchor with. Say so loudly rather than quietly quoting futures.
  return {
    basis: 0,
    livePrice: reference,
    priceSource: `⚠ ${pair.symbol} futures — spot feed unavailable, price may be off`,
  };
}

/** Shift every OHLC value by `offset`. Volume and timestamps are untouched. */
function shiftCandles(candles: Candle[], offset: number): Candle[] {
  if (!offset) return candles;
  return candles.map((c) => ({
    ...c,
    open: c.open + offset,
    high: c.high + offset,
    low: c.low + offset,
    close: c.close + offset,
  }));
}

// ---------------------------------------------------------------- public API

export interface CandleFetch {
  candles: Candle[];
  /** futures→spot correction applied, in price units (0 when none). */
  basis: number;
  livePrice: number;
  priceSource: string;
}

/** Fetch candles already corrected onto the live/spot price feed. */
export async function fetchCandlesAnchored(
  pair: PairConfig,
  interval: string,
  limit = 300,
): Promise<CandleFetch> {
  const candles = await fetchCandles(pair, interval, limit);
  if (!candles.length) throw new Error(`no candles for ${pair.symbol} ${interval}`);

  const anchor = await resolveAnchor(pair, candles[candles.length - 1].close);
  return { ...anchor, candles: shiftCandles(candles, anchor.basis) };
}

export async function fetchCandles(pair: PairConfig, interval: string, limit = 300): Promise<Candle[]> {
  if (pair.source === "binance") return fetchBinance(pair.symbol, interval, limit);
  return fetchYahoo(pair.symbol, interval, limit);
}

/** Fetch several timeframes at once, all anchored with a single live-price read. */
export async function fetchTimeframes(
  pair: PairConfig,
  intervals: string[],
  perTf: Record<string, number>,
): Promise<{ byTf: Record<string, Candle[]> } & Anchor> {
  // One timeframe failing must not take the others down with it — the caller
  // reports per-timeframe gaps rather than blanking the whole scan.
  const sets = await Promise.all(
    intervals.map((iv) => fetchCandles(pair, iv, perTf[iv] ?? 300).catch(() => [] as Candle[])),
  );

  // Anchor off the fastest timeframe that returned data — its last close sits
  // closest in time to the live tick, which keeps the basis honest.
  let reference = 0;
  const bySpeed = intervals
    .map((_, i) => i)
    .sort((a, b) => intervalMs(intervals[a]) - intervalMs(intervals[b]));
  for (const i of bySpeed) {
    if (sets[i].length) { reference = sets[i][sets[i].length - 1].close; break; }
  }

  const anchor = await resolveAnchor(pair, reference);
  const byTf: Record<string, Candle[]> = {};
  intervals.forEach((iv, i) => { byTf[iv] = shiftCandles(sets[i], anchor.basis); });

  return { ...anchor, byTf };
}

