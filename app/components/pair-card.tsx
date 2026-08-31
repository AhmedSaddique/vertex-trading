"use client";

import Link from "next/link";
import type { PairAnalysis } from "@/lib/types";

export function fmt(x: number): string {
  return Number(x.toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function PairCard({ r, chartHref }: { r: PairAnalysis; chartHref?: string }) {
  const bull = r.bias === "bull";
  const pct = Math.min(100, Math.round((r.score / 10) * 100));
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {r.pair}
            {chartHref && (
              <Link
                href={chartHref}
                className="ml-2 text-xs font-medium text-amber-400/80 transition hover:text-amber-300"
              >
                Chart →
              </Link>
            )}
          </h2>
          {r.price > 0 && <p className="mt-0.5 text-lg font-bold tabular-nums">{fmt(r.price)}</p>}
        </div>
        {!r.error && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              bull ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
            }`}
          >
            {bull ? "▲ BULLISH" : "▼ BEARISH"} · {r.biasStrength}
          </span>
        )}
      </div>

      {r.error ? (
        <p className="mt-4 break-words text-sm text-amber-400/90">⚠ {r.error}</p>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>confluence score</span>
              <span className="tabular-nums">{r.score} / 10</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${
                  r.signal ? "bg-emerald-400" : r.score >= 5 ? "bg-amber-400" : "bg-zinc-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {r.signal ? (
            <div
              className={`mt-4 rounded-xl border p-4 ${
                r.signal.direction === "BUY"
                  ? "border-emerald-800 bg-emerald-950/40"
                  : "border-red-800 bg-red-950/40"
              }`}
            >
              <p
                className={`text-lg font-bold ${
                  r.signal.direction === "BUY" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {r.signal.direction === "BUY" ? "🟢 BUY" : "🔴 SELL"} SIGNAL
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                <dt className="text-zinc-400">Entry</dt>
                <dd className="text-right font-semibold">{fmt(r.signal.entry)}</dd>
                <dt className="text-zinc-400">Stop Loss</dt>
                <dd className="text-right font-semibold">{fmt(r.signal.stopLoss)}</dd>
                <dt className="text-zinc-400">TP1 (1:{r.signal.rr1})</dt>
                <dd className="text-right font-semibold">{fmt(r.signal.takeProfit1)}</dd>
                <dt className="text-zinc-400">TP2 (1:{r.signal.rr2})</dt>
                <dd className="text-right font-semibold">{fmt(r.signal.takeProfit2)}</dd>
              </dl>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No setup — waiting for confluence.</p>
          )}

          {r.reasons.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-zinc-400">
              {r.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-zinc-600">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
