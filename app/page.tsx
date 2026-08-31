"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MARKETS } from "@/lib/markets";
import type { PairAnalysis } from "@/lib/types";
import { PairCard } from "./components/pair-card";

function chartHref(pair: string): string | undefined {
  const m = Object.values(MARKETS).find((m) => pair.includes(m.pairMatch));
  return m ? `/${m.id}` : undefined;
}

const MIN_SCORE_DISPLAY = 7.5;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function Dashboard() {
  const [results, setResults] = useState<PairAnalysis[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/signals", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResults(json.results);
      setUpdatedAt(json.at);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Signals Bot <span className="text-emerald-400">·</span> SMC + ICT + CRT
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              4H bias → 15m confluence · signal fires at score ≥ {MIN_SCORE_DISPLAY} with 2+ triggers
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            {updatedAt && <span>updated {timeAgo(updatedAt)}</span>}
            <nav className="flex items-center gap-2">
              {Object.values(MARKETS).map((m) => (
                <Link
                  key={m.id}
                  href={`/${m.id}`}
                  className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 font-medium text-amber-300 transition hover:bg-amber-900/40"
                >
                  📈 {m.short}
                </Link>
              ))}
            </nav>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Scanning…" : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Failed to load: {error}
          </div>
        )}

        {!results && !error && (
          <div className="py-24 text-center text-zinc-500">Scanning the market…</div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {results?.map((r) => <PairCard key={r.pair} r={r} chartHref={chartHref(r.pair)} />)}
        </div>

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Educational tool — not financial advice. Backtest and demo-trade before risking real money.
        </footer>
      </div>
    </main>
  );
}
