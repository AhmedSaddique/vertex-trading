// POST /api/vision — multipart upload of a chart screenshot, analysed against the
// SMC / ICT / CRT playbook by whichever vision provider is configured
// (Gemini by default, Anthropic if pinned). Returns a structured VisionAnalysis.
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { VisionUnavailable, activeProvider, analyzeChartImage, isSupportedMedia } from "@/lib/vision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vision on a large screenshot can take a while.
export const maxDuration = 120;

export async function GET() {
  // Lets the UI grey out the uploader, and name the provider, instead of
  // failing only once someone hits submit.
  const { provider, model, label } = activeProvider();
  return NextResponse.json({ enabled: Boolean(provider), provider, model, label });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
    return NextResponse.json(
      { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${mb} MB.` },
      { status: 413 },
    );
  }
  if (!isSupportedMedia(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type '${file.type || "unknown"}'. Use PNG, JPEG, GIF or WebP.` },
      { status: 415 },
    );
  }

  const noteRaw = form.get("note");
  const note = typeof noteRaw === "string" ? noteRaw.slice(0, 500) : undefined;

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const { analysis, provider, model } = await analyzeChartImage(base64, file.type, note);
    return NextResponse.json({ analysis, provider, model, at: Date.now() });
  } catch (e) {
    if (e instanceof VisionUnavailable) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 502 });
  }
}
