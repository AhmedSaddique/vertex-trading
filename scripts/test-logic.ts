/* Logic verification: crafted-candle unit checks + synthetic market run.
   Run:  npx tsx scripts/test-logic.ts                                    */
import { detectCandles } from "../lib/candles";
import { detectCrt } from "../lib/crt";
import { analyze } from "../lib/signals";
import { findFvgs, recentSweep } from "../lib/smc";
import { drawBoxes, drawLines, drawTrendlines, projectFlow } from "../lib/levels";
import { readFlow } from "../lib/mtf";
import { toGeminiSchema } from "../lib/vision/gemini";
import { SCHEMA, normalizeAnalysis, parseJsonReply } from "../lib/vision/prompt";
import { currentBias, findSwings, structureEvents } from "../lib/structure";
import type { Candle, Tf, TfAnalysis } from "../lib/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const M15 = 15 * 60 * 1000;
const H4 = 4 * 3600 * 1000;
function mk(rows: number[][], stepMs = M15): Candle[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return rows.map((r, i) => ({
    time: t0 + i * stepMs, open: r[0], high: r[1], low: r[2], close: r[3], volume: 100,
  }));
}

// ---------------------------------------------------------------- unit checks
console.log("== Candlestick patterns");
{
  const rows = [...Array(5).fill([100, 101, 99, 99.2]), [99.2, 99.5, 98.8, 99.0], [98.9, 100.5, 98.7, 100.4]];
  check("bullish engulfing", detectCandles(mk(rows)).some((c) => c.name === "Bullish Engulfing"));
}
{
  const rows = [...Array(5).fill([100, 101, 99, 100.5]), [100.5, 100.7, 97.5, 100.4]];
  check("bullish pin bar", detectCandles(mk(rows)).some((c) => c.name.includes("Pin Bar") && c.direction === "bull"));
}

console.log("== FVG");
{
  const fv = findFvgs(mk([[100, 101, 99, 100.5], [100.5, 103, 100.4, 102.8], [103.2, 105, 103.1, 104.5]]));
  const z = fv.find((z) => z.kind === "fvg_bull");
  check("bullish FVG detected", !!z);
  check("FVG zone is (101, 103.1)", !!z && Math.abs(z.bottom - 101) < 1e-9 && Math.abs(z.top - 103.1) < 1e-9);
}

console.log("== CRT");
{
  const r = detectCrt(mk([...Array(3).fill([100, 102, 98, 101]), [101, 103, 97, 102], [102, 102.5, 96.2, 99.5]], H4));
  check("bullish CRT (swept prev low, closed inside)", r?.direction === "bull");
}
{
  const r = detectCrt(mk([...Array(3).fill([100, 102, 98, 101]), [101, 103, 97, 99], [99, 104.2, 98.8, 101.5]], H4));
  check("bearish CRT (swept prev high, closed inside)", r?.direction === "bear");
}

console.log("== Structure");
{
  const rows: number[][] = [];
  let p = 100;
  for (let k = 0; k < 40; k++) {
    const wave = 2 * Math.sin(k / 3);
    p += 0.4;
    rows.push([p + wave, p + wave + 1.2, p + wave - 1.2, p + wave + 0.5]);
  }
  const df = mk(rows);
  check("uptrend detected as bull bias", currentBias(df).bias === "bull");
  const sw = findSwings(df);
  check("swings found", sw.length >= 4);
  check("structure events generated", structureEvents(df, sw).length >= 1);
}

console.log("== Liquidity sweep");
{
  const rows = [
    ...Array(10).fill([100, 101, 99, 100.3]),
    [100.3, 100.8, 98.95, 100.1],
    ...Array(4).fill([100.1, 100.6, 99.4, 100.2]),
    [100.2, 100.4, 98.4, 99.9],
  ];
  const df = mk(rows);
  const s = recentSweep(df, findSwings(df), 3);
  check("sweep of low detected -> favors bull", s?.favors === "bull");
}

// ---------------------------------------------------------------- synthetic market
console.log("== Synthetic market run (no-crash + selective signals)");

let seed = 7;
function rand(): number { // deterministic LCG
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function synth(n = 1400, start = 100): Candle[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const out: Candle[] = [];
  let prev = start;
  let trend = 0;
  const trends = [-0.05, 0, 0.05, 0.08, -0.08];
  for (let i = 0; i < n; i++) {
    if (i % 160 === 0) trend = trends[Math.floor(rand() * trends.length)];
    const close = Math.max(1, prev + trend + gauss() * 0.35);
    const open = prev;
    const high = Math.max(open, close) + Math.abs(gauss() * 0.25);
    const low = Math.min(open, close) - Math.abs(gauss() * 0.25);
    out.push({ time: t0 + i * M15, open, high, low, close, volume: 100 });
    prev = close;
  }
  return out;
}

function resample4h(c15: Candle[]): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const c of c15) {
    const key = Math.floor(c.time / H4) * H4;
    const b = buckets.get(key);
    if (!b) buckets.set(key, { ...c, time: key });
    else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

let nSignals = 0, nChecked = 0, errors = 0;
const directions = new Set<string>();
for (let run = 0; run < 4; run++) {
  const c15 = synth(1400, 100 + run * 40);
  const c4hAll = resample4h(c15);
  for (let i = 300; i < c15.length; i += 4) {
    const sub15 = c15.slice(0, i);
    const cutoff = sub15[sub15.length - 1].time;
    const sub4h = c4hAll.filter((c) => c.time + H4 <= cutoff);
    if (sub4h.length < 30) continue;
    nChecked++;
    try {
      const res = analyze("TEST", sub15, sub4h, 7.5);
      const sig = res?.signal ?? null;
      if (sig) {
        nSignals++;
        directions.add(sig.direction);
        const okLevels =
          (sig.direction === "BUY" &&
            sig.stopLoss < sig.entry && sig.entry < sig.takeProfit1 && sig.takeProfit1 <= sig.takeProfit2 + 1e-9) ||
          (sig.direction === "SELL" &&
            sig.stopLoss > sig.entry && sig.entry > sig.takeProfit1 && sig.takeProfit1 >= sig.takeProfit2 - 1e-9);
        if (!okLevels) { errors++; console.log("   BAD LEVELS:", JSON.stringify(sig)); }
      }
    } catch (e) {
      errors++;
      console.log("   analyze error:", e);
    }
  }
}
console.log(`  windows checked: ${nChecked}, signals: ${nSignals}, errors: ${errors}`);
check("no crashes / bad levels", errors === 0);
const rate = nSignals / Math.max(nChecked, 1);
check("signals fire but are selective (0.5%–15% of windows)", rate >= 0.005 && rate <= 0.15);
check("both BUY and SELL occur", (directions.has("BUY") && directions.has("SELL")) || nSignals < 4);


// ---------------------------------------------------------------- flow + drawings
console.log("== Multi-timeframe flow read");
{
  const mk = (tf: Tf, bias: "bull" | "bear", strength: "strong" | "weak"): TfAnalysis => ({
    tf, biasTf: "x", bias, biasStrength: strength,
    score: 0, minScore: 7.5, reasons: [], signal: null,
  });

  const allBull = readFlow([
    mk("1m", "bull", "strong"), mk("5m", "bull", "strong"), mk("15m", "bull", "strong"),
    mk("1h", "bull", "strong"), mk("4h", "bull", "strong"),
  ]);
  check("aligned bull ladder -> strong up-flow", allBull.direction === "bull" && allBull.label === "strong up-flow");

  // Fast timeframes must not carry a "strong" call while both heavies disagree.
  const noisyLtf = readFlow([
    mk("1m", "bull", "strong"), mk("5m", "bull", "strong"), mk("15m", "bull", "strong"),
    mk("1h", "bear", "strong"), mk("4h", "bear", "strong"),
  ]);
  check("1h/4h against fast TFs -> not a strong call", noisyLtf.label !== "strong up-flow");

  const split = readFlow([
    mk("1m", "bull", "strong"), mk("5m", "bear", "strong"), mk("15m", "bull", "strong"),
    mk("1h", "bear", "strong"), mk("4h", "bull", "weak"),
  ]);
  check("split ladder -> mixed", split.direction === "mixed");

  check("no data -> mixed, zero agreement", readFlow([]).agreement === 0);

  // Errored timeframes are excluded, not counted toward agreement.
  const withError = readFlow([
    { ...mk("1m", "bull", "strong"), error: "no data" },
    mk("1h", "bear", "strong"), mk("4h", "bear", "strong"),
  ]);
  check("errored TF ignored in flow", withError.direction === "bear");
}

console.log("== Chart drawings");
{
  const cs = synth(600, 250);
  const swings = findSwings(cs, 2);
  const lines = drawLines(cs, swings);
  const boxes = drawBoxes(cs, swings);
  const tls = drawTrendlines(cs, swings);

  check("levels drawn", lines.length > 0);
  check("levels are finite numbers", lines.every((l) => Number.isFinite(l.price)));
  check("levels sorted high -> low", lines.every((l, i) => i === 0 || lines[i - 1].price >= l.price));
  check("boxes have top >= bottom", boxes.every((b) => b.top >= b.bottom));
  check("trendlines have >= 2 touches", tls.every((t) => t.touches >= 2));

  const price = cs[cs.length - 1].close;
  const step = cs[1].time - cs[0].time;
  const flowOf = (direction: "bull" | "bear" | "mixed") =>
    ({ direction, agreement: 1, label: "l", note: "n" }) as const;

  const bullPath = projectFlow(cs, lines, flowOf("bull"), step);
  // projectFlow rounds to 7 significant digits, so compare relatively.
  check("projection starts at current price", Math.abs(bullPath[0].price - price) < Math.abs(price) * 1e-6);
  check("projection extends into the future", bullPath[bullPath.length - 1].time > cs[cs.length - 1].time);
  check("bull projection ends above spot", bullPath[bullPath.length - 1].price > price);

  const bearPath = projectFlow(cs, lines, flowOf("bear"), step);
  check("bear projection ends below spot", bearPath[bearPath.length - 1].price < price);
}


// ---------------------------------------------------------------- vision plumbing
console.log("== Vision reply parsing");
{
  check("plain JSON", (parseJsonReply('{"a":1}') as { a: number }).a === 1);
  check(
    "fenced \`\`\`json block",
    (parseJsonReply('\`\`\`json\\n{"a":2}\\n\`\`\`') as { a: number }).a === 2,
  );
  check("bare fence", (parseJsonReply('\`\`\`\\n{"a":3}\\n\`\`\`') as { a: number }).a === 3);
  check(
    "JSON wrapped in prose",
    (parseJsonReply('Here you go:\\n{"a":4}\\nHope that helps.') as { a: number }).a === 4,
  );

  let threwOnEmpty = false;
  try { parseJsonReply("   "); } catch { threwOnEmpty = true; }
  check("empty reply throws", threwOnEmpty);

  let threwOnGarbage = false;
  try { parseJsonReply("not json at all"); } catch { threwOnGarbage = true; }
  check("garbage reply throws", threwOnGarbage);
}

console.log("== Vision result normalising");
{
  // A provider that ignores half the schema must not crash the UI.
  const bare = normalizeAnalysis({});
  check("missing fields get defaults", bare.direction === "UNCLEAR" && bare.trade.bias === "WAIT");
  check("missing arrays become empty arrays", Array.isArray(bare.smc) && bare.smc.length === 0);
  check("missing levels become empty array", Array.isArray(bare.levels) && bare.levels.length === 0);

  check("confidence clamped high", normalizeAnalysis({ direction: "UP", confidence: 99 }).confidence === 10);
  check("confidence clamped low", normalizeAnalysis({ direction: "UP", confidence: -5 }).confidence === 0);
  check("non-numeric confidence -> 0", normalizeAnalysis({ direction: "UP", confidence: "high" }).confidence === 0);

  check("lowercase direction accepted", normalizeAnalysis({ direction: "down" }).direction === "DOWN");
  check("nonsense direction -> UNCLEAR", normalizeAnalysis({ direction: "sideways" }).direction === "UNCLEAR");

  // A confident-sounding number behind an UNCLEAR read would mislead the gauge.
  check("UNCLEAR caps confidence", normalizeAnalysis({ direction: "UNCLEAR", confidence: 9 }).confidence === 3);

  const withJunk = normalizeAnalysis({
    direction: "UP", confidence: 7,
    smc: ["real entry", "", null, 42],
    levels: [{ label: "PDH", price: 4460 }, {}, { label: "", price: "" }],
    trade: { bias: "buy", entry: 4430 },
  });
  check(
    "array entries coerced, blanks dropped",
    withJunk.smc.length === 2 && withJunk.smc[0] === "real entry" && withJunk.smc[1] === "42",
  );
  check("numeric level price coerced to string", withJunk.levels[0].price === "4460");
  check("empty level dropped", withJunk.levels.length === 1);
  check("lowercase trade bias accepted", withJunk.trade.bias === "BUY");
  check("numeric entry coerced", withJunk.trade.entry === "4430");
  check("missing stop gets placeholder", withJunk.trade.stopLoss === "—");
}

console.log("== Gemini schema conversion");
{
  const converted = toGeminiSchema(SCHEMA) as Record<string, unknown>;
  const asText = JSON.stringify(converted);
  check("additionalProperties stripped everywhere", !asText.includes("additionalProperties"));
  check("properties preserved", !!(converted.properties as Record<string, unknown>)?.direction);
  check("required preserved", Array.isArray(converted.required));
  check("nested enum preserved", asText.includes('"UNCLEAR"'));
  check("source schema not mutated", JSON.stringify(SCHEMA).includes("additionalProperties"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
