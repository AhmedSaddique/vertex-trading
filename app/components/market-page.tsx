"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketDef } from "@/lib/markets";
import type { MarketSnapshot, PairAnalysis } from "@/lib/types";
import { PairCard, fmt } from "./pair-card";

const SNAPSHOT_REFRESH_MS = 30_000;
const SIGNALS_REFRESH_MS = 60_000;

// TradingView Recommend.All: -1 (strong sell) … +1 (strong buy)
function ratingInfo(v: number): { label: string; cls: string } {
  if (v >= 0.5) return { label: "STRONG BUY", cls: "bg-emerald-950 text-emerald-300 border-emerald-800" };
  if (v >= 0.1) return { label: "BUY", cls: "bg-emerald-950/60 text-emerald-400 border-emerald-900" };
  if (v > -0.1) return { label: "NEUTRAL", cls: "bg-zinc-800 text-zinc-300 border-zinc-700" };
  if (v > -0.5) return { label: "SELL", cls: "bg-red-950/60 text-red-400 border-red-900" };
  return { label: "STRONG SELL", cls: "bg-red-950 text-red-300 border-red-800" };
}

function rsiHint(rsi: number): string {
  if (rsi >= 70) return "overbought";
  if (rsi <= 30) return "oversold";
  return "neutral";
}

export function MarketView({ market }: { market: MarketDef }) {
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [pair, setPair] = useState<PairAnalysis | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState(0);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/${market.id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSnap(json);
      setSnapError(null);
    } catch (e) {
      setSnapError(String(e));
    }
  }, [market.id]);

  const loadSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const found = (json.results as PairAnalysis[]).find((r) =>
        r.pair.includes(market.pairMatch),
      );
      setPair(found ?? null);
      setSignalsError(found ? null : `${market.short} not found in scanner results`);
    } catch (e) {
      setSignalsError(String(e));
    }
  }, [market.pairMatch, market.short]);

  useEffect(() => {
    queueMicrotask(() => {
      loadSnapshot();
      loadSignals();
    });
    const a = setInterval(loadSnapshot, SNAPSHOT_REFRESH_MS);
    const b = setInterval(loadSignals, SIGNALS_REFRESH_MS);
    // The embedded chart dies with "a network change was detected" if the
    // connection drops mid-load — remount it when the browser comes back online.
    const onOnline = () => setChartKey((k) => k + 1);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(a);
      clearInterval(b);
      window.removeEventListener("online", onOnline);
    };
  }, [loadSnapshot, loadSignals]);

  const up = (snap?.changeAbs ?? 0) >= 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-zinc-400 transition hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {market.title.split(" · ")[0]} <span className={market.accent}>·</span>{" "}
              {market.title.split(" · ").slice(1).join(" · ")}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              TradingView data · auto-refreshes every {SNAPSHOT_REFRESH_MS / 1000}s
            </p>
          </div>
          {snap && (
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">{fmt(snap.price)}</p>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {up ? "▲" : "▼"} {fmt(Math.abs(snap.changeAbs))} ({snap.changePct.toFixed(2)}%) today
              </p>
            </div>
          )}
        </header>

        {snapError && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Live data failed: {snapError}
          </div>
        )}

        {snap && (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Open" value={fmt(snap.open)} />
              <Stat label="Day High" value={fmt(snap.high)} />
              <Stat label="Day Low" value={fmt(snap.low)} />
              <Stat label="EMA 50 (1D)" value={fmt(snap.ema50)} />
              <Stat label="EMA 200 (1D)" value={fmt(snap.ema200)} />
              <Stat label="Volume" value={snap.volume.toLocaleString("en-US")} />
            </section>

            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Market direction — TradingView technical rating
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {snap.timeframes.map((t) => {
                  const info = ratingInfo(t.rating);
                  return (
                    <div key={t.tf} className={`rounded-xl border p-4 text-center ${info.cls}`}>
                      <p className="text-xs font-medium opacity-70">{t.tf}</p>
                      <p className="mt-1 text-base font-bold">{info.label}</p>
                      <p className="mt-1 text-xs tabular-nums opacity-80">
                        RSI {t.rsi.toFixed(1)} · {rsiHint(t.rsi)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Live chart — candles (TradingView)
            </h2>
            <button
              onClick={() => setChartKey((k) => k + 1)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              ↻ Reload chart
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <TradingViewChart key={chartKey} symbol={market.tvSymbol} />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Bot analysis — SMC · ICT · CRT
          </h2>
          {signalsError && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              Failed to load bot analysis: {signalsError}
            </div>
          )}
          {pair ? (
            <div className="max-w-xl">
              <PairCard r={pair} />
            </div>
          ) : (
            !signalsError && (
              <p className="py-8 text-center text-sm text-zinc-500">
                Scanning {market.short}…
              </p>
            )
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Chart & ratings by TradingView. Educational tool — not financial advice.
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1", // candles
      locale: "en",
      withdateranges: true,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      details: true,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(widget);
    container.appendChild(script);
    return () => {
      container.replaceChildren();
    };
  }, [symbol]);

  // Height lives on the outer div: TradingView's injected CSS targets
  // .tradingview-widget-container and would override Tailwind's layered utilities.
  return (
    <div className="h-[70vh] min-h-[480px] w-full">
      <div
        ref={ref}
        className="tradingview-widget-container"
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
