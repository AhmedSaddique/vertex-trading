// Market data fetchers (server-side only).
// - Binance public API for crypto (no key needed)
// - Yahoo Finance chart API for Gold GC=F (no key needed); 4h resampled from 1h
import type { Candle, PairConfig } from "./types";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

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

const YF_RANGE: Record<string, string> = { "15m": "5d", "1h": "1mo", "4h": "3mo", "1d": "1y" };

export async function fetchYahoo(symbol: string, interval: string, limit = 300): Promise<Candle[]> {
  const yfInterval = interval === "4h" ? "1h" : interval;
  const range = YF_RANGE[interval] ?? "1mo";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${yfInterval}&range=${range}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) signals-bot" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned no data for ${symbol}`);
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

export async function fetchCandles(pair: PairConfig, interval: string, limit = 300): Promise<Candle[]> {
  if (pair.source === "binance") return fetchBinance(pair.symbol, interval, limit);
  return fetchYahoo(pair.symbol, interval, limit);
}
