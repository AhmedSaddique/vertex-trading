// Scans all pairs; used by the API routes and the background scheduler.
import {
  BIAS_TF, CANDLES_BIAS, CANDLES_ENTRY, COOLDOWN_CANDLES, ENTRY_TF, MIN_SCORE, PAIRS, SWING_K,
} from "./config";
import { fetchCandles } from "./data";
import { analyze } from "./signals";
import { sendSignal } from "./telegram";
import type { PairAnalysis, PairConfig } from "./types";

// Cooldown state survives between requests within one server process.
const lastSignalAt = new Map<string, number>();
const COOLDOWN_MS = COOLDOWN_CANDLES * 15 * 60 * 1000;

export async function analyzePair(pair: PairConfig): Promise<PairAnalysis> {
  const base: PairAnalysis = {
    pair: pair.name, price: 0, bias: "bull", biasStrength: "weak",
    score: 0, reasons: [], signal: null, updatedAt: Date.now(),
  };
  try {
    const [entry, bias] = await Promise.all([
      fetchCandles(pair, ENTRY_TF, CANDLES_ENTRY),
      fetchCandles(pair, BIAS_TF, CANDLES_BIAS),
    ]);
    const res = analyze(pair.name, entry, bias, MIN_SCORE, SWING_K);
    if (!res) return { ...base, error: "not enough data" };
    return {
      ...base,
      price: entry[entry.length - 1].close,
      bias: res.bias,
      biasStrength: res.biasStrength,
      score: res.score,
      reasons: res.reasons,
      signal: res.signal,
    };
  } catch (e) {
    return { ...base, error: String(e) };
  }
}

export async function scanAll(): Promise<PairAnalysis[]> {
  return Promise.all(PAIRS.map((p) => analyzePair(p)));
}

/** Scan and push new signals to Telegram (respects the cooldown). */
export async function scanAndAlert(): Promise<{ results: PairAnalysis[]; alerted: string[] }> {
  const results = await scanAll();
  const alerted: string[] = [];
  for (const r of results) {
    if (!r.signal) continue;
    const key = `${r.pair}:${r.signal.direction}`;
    const last = lastSignalAt.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) continue;
    lastSignalAt.set(key, Date.now());
    await sendSignal(r.signal);
    alerted.push(key);
  }
  return { results, alerted };
}
