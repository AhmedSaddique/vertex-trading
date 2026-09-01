"use client";

// The bot's own chart. Unlike the TradingView embed (which we cannot draw on),
// this is rendered from our candles so the engine can mark up exactly what it
// sees: structure levels, liquidity, order blocks, FVGs, trendlines, and the
// direction it reads flow as going.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChartLine, ChartPlan, Tf } from "@/lib/types";

const TFS: Tf[] = ["1m", "5m", "15m", "1h", "4h"];
const REFRESH_MS = 30_000;

const FUTURE_BARS = 18; // room on the right for the projection

/** Axis gutter and candle count both scale with width — 160 bars squeezed into a
 *  phone screen is a smear, not a chart. */
function layoutFor(width: number) {
  const narrow = width < 560;
  return {
    pad: { top: 16, right: narrow ? 56 : 74, bottom: 26, left: 8 },
    bars: narrow ? 60 : width < 860 ? 100 : 160,
    tickCount: narrow ? 3 : 6,
  };
}

/** Colour + dash per level kind. Liquidity is amber (that's where stops are),
 *  structure breaks are violet, plain swings are grey, the day's levels blue. */
const LINE_STYLE: Record<ChartLine["kind"], { stroke: string; dash: string; text: string }> = {
  swing_high: { stroke: "#71717a", dash: "4 4", text: "#a1a1aa" },
  swing_low: { stroke: "#71717a", dash: "4 4", text: "#a1a1aa" },
  eqh: { stroke: "#f59e0b", dash: "2 3", text: "#fbbf24" },
  eql: { stroke: "#f59e0b", dash: "2 3", text: "#fbbf24" },
  bos: { stroke: "#a78bfa", dash: "6 3", text: "#c4b5fd" },
  choch: { stroke: "#f472b6", dash: "6 3", text: "#f9a8d4" },
  range_eq: { stroke: "#38bdf8", dash: "1 4", text: "#7dd3fc" },
  pdh: { stroke: "#60a5fa", dash: "8 4", text: "#93c5fd" },
  pdl: { stroke: "#60a5fa", dash: "8 4", text: "#93c5fd" },
};

const BOX_STYLE: Record<string, { fill: string; stroke: string }> = {
  ob_bull: { fill: "rgba(16,185,129,0.14)", stroke: "rgba(16,185,129,0.5)" },
  ob_bear: { fill: "rgba(244,63,94,0.14)", stroke: "rgba(244,63,94,0.5)" },
  fvg_bull: { fill: "rgba(56,189,248,0.10)", stroke: "rgba(56,189,248,0.35)" },
  fvg_bear: { fill: "rgba(168,85,247,0.10)", stroke: "rgba(168,85,247,0.35)" },
};

function fmtPrice(x: number): string {
  return x.toLocaleString("en-US", { maximumFractionDigits: x < 100 ? 4 : 2 });
}

function fmtTime(ms: number, tf: Tf): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  if (tf === "4h" || tf === "1h") {
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

export function AutoChart({ asset }: { asset: string }) {
  const [tf, setTf] = useState<Tf>("15m");
  const [plan, setPlan] = useState<ChartPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(900);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chart/${asset}?tf=${tf}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPlan(json);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [asset, tf]);

  useEffect(() => {
    queueMicrotask(load);
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // We measure the scroll container, not a plain wrapper: `overflow-x-auto`
  // stops the SVG from stretching its own parent, so the width we read is the
  // space actually available rather than whatever we rendered last time.
  // ResizeObserver alone isn't enough — some embedded webviews never deliver its
  // callback — so measure directly on mount and on resize, with the observer as
  // an enhancement for container changes that don't resize the window.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.max(280, Math.round(w)));
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  const height = Math.round(Math.min(560, Math.max(380, width * 0.48)));

  const geom = useMemo(() => {
    if (!plan?.candles.length) return null;
    const { pad: PAD, bars, tickCount } = layoutFor(width);
    const cs = plan.candles.slice(-bars);
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const slots = cs.length + FUTURE_BARS;
    const barW = plotW / slots;

    // Vertical range covers the candles, every drawn level, and the projection,
    // so nothing the bot marked can fall outside the visible area.
    let lo = Math.min(...cs.map((c) => c.low));
    let hi = Math.max(...cs.map((c) => c.high));
    for (const l of plan.lines) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); }
    for (const b of plan.boxes) { lo = Math.min(lo, b.bottom); hi = Math.max(hi, b.top); }
    for (const p of plan.projection) { lo = Math.min(lo, p.price); hi = Math.max(hi, p.price); }
    lo = Math.min(lo, plan.livePrice);
    hi = Math.max(hi, plan.livePrice);

    const span = hi - lo || 1;
    lo -= span * 0.04;
    hi += span * 0.04;

    const x = (i: number) => PAD.left + (i + 0.5) * barW;
    const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH;
    const stepMs = cs.length > 1 ? cs[1].time - cs[0].time : 900_000;
    const lastTime = cs[cs.length - 1].time;
    const xTime = (t: number) => x(cs.length - 1 + (t - lastTime) / stepMs);

    return { cs, barW, x, y, xTime, lo, hi, plotH, plotW, PAD, tickCount };
  }, [plan, width, height]);

  const flowColor =
    plan?.flow.direction === "bull" ? "#34d399"
    : plan?.flow.direction === "bear" ? "#fb7185"
    : "#a1a1aa";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">
            Bot chart — levels drawn automatically
          </h3>
          {plan && (
            <p className="mt-0.5 text-xs" style={{ color: flowColor }}>
              flow: <span className="font-semibold">{plan.flow.label}</span>
              <span className="text-zinc-500"> · {plan.flow.note}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 p-1">
          {TFS.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                t === tf ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div ref={wrapRef} className="w-full overflow-x-auto">
        {!plan && !error && (
          <div className="py-24 text-center text-sm text-zinc-500">Drawing the chart…</div>
        )}
        {plan && geom && (
          <svg
            width={width}
            height={height}
            className={loading ? "opacity-70 transition-opacity" : "transition-opacity"}
            role="img"
            aria-label={`${plan.pair} ${plan.tf} chart with the bot's marked levels`}
          >
            {/* order blocks & fair value gaps */}
            {plan.boxes.map((b, i) => {
              const st = BOX_STYLE[b.kind];
              const yTop = geom.y(b.top);
              const yBot = geom.y(b.bottom);
              const x0 = geom.xTime(b.fromTime);
              return (
                <rect
                  key={`box-${i}`}
                  x={x0}
                  y={yTop}
                  width={Math.max(2, width - geom.PAD.right - x0)}
                  height={Math.max(1.5, yBot - yTop)}
                  fill={st.fill}
                  stroke={st.stroke}
                  strokeWidth={1}
                >
                  <title>{`${b.label} ${fmtPrice(b.bottom)}–${fmtPrice(b.top)}`}</title>
                </rect>
              );
            })}

            {/* horizontal levels */}
            {plan.lines.map((l, i) => {
              const st = LINE_STYLE[l.kind];
              const yy = geom.y(l.price);
              return (
                <g key={`line-${i}`}>
                  <line
                    x1={geom.PAD.left}
                    x2={width - geom.PAD.right}
                    y1={yy}
                    y2={yy}
                    stroke={st.stroke}
                    strokeWidth={1}
                    strokeDasharray={st.dash}
                    opacity={l.swept ? 0.45 : 0.9}
                  >
                    <title>{l.label}</title>
                  </line>
                  <text
                    x={width - geom.PAD.right + 4}
                    y={yy + 3}
                    fontSize={9}
                    fill={st.text}
                    opacity={l.swept ? 0.55 : 1}
                  >
                    {fmtPrice(l.price)}
                  </text>
                </g>
              );
            })}

            {/* fitted trendlines */}
            {plan.trendlines.map((t, i) => {
              const yAt = (ms: number) => geom.y(t.intercept + t.slope * (ms - t.t0));
              return (
                <line
                  key={`tl-${i}`}
                  x1={geom.xTime(t.fromTime)}
                  y1={yAt(t.fromTime)}
                  x2={geom.xTime(t.toTime)}
                  y2={yAt(t.toTime)}
                  stroke={t.kind === "support" ? "#34d399" : "#fb7185"}
                  strokeWidth={1.5}
                  opacity={0.85}
                >
                  <title>{t.label}</title>
                </line>
              );
            })}

            {/* candles */}
            {geom.cs.map((c, i) => {
              const up = c.close >= c.open;
              const col = up ? "#10b981" : "#f43f5e";
              const cx = geom.x(i);
              const bw = Math.max(1, geom.barW * 0.62);
              const yO = geom.y(c.open);
              const yC = geom.y(c.close);
              return (
                <g key={`c-${c.time}`}>
                  <line x1={cx} x2={cx} y1={geom.y(c.high)} y2={geom.y(c.low)} stroke={col} strokeWidth={1} />
                  <rect
                    x={cx - bw / 2}
                    y={Math.min(yO, yC)}
                    width={bw}
                    height={Math.max(1, Math.abs(yC - yO))}
                    fill={col}
                  />
                </g>
              );
            })}

            {/* projected flow */}
            <path
              d={plan.projection
                .map((p, i) => `${i === 0 ? "M" : "L"} ${geom.xTime(p.time)} ${geom.y(p.price)}`)
                .join(" ")}
              fill="none"
              stroke={flowColor}
              strokeWidth={2}
              strokeDasharray="5 4"
              opacity={0.9}
            />
            {plan.projection.slice(1).map((p, i) => (
              <circle
                key={`pj-${i}`}
                cx={geom.xTime(p.time)}
                cy={geom.y(p.price)}
                r={2.5}
                fill={flowColor}
                opacity={0.9}
              >
                <title>{`projected ${fmtPrice(p.price)}`}</title>
              </circle>
            ))}

            {/* live price */}
            <line
              x1={geom.PAD.left}
              x2={width - geom.PAD.right}
              y1={geom.y(plan.livePrice)}
              y2={geom.y(plan.livePrice)}
              stroke="#e4e4e7"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <rect
              x={width - geom.PAD.right + 1}
              y={geom.y(plan.livePrice) - 8}
              width={geom.PAD.right - 3}
              height={16}
              rx={3}
              fill="#e4e4e7"
            />
            <text
              x={width - geom.PAD.right + 5}
              y={geom.y(plan.livePrice) + 4}
              fontSize={10}
              fontWeight={700}
              fill="#18181b"
            >
              {fmtPrice(plan.livePrice)}
            </text>

            {/* time axis */}
            {geom.cs
              .filter((_, i) => i % Math.max(1, Math.floor(geom.cs.length / geom.tickCount)) === 0)
              .map((c, i) => (
                <text
                  key={`t-${i}`}
                  x={geom.xTime(c.time)}
                  y={height - 8}
                  fontSize={9}
                  fill="#71717a"
                  textAnchor="middle"
                >
                  {fmtTime(c.time, plan.tf)}
                </text>
              ))}
          </svg>
        )}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["#f59e0b", "equal highs/lows — liquidity"],
    ["#a78bfa", "BOS"],
    ["#f472b6", "CHoCH"],
    ["#60a5fa", "prev day high/low"],
    ["#38bdf8", "range equilibrium"],
    ["#71717a", "swing level"],
    ["rgba(16,185,129,0.6)", "order block"],
    ["rgba(168,85,247,0.6)", "fair value gap"],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      {items.map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: c }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-zinc-400" />
        projected flow
      </span>
    </div>
  );
}
