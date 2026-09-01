// Anthropic Claude adapter. Higher quality on hard charts than the free tiers,
// but the API bills separately from a claude.ai subscription.
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, VISION_MODEL } from "../config";
import type { VisionAnalysis } from "../types";
import {
  SCHEMA, SYSTEM, type SupportedMedia, buildAsk, normalizeAnalysis, parseJsonReply,
} from "./prompt";

export async function analyzeWithAnthropic(
  base64: string,
  mediaType: SupportedMedia,
  note?: string,
): Promise<VisionAnalysis> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: buildAsk(note) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to analyse this image.");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return normalizeAnalysis(parseJsonReply(text));
}
