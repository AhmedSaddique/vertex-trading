// GET /api/market/[asset] — live snapshot (gold | btc | eth) from TradingView's
// free scanner API (no key needed). Proxied server-side to avoid CORS.
import { NextResponse } from "next/server";
import { MARKETS } from "@/lib/markets";
import type { MarketSnapshot, TfRating } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// TradingView field suffix per timeframe; empty string = daily (default).
const TF_SUFFIX: [TfRating["tf"], string][] = [
  ["15m", "|15"],
  ["1h", "|60"],
  ["4h", "|240"],
  ["1D", ""],
];

const FIELDS = [
  "close", "change", "change_abs", "high", "low", "open", "volume",
  "EMA50", "EMA200",
  ...TF_SUFFIX.flatMap(([, s]) => [`Recommend.All${s}`, `RSI${s}`]),
];

export async function GET(_req: Request, ctx: RouteContext<"/api/market/[asset]">) {
  const { asset } = await ctx.params;
  const market = MARKETS[asset];
  if (!market) {
    return NextResponse.json({ error: `Unknown market: ${asset}` }, { status: 404 });
  }

  const url =
    `https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(market.tvSymbol)}` +
    `&fields=${encodeURIComponent(FIELDS.join(","))}&no_404=true`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d: Record<string, number | null> = await res.json();
    if (d.close == null) throw new Error("no data returned");

    const timeframes: TfRating[] = TF_SUFFIX.map(([tf, s]) => ({
      tf,
      rating: d[`Recommend.All${s}`] ?? 0,
      rsi: d[`RSI${s}`] ?? 0,
    }));

    const snapshot: MarketSnapshot = {
      symbol: market.tvSymbol,
      price: d.close,
      changePct: d.change ?? 0,
      changeAbs: d.change_abs ?? 0,
      open: d.open ?? 0,
      high: d.high ?? 0,
      low: d.low ?? 0,
      volume: d.volume ?? 0,
      ema50: d.EMA50 ?? 0,
      ema200: d.EMA200 ?? 0,
      timeframes,
      at: Date.now(),
    };
    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json(
      { error: `TradingView fetch failed: ${String(e)}` },
      { status: 502 },
    );
  }
}
