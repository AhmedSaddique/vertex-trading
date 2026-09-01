// Provider-agnostic entry point for screenshot analysis.
//
// Gemini is tried first when its key is present: AI Studio hands out a free key
// with no card, whereas the Anthropic API bills separately from a claude.ai
// subscription. Set VISION_PROVIDER to pin one explicitly.
import { ANTHROPIC_API_KEY, GEMINI_API_KEY, GEMINI_MODEL, VISION_MODEL, VISION_PROVIDER } from "../config";
import type { VisionAnalysis } from "../types";
import { analyzeWithAnthropic } from "./anthropic";
import { analyzeWithGemini } from "./gemini";
import { type SupportedMedia, VisionUnavailable } from "./prompt";

export { SUPPORTED_MEDIA, VisionUnavailable, isSupportedMedia } from "./prompt";
export type { SupportedMedia } from "./prompt";

export type Provider = "gemini" | "anthropic";

export interface ProviderInfo {
  provider: Provider | null;
  model: string | null;
  label: string | null;
}

/** Which provider will actually run, given the configured keys. */
export function activeProvider(): ProviderInfo {
  const pinned = VISION_PROVIDER.toLowerCase();
  const has: Record<Provider, boolean> = {
    gemini: Boolean(GEMINI_API_KEY),
    anthropic: Boolean(ANTHROPIC_API_KEY),
  };

  // An explicit choice wins, but only if that provider actually has a key —
  // otherwise a stale VISION_PROVIDER would disable a perfectly good key.
  const order: Provider[] =
    pinned === "anthropic" ? ["anthropic", "gemini"]
    : pinned === "gemini" ? ["gemini", "anthropic"]
    : ["gemini", "anthropic"];

  for (const p of order) {
    if (!has[p]) continue;
    return p === "gemini"
      ? { provider: "gemini", model: GEMINI_MODEL, label: `Google Gemini (${GEMINI_MODEL})` }
      : { provider: "anthropic", model: VISION_MODEL, label: `Anthropic Claude (${VISION_MODEL})` };
  }
  return { provider: null, model: null, label: null };
}

export async function analyzeChartImage(
  base64: string,
  mediaType: SupportedMedia,
  note?: string,
): Promise<{ analysis: VisionAnalysis; provider: Provider; model: string }> {
  const active = activeProvider();
  if (!active.provider || !active.model) {
    throw new VisionUnavailable(
      "No vision API key configured. Add GEMINI_API_KEY (free — aistudio.google.com) " +
        "or ANTHROPIC_API_KEY to .env.local, then restart the server.",
    );
  }

  const analysis =
    active.provider === "gemini"
      ? await analyzeWithGemini(base64, mediaType, note)
      : await analyzeWithAnthropic(base64, mediaType, note);

  return { analysis, provider: active.provider, model: active.model };
}
