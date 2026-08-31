// Telegram alerts (server-side). Falls back to console when no token is set.
import { TELEGRAM_CHAT_ID, TELEGRAM_TOKEN } from "./config";
import type { Signal } from "./types";

export function formatSignal(sig: Signal): string {
  const arrow = sig.direction === "BUY" ? "🟢 BUY" : "🔴 SELL";
  const t = new Date(sig.time).toISOString().slice(0, 16).replace("T", " ");
  const g = (x: number) => Number(x.toPrecision(6)).toString();
  const reasons = sig.reasons.map((r) => `  • ${r}`).join("\n");
  return (
    `${arrow}  <b>${sig.pair}</b>\n` +
    `🕒 ${t} UTC (15m close)\n\n` +
    `💵 Entry: <b>${g(sig.entry)}</b>\n` +
    `🛑 Stop Loss: <b>${g(sig.stopLoss)}</b>\n` +
    `🎯 TP1 (1:${sig.rr1}): <b>${g(sig.takeProfit1)}</b>\n` +
    `🎯 TP2 (1:${sig.rr2}): <b>${g(sig.takeProfit2)}</b>\n\n` +
    `⭐ Confluence score: ${sig.score} (min ${sig.minScore})\n` +
    `${reasons}\n\n` +
    `⚠️ Not financial advice. Manage your own risk.`
  );
}

export async function sendSignal(sig: Signal): Promise<boolean> {
  const text = formatSignal(sig);
  return sendHtml(text);
}

export async function sendText(message: string): Promise<boolean> {
  return sendHtml(message.replace(/</g, "&lt;"));
}

async function sendHtml(text: string): Promise<boolean> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("\n[CONSOLE MODE - Telegram not configured]\n" + text.replace(/<\/?b>/g, ""));
    return true;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[telegram] send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[telegram] error: ${String(e)}`);
    return false;
  }
}
