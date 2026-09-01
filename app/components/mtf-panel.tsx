"use client";

// Per-timeframe trade table: 1m, 5m, 15m, 1h, 4h. Each row is an independent
// run of the confluence engine, gated by the timeframe above it.
import { useCallback, useEffect, useState } from "react";
import type { MtfResult, TfAnalysis } from "@/lib/types";
import { fmt } from "./pair-card";

const REFRESH_MS = 30_000;

const FLOW_STYLE = {
  bull: { text: "text-emerald-400", bg: "border-emerald-800 bg-emerald-950/40", arrow: "▲" },
  bear: { text: "text-red-400", bg: "border-red-800 bg-red-950/40", arrow: "▼" },
  mixed: { text: "text-zinc-300", bg: "border-zinc-700 bg-zinc-900/60", arrow: "◆" },
} as const;

export function MtfPanel({ asset, short }: { asset: string; short: string }) {
  const [data, setData] = useState<MtfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/mtf/${asset}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [asset]);

  useEffect(() => {
    queueMicrotask(load);
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
        Multi-timeframe scan failed: {error}
      </div>
    );
  }
  if (!data) {
    return <p className="py-8 text-center text-sm text-zinc-500">Scanning {short} across 1m → 4h…</p>;
  }

  const flow = FLOW_STYLE[data.flow.direction];
  const withSignal = data.timeframes.filter((t) => t.signal).length;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${flow.bg}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={`text-lg font-bold ${flow.text}`}>
            {flow.arrow} Flow: {data.flow.label}
          </p>
          <p className="text-xs text-zinc-400">
            {Math.round(data.flow.agreement * 100)}% of weighted timeframes agree ·{" "}
            {withSignal} of {data.timeframes.length} timeframes have a setup
          </p>
        </div>
        <p className="mt-1.5 text-sm text-zinc-300">{data.flow.note}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Live price <span className="font-semibold tabular-nums text-zinc-300">{fmt(data.price)}</span>{" "}
          from {data.priceSource}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">TF</th>
              <th className="px-3 py-2.5 text-left font-medium">Bias</th>
              <th className="px-3 py-2.5 text-left font-medium">Score</th>
              <th className="px-3 py-2.5 text-left font-medium">Trade</th>
              <th className="px-3 py-2.5 text-right font-medium">Entry</th>
              <th className="px-3 py-2.5 text-right font-medium">Stop</th>
              <th className="px-3 py-2.5 text-right font-medium">TP1</th>
              <th className="px-3 py-2.5 text-right font-medium">TP2</th>
              <th className="px-3 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {data.timeframes.map((t) => (
              <Row
                key={t.tf}
                t={t}
                open={open === t.tf}
                onToggle={() => setOpen(open === t.tf ? null : t.tf)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ t, open, onToggle }: { t: TfAnalysis; open: boolean; onToggle: () => void }) {
  const bull = t.bias === "bull";
  const s = t.signal;

  if (t.error) {
    return (
      <tr className="bg-zinc-950/40">
        <td className="px-3 py-3 font-semibold text-zinc-300">{t.tf}</td>
        <td className="px-3 py-3 text-amber-400/80" colSpan={8}>
          ⚠ {t.error}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="bg-zinc-950/40 transition hover:bg-zinc-900/50">
        <td className="px-3 py-3">
          <span className="font-semibold text-zinc-200">{t.tf}</span>
          <span className="ml-1 text-[10px] text-zinc-500">/{t.biasTf}</span>
        </td>
        <td className="px-3 py-3">
          <span className={`text-xs font-semibold ${bull ? "text-emerald-400" : "text-red-400"}`}>
            {bull ? "▲ BULL" : "▼ BEAR"}
          </span>
          <span className="ml-1 text-[10px] text-zinc-500">{t.biasStrength}</span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${s ? "bg-emerald-400" : t.score >= t.minScore * 0.7 ? "bg-amber-400" : "bg-zinc-600"}`}
                style={{ width: `${Math.min(100, (t.score / 10) * 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-zinc-400">
              {t.score}/{t.minScore}
            </span>
          </div>
        </td>
        <td className="px-3 py-3">
          {s ? (
            <span
              className={`rounded px-2 py-0.5 text-xs font-bold ${
                s.direction === "BUY" ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
              }`}
            >
              {s.direction}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">wait</span>
          )}
        </td>
        {s ? (
          <>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmt(s.entry)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-red-400/90">{fmt(s.stopLoss)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-emerald-400/90">
              {fmt(s.takeProfit1)}
              <span className="ml-1 text-[10px] text-zinc-500">{s.rr1}R</span>
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-emerald-400/90">
              {fmt(s.takeProfit2)}
              <span className="ml-1 text-[10px] text-zinc-500">{s.rr2}R</span>
            </td>
          </>
        ) : (
          <td className="px-3 py-3 text-right text-xs text-zinc-600" colSpan={4}>
            needs {Math.max(0, Math.round((t.minScore - t.score) * 10) / 10)} more score
          </td>
        )}
        <td className="px-3 py-3 text-right">
          <button
            onClick={onToggle}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:bg-zinc-800"
          >
            {open ? "hide" : "why"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-900/70">
          <td colSpan={9} className="px-4 py-3">
            <ul className="space-y-1 text-xs text-zinc-400">
              {t.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-zinc-600">•</span>
                  <span>{r}</span>
                </li>
              ))}
              {!t.reasons.length && <li className="text-zinc-600">No confluence found.</li>}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
