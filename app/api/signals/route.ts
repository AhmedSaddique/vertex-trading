// GET /api/signals — analyze all pairs (no Telegram send). Used by the dashboard.
import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const results = await scanAll();
  return NextResponse.json({ results, at: Date.now() });
}
