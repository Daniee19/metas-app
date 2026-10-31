import { webhookCallback } from "grammy";
import { getBot } from "@/bot";

// Telegram llama a esta ruta cada vez que le escribes al bot o tocas un botón.
export async function POST(request: Request) {
  const handler = webhookCallback(getBot(), "std/http", {
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  });
  return handler(request);
}
