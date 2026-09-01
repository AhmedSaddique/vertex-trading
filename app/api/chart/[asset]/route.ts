// GET /api/chart/[asset]?tf=15m — candles plus everything the bot would draw on
// them: swing levels, liquidity, order blocks, FVGs, trendlines, and the
// projected flow path.
import { NextResponse } from "next/server";
import { CANDLES_PER_TF, SWING_K, TF_LADDER } from "@/lib/config";
import { fetchTimeframes, intervalMs } from "@/lib/data";
import { buildChartPlan } from "@/lib/levels";
import { readFlow, scanTimeframes } from "@/lib/mtf";
import { pairForAsset } from "@/lib/resolve";
import type { Tf } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TFS = TF_LADDER.map((l) => l.tf);

export async function GET(req: Request, ctx: RouteContext<"/api/chart/[asset]">) {
  const { asset } = await ctx.params;
  const pair = pairForAsset(asset);
  if (!pair) {
    return NextResponse.json({ error: `Unknown market: ${asset}` }, { status: 404 });
  }

  const requested = new URL(req.url).searchParams.get("tf") ?? "15m";
  if (!VALID_TFS.includes(requested as Tf)) {
    return NextResponse.json(
      { error: `Unsupported timeframe '${requested}'. Use one of: ${VALID_TFS.join(", ")}` },
      { status: 400 },
    );
  }
  const tf = requested as Tf;

  try {
    // The flow read is a multi-timeframe verdict, so it needs the full ladder;
    // the drawing itself only needs the timeframe being displayed.
    const [mtf, data] = await Promise.all([
      scanTimeframes(pair).catch(() => null),
      fetchTimeframes(pair, [tf], CANDLES_PER_TF),
    ]);

    const candles = data.byTf[tf] ?? [];
    if (candles.length < 30) {
      return NextResponse.json(
        { error: `Only ${candles.length} candles available on ${tf}` },
        { status: 502 },
      );
    }

    const flow = mtf?.flow ?? readFlow([]);
    const plan = buildChartPlan({
      pair: pair.name,
      tf,
      candles,
      livePrice: data.livePrice,
      flow,
      stepMs: intervalMs(tf),
      swingK: SWING_K,
    });

    return NextResponse.json({ ...plan, priceSource: data.priceSource });
  } catch (e) {
    return NextResponse.json({ error: `Chart build failed: ${String(e)}` }, { status: 502 });
  }
}
