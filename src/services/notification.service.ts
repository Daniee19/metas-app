import webpush from "web-push";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import type { PushPayload } from "@/types";

// ── Email (Resend) ──────────────────────────────────────────────────────
const NOTIFY_EMAILS = (process.env.NOTIFY_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail(subject: string, html: string) {
  if (!resend || !NOTIFY_EMAILS.length) return;
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Metas <onboarding@resend.dev>",
    to: NOTIFY_EMAILS,
    subject,
    html,
  });
}

// ── Telegram ─────────────────────────────────────────────────────────────
type InlineButton = { text: string; callback_data: string };

/** Envía un mensaje al dueño de la app (tú) por Telegram, con botones opcionales. */
export async function sendTelegram(text: string, buttons?: InlineButton[][]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) return;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
  });
  if (!res.ok) console.error("Telegram error", res.status, await res.text());
}

export function taskButtons(taskId: number): InlineButton[][] {
  return [
    [
      { text: "✅ Hecho", callback_data: `done:${taskId}` },
      { text: "🔥 Voy en eso", callback_data: `start:${taskId}` },
    ],
    [
      { text: "⏰ +3 h", callback_data: `snooze:${taskId}:3` },
      { text: "🌙 Mañana", callback_data: `snooze:${taskId}:24` },
    ],
  ];
}

// ── Web Push (PWA en Android) ────────────────────────────────────────────
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:yo@example.com", pub, priv);
  vapidReady = true;
  return true;
}

export async function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

/** Envía la notificación a todos tus dispositivos suscritos y limpia los que ya no existen. */
export async function sendPush(payload: PushPayload) {
  if (!ensureVapid()) return;
  const subs = await db.select().from(pushSubscriptions);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("Push error", status, err);
        }
      }
    }),
  );
}

/** Notifica por todos los canales a la vez. */
export async function notify(opts: { text: string; push: PushPayload; buttons?: InlineButton[][] }) {
  await Promise.all([
    sendTelegram(opts.text, opts.buttons),
    sendPush(opts.push),
    sendEmail(opts.push.title, opts.text),
  ]);
}
