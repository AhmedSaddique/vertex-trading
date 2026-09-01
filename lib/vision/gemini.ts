// Google Gemini adapter (Interactions API). Gemini's free tier from
// aistudio.google.com needs no card, which makes it the default when a
// GEMINI_API_KEY is present.
import { GEMINI_API_KEY, GEMINI_MODEL } from "../config";
import type { VisionAnalysis } from "../types";
import {
  SCHEMA, SYSTEM, type SupportedMedia, buildAsk, normalizeAnalysis, parseJsonReply,
} from "./prompt";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
// The Interactions API is revision-pinned; sending a known revision keeps the
// request shape stable when Google ships a newer one.
const API_REVISION = "2026-05-20";

/** Gemini accepts a subset of JSON Schema. `additionalProperties` buys us
 *  nothing there (it exists for Anthropic's strict mode) and risks a 400 on a
 *  stricter validator, so strip it on the way out. */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return node;
}

/** The Interactions response puts the reply in `output_text`, but wrappers and
 *  the older `candidates` shape both turn up depending on revision — check the
 *  documented path first, then fall back rather than failing on a rename. */
function extractText(json: unknown): string {
  const root = json as Record<string, unknown>;
  const interaction = (root?.interaction ?? root) as Record<string, unknown>;

  const direct = interaction?.output_text ?? root?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const chunks: string[] = [];
  const walk = (n: unknown, depth = 0) => {
    if (depth > 6 || !n) return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, depth + 1));
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.text === "string" && o.text.trim()) chunks.push(o.text);
    for (const key of ["output", "model_output", "content", "parts", "steps", "candidates"]) {
      if (key in o) walk(o[key], depth + 1);
    }
  };
  walk(interaction);
  return chunks.join("");
}

function describeError(status: number, body: string): string {
  const snippet = body.slice(0, 300);
  if (status === 400 && /API key not valid/i.test(body)) {
    return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.";
  }
  if (status === 403) {
    return "Gemini refused the request (403). The key may lack access or the API is not enabled for this project.";
  }
  if (status === 404) {
    return `Gemini has no model called '${GEMINI_MODEL}'. Set GEMINI_MODEL in .env.local to a current one (e.g. gemini-3.7-flash).`;
  }
  if (status === 429) {
    return "Gemini free-tier rate limit hit. Wait a minute and try again, or switch models with GEMINI_MODEL.";
  }
  return `Gemini HTTP ${status}: ${snippet}`;
}

export async function analyzeWithGemini(
  base64: string,
  mediaType: SupportedMedia,
  note?: string,
): Promise<VisionAnalysis> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
      "Api-Revision": API_REVISION,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      system_instruction: SYSTEM,
      input: [
        { type: "image", data: base64, mime_type: mediaType },
        { type: "text", text: buildAsk(note) },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: toGeminiSchema(SCHEMA),
      },
    }),
  });

  if (!res.ok) throw new Error(describeError(res.status, await res.text()));

  const text = extractText(await res.json());
  if (!text.trim()) throw new Error("Gemini returned no text in its response.");
  return normalizeAnalysis(parseJsonReply(text));
}
