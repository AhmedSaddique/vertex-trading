// Maps a market page id (gold | btc | eth) onto its scanner PairConfig.
import { PAIRS } from "./config";
import { MARKETS } from "./markets";
import type { PairConfig } from "./types";

export function pairForAsset(asset: string): PairConfig | null {
  const market = MARKETS[asset];
  if (!market) return null;
  return PAIRS.find((p) => p.name.includes(market.pairMatch)) ?? null;
}
