// Multi-timeframe scan: runs the confluence engine once per entry timeframe
// (1m, 5m, 15m, 1h, 4h), each gated by the higher timeframe above it, then
// folds the results into a single "where is flow going" read.
import { CANDLES_PER_TF, REQUIRED_TFS, SWING_K, TF_LADDER } from "./config";
import { fetchTimeframes } from "./data";
import { analyze } from "./signals";
import type { Candle, FlowRead, MtfResult, PairConfig, Signal, Tf, TfAnalysis } from "./types";

/** Minimum bars the engine needs before a timeframe's read means anything. */
const MIN_ENTRY_BARS = 60;
const MIN_BIAS_BARS = 30;

export function readFlow(tfs: TfAnalysis[]): FlowRead {
  const scored = tfs.filter((t) => !t.error);
  if (!scored.length) {
    return { direction: "mixed", agreement: 0, label: "no read", note: "No timeframe returned data." };
  }

  const weightOf = (tf: Tf) => TF_LADDER.find((l) => l.tf === tf)?.weight ?? 1;
  let bull = 0;
  let bear = 0;
  for (const t of scored) {
    // A strong-structure timeframe carries its full weight; a weak one counts half.
    const w = weightOf(t.tf) * (t.biasStrength === "strong" ? 1 : 0.5);
    if (t.bias === "bull") bull += w;
    else bear += w;
  }

  const total = bull + bear;
  const winner = bull >= bear ? "bull" : "bear";
  const agreement = total ? Math.max(bull, bear) / total : 0;

  // Which of the heavy timeframes actually agree matters more than the count:
  // 1m and 5m flip constantly, so they can't carry a "strong flow" call alone.
  const htf = scored.filter((t) => t.tf === "1h" || t.tf === "4h");
  const htfAligned = htf.length > 0 && htf.every((t) => t.bias === winner);

  let direction: FlowRead["direction"];
  let label: string;
  if (agreement >= 0.75 && htfAligned) {
    direction = winner;
    label = winner === "bull" ? "strong up-flow" : "strong down-flow";
  } else if (agreement >= 0.6) {
    direction = winner;
    label = winner === "bull" ? "leaning up" : "leaning down";
  } else {
    direction = "mixed";
    label = "choppy / no clear flow";
  }

  const agreeing = scored.filter((t) => t.bias === winner).map((t) => t.tf);
  const against = scored.filter((t) => t.bias !== winner).map((t) => t.tf);
  const note =
    direction === "mixed"
      ? `Timeframes disagree — ${agreeing.join(", ")} say ${winner}, ${against.join(", ")} say the opposite. Low-conviction conditions.`
      : `${agreeing.join(", ")} all read ${winner}` +
        (against.length ? `; ${against.join(", ")} still against.` : " — fully aligned.") +
        (htfAligned ? "" : " Higher timeframes are not confirming yet.");

  return { direction, agreement: Math.round(agreement * 100) / 100, label, note };
}

function enough(entry: Candle[] | undefined, bias: Candle[] | undefined): string | null {
  if (!entry?.length || !bias?.length) return "data unavailable for this timeframe";
  if (entry.length < MIN_ENTRY_BARS) return `only ${entry.length} entry candles (need ${MIN_ENTRY_BARS})`;
  if (bias.length < MIN_BIAS_BARS) return `only ${bias.length} bias candles (need ${MIN_BIAS_BARS})`;
  return null;
}

export async function scanTimeframes(pair: PairConfig): Promise<MtfResult> {
  const { byTf, livePrice, priceSource } = await fetchTimeframes(
    pair,
    REQUIRED_TFS,
    CANDLES_PER_TF,
  );

  const timeframes: TfAnalysis[] = TF_LADDER.map(({ tf, biasTf, minScore }) => {
    const entry = byTf[tf];
    const bias = byTf[biasTf];
    const base: TfAnalysis = {
      tf, biasTf, bias: "bull", biasStrength: "weak",
      score: 0, minScore, reasons: [], signal: null,
    };

    const problem = enough(entry, bias);
    if (problem) return { ...base, error: problem };

    const res = analyze(`${pair.name} ${tf}`, entry, bias, minScore, SWING_K, {
      entryTf: tf,
      biasTf,
    });
    if (!res) return { ...base, error: "not enough data" };

    // The engine prices entries off the last closed candle. Re-state the entry at
    // the live price so the levels are actionable now, and re-derive the targets
    // from the same risk so the R:R the card advertises stays true.
    const signal = res.signal ? repriceToLive(res.signal, livePrice) : null;

    return {
      ...base,
      bias: res.bias,
      biasStrength: res.biasStrength,
      score: res.score,
      reasons: res.reasons,
      signal,
    };
  });

  return {
    pair: pair.name,
    price: livePrice,
    priceSource,
    timeframes,
    flow: readFlow(timeframes),
    updatedAt: Date.now(),
  };
}

/** Move a signal's entry to the live price and keep the structural stop where it
 *  is, so the R:R quoted is the R:R actually available now. Structural targets
 *  (swing highs/lows, CRT range) are preserved when price hasn't already reached
 *  them; otherwise they fall back to a plain 2R/3R projection. Returns null when
 *  price has run past the stop — that setup is dead, not merely late. */
function repriceToLive(sig: Signal, live: number): Signal | null {
  const long = sig.direction === "BUY";
  const risk = long ? live - sig.stopLoss : sig.stopLoss - live;
  if (risk <= 0) return null;

  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  const ahead = (target: number) => (long ? target > live : target < live);
  const project = (r: number) => (long ? live + r * risk : live - r * risk);

  const tp1 = ahead(sig.takeProfit1) ? sig.takeProfit1 : project(2);
  const tp2 = ahead(sig.takeProfit2) ? sig.takeProfit2 : project(3);

  return {
    ...sig,
    entry: round(live),
    takeProfit1: round(tp1),
    takeProfit2: round(tp2),
    rr1: Math.round((Math.abs(tp1 - live) / risk) * 100) / 100,
    rr2: Math.round((Math.abs(tp2 - live) / risk) * 100) / 100,
  };
}
