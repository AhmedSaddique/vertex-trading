// Background scheduler: when the server starts (`next start` or `next dev`),
// scan at every 15-minute candle close and push Telegram alerts.
// Disable with ENABLE_SCANNER=false (e.g. on Vercel — use Vercel Cron
// hitting /api/scan instead, since serverless can't hold an interval).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ENABLE_SCANNER } = await import("./lib/config");
  if (!ENABLE_SCANNER) return;

  const { scanAndAlert } = await import("./lib/scanner");
  const { sendText } = await import("./lib/telegram");

  const globalAny = globalThis as { __signalsScannerStarted?: boolean };
  if (globalAny.__signalsScannerStarted) return; // avoid double-start in dev
  globalAny.__signalsScannerStarted = true;

  console.log("[scanner] background scanner enabled — scanning every 15m candle close");
  sendText("✅ Signals bot server started and watching the market.").catch(() => {});

  const run = async () => {
    try {
      const { alerted } = await scanAndAlert();
      console.log(
        `[scanner] ${new Date().toISOString()} scan done` +
        (alerted.length ? ` — alerts: ${alerted.join(", ")}` : " — no new signals"),
      );
    } catch (e) {
      console.error("[scanner] scan failed:", e);
    }
  };

  const PERIOD = 15 * 60 * 1000;
  const schedule = () => {
    const wait = PERIOD - (Date.now() % PERIOD) + 20_000; // 20s after candle close
    setTimeout(async () => {
      await run();
      schedule();
    }, wait);
  };

  run(); // immediate first scan
  schedule();
}
