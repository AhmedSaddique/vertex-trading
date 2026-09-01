"use client";

// Upload a chart screenshot; Claude reads it against SMC / ICT / CRT and returns
// a structured verdict. Accepts drag-and-drop, a file picker, or a straight
// Ctrl+V paste of a screenshot.
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisionAnalysis } from "@/lib/types";

const MAX_MB = 5;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

export function ChartUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionAnalysis | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/vision", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setEnabled(Boolean(j.enabled));
        setProviderLabel(typeof j.label === "string" ? j.label : null);
      })
      .catch(() => setEnabled(false));
  }, []);

  // Revoke the previous object URL whenever the preview changes or we unmount,
  // otherwise every re-upload leaks a blob.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const accept = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      setError(`Unsupported file type '${f.type || "unknown"}'. Use PNG, JPEG, GIF or WebP.`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That image is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  // Paste-to-upload: the fastest path from a screenshot tool to an analysis.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (img) accept(img.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      if (note.trim()) body.append("note", note.trim());
      const res = await fetch("/api/vision", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.analysis);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [file, note]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setNote("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">
          Screenshot analysis — send a chart, get the read
        </h3>
        {file && (
          <button onClick={reset} className="text-xs text-zinc-500 transition hover:text-zinc-300">
            clear
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Drop a chart image, pick one, or just press Ctrl+V after a screenshot. It gets read against
        SMC, ICT and CRT and comes back with a direction and a full breakdown.
        {providerLabel && <span className="text-zinc-600"> · via {providerLabel}</span>}
      </p>

      {enabled === false && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          <p className="font-semibold">Screenshot analysis is off — no vision API key set.</p>
          <p className="mt-1.5 text-amber-200/90">
            Free option: grab a key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-amber-100"
            >
              aistudio.google.com/apikey
            </a>{" "}
            (no card needed), put <code className="font-mono">GEMINI_API_KEY=…</code> in{" "}
            <code className="font-mono">.env.local</code>, and restart the server.
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Paid alternative: <code className="font-mono">ANTHROPIC_API_KEY</code> for Claude —
            stronger on hard charts, billed separately from a claude.ai subscription.
          </p>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-emerald-600 bg-emerald-950/20" : "border-zinc-700 hover:border-zinc-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element -- blob: preview of a
             user-selected file; next/image would need a loader and buys nothing here. */
          <img src={preview} alt="Chart to analyse" className="mx-auto max-h-72 rounded-lg" />
        ) : (
          <div className="py-6 text-sm text-zinc-500">
            <p className="text-2xl">📊</p>
            <p className="mt-2">Drop your chart screenshot here</p>
            <p className="mt-1 text-xs text-zinc-600">PNG, JPEG, GIF or WebP · up to {MAX_MB} MB</p>
          </div>
        )}
      </div>

      {file && (
        <div className="mt-3 space-y-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: anything to add? e.g. 'XAUUSD 15m, London session'"
            maxLength={500}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
          <button
            onClick={submit}
            disabled={busy || enabled === false}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Reading the chart…" : "Analyse this chart"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && <VisionResult a={result} />}
    </div>
  );
}

function VisionResult({ a }: { a: VisionAnalysis }) {
  const up = a.direction === "UP";
  const unclear = a.direction === "UNCLEAR";
  const tone = unclear
    ? { border: "border-zinc-700", bg: "bg-zinc-900/60", text: "text-zinc-300", arrow: "◆" }
    : up
      ? { border: "border-emerald-800", bg: "bg-emerald-950/40", text: "text-emerald-400", arrow: "▲" }
      : { border: "border-red-800", bg: "bg-red-950/40", text: "text-red-400", arrow: "▼" };

  return (
    <div className="mt-5 space-y-4">
      <div className={`rounded-xl border p-4 ${tone.border} ${tone.bg}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={`text-xl font-bold ${tone.text}`}>
            {tone.arrow} {unclear ? "UNCLEAR" : up ? "LIKELY UP" : "LIKELY DOWN"}
          </p>
          <p className="text-xs text-zinc-400">
            {a.instrument} · {a.timeframe} · confidence {a.confidence}/10
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${unclear ? "bg-zinc-600" : up ? "bg-emerald-400" : "bg-red-400"}`}
            style={{ width: `${Math.min(100, Math.max(0, a.confidence * 10))}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-200">{a.summary}</p>
        {a.htfBias && <p className="mt-2 text-xs text-zinc-400">HTF bias: {a.htfBias}</p>}
      </div>

      <div className={`rounded-xl border p-4 ${a.trade.bias === "WAIT" ? "border-zinc-700 bg-zinc-900/60" : tone.border + " " + tone.bg}`}>
        <p className="text-sm font-bold text-zinc-200">
          Trade plan — <span className={tone.text}>{a.trade.bias}</span>
        </p>
        {a.trade.bias === "WAIT" ? (
          <p className="mt-2 text-sm text-zinc-400">
            No setup worth taking here. {a.trade.invalidation}
          </p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-3">
              <Field label="Entry" value={a.trade.entry} />
              <Field label="Stop Loss" value={a.trade.stopLoss} />
              <Field label="R:R" value={a.trade.riskReward} />
              <Field label="TP1" value={a.trade.takeProfit1} />
              <Field label="TP2" value={a.trade.takeProfit2} />
            </dl>
            <p className="mt-3 text-xs text-zinc-400">
              <span className="text-zinc-500">Invalidation:</span> {a.trade.invalidation}
            </p>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Block title="Market structure" items={a.structure} />
        <Block title="SMC — order blocks, FVG, liquidity" items={a.smc} />
        <Block title="ICT — premium/discount, OTE" items={a.ict} />
        <Block title="CRT — candle range theory" items={a.crt} />
        <Block title="Candlestick patterns" items={a.candlePatterns} />
        {a.levels.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Key levels
            </p>
            <dl className="space-y-1 text-xs">
              {a.levels.map((l, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{l.label}</dt>
                  <dd className="font-semibold tabular-nums text-zinc-300">{l.price}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {a.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-900/70 bg-amber-950/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
            Caveats
          </p>
          <ul className="space-y-1 text-xs text-amber-200/90">
            {a.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-semibold text-zinc-100">{value}</dd>
    </>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <ul className="space-y-1 text-xs text-zinc-300">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-zinc-600">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
