// GET or POST /api/scan — scan all pairs AND send Telegram alerts for new
// signals (cooldown applied). Point an external cron here (e.g. Vercel Cron
// or cron-job.org every 15 minutes) if you don't use the built-in scheduler.
import { NextResponse } from "next/server";
import { scanAndAlert } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { results, alerted } = await scanAndAlert();
  return NextResponse.json({
    alerted,
    pairs: results.map((r) => ({
      pair: r.pair, score: r.score, signal: r.signal?.direction ?? null, error: r.error ?? null,
    })),
    at: Date.now(),
  });
}

export const POST = GET;
