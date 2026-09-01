// GET /api/mtf/[asset] — one confluence read per timeframe (1m, 5m, 15m, 1h, 4h)
// plus the folded "where is flow going" verdict. Prices are live spot, not the
// last candle close.
import { NextResponse } from "next/server";
import { scanTimeframes } from "@/lib/mtf";
import { pairForAsset } from "@/lib/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/mtf/[asset]">) {
  const { asset } = await ctx.params;
  const pair = pairForAsset(asset);
  if (!pair) {
    return NextResponse.json({ error: `Unknown market: ${asset}` }, { status: 404 });
  }
  try {
    return NextResponse.json(await scanTimeframes(pair));
  } catch (e) {
    return NextResponse.json({ error: `Scan failed: ${String(e)}` }, { status: 502 });
  }
}
