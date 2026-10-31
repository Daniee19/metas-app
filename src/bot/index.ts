import { Bot, InlineKeyboard } from "grammy";
import {
  completeTask,
  createTaskFromText,
  listOpenTasks,
  listTodayTasks,
  snoozeTask,
  startTask,
} from "@/services/task.service";
import { getOrCreateStats } from "@/services/reward.service";
import { endOfLocalDay, formatDue } from "@/lib/dates";
import { escapeHtml, rewardMessage, statsMessage, taskLine } from "@/lib/messages";
import type { Task } from "@/types";

const HELP = [
  "Escríbeme cualquier tarea y la guardo. Ejemplos:",
  "• <i>Entregar informe Gobierno TIC el viernes</i>",
  "• <i>Terminar diagrama UPS #grande mañana a las 6pm</i>",
  "• <i>Responder correo IEEE #rapida</i>",
  "",
  "Dificultad: #rapida (S) · #media (M) · #grande (L)",
  "",
  "/hoy — lo que toca hoy",
  "/pendientes — todo lo abierto",
  "/stats — nivel, XP y racha",
].join("\n");

function taskKeyboard(id: number) {
  return new InlineKeyboard()
    .text("✅ Hecho", `done:${id}`)
    .text("🔥 Voy en eso", `start:${id}`)
    .row()
    .text("⏰ +3 h", `snooze:${id}:3`)
    .text("🌙 Mañana", `snooze:${id}:24`);
}

function listKeyboard(list: Task[]) {
  const kb = new InlineKeyboard();
  list.slice(0, 10).forEach((t) => kb.text(`✅ ${t.title.slice(0, 28)}`, `done:${t.id}`).row());
  return kb;
}

let bot: Bot | null = null;

export function getBot() {
  if (bot) return bot;
  bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;

  // Solo tú puedes usar el bot. Mientras no configures tu chat ID, /start te lo muestra.
  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!owner) {
      await ctx.reply(`Tu chat ID es <code>${chatId}</code>. Ponlo en TELEGRAM_OWNER_CHAT_ID y vuelve a desplegar.`, {
        parse_mode: "HTML",
      });
      return;
    }
    if (chatId !== owner) return;
    await next();
  });

  bot.command(["start", "ayuda"], (ctx) => ctx.reply(`👋 ¡Hola Daniel!\n\n${HELP}`, { parse_mode: "HTML" }));

  bot.command("hoy", async (ctx) => {
    const list = await listTodayTasks(endOfLocalDay());
    if (!list.length) return ctx.reply("🎉 No tienes nada pendiente para hoy.");
    await ctx.reply(`📋 <b>Para hoy</b>\n\n${list.map(taskLine).join("\n")}`, {
      parse_mode: "HTML",
      reply_markup: listKeyboard(list),
    });
  });

  bot.command("pendientes", async (ctx) => {
    const list = await listOpenTasks(20);
    if (!list.length) return ctx.reply("🎉 No tienes tareas abiertas.");
    await ctx.reply(`🗂 <b>Pendientes</b>\n\n${list.map(taskLine).join("\n")}`, {
      parse_mode: "HTML",
      reply_markup: listKeyboard(list),
    });
  });

  bot.command("stats", async (ctx) => {
    await ctx.reply(statsMessage(await getOrCreateStats()), { parse_mode: "HTML" });
  });

  // Cualquier texto que no sea comando = nueva tarea
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return ctx.reply(HELP, { parse_mode: "HTML" });
    const task = await createTaskFromText(ctx.message.text);
    await ctx.reply(
      `📝 Guardada: <b>${escapeHtml(task.title)}</b>\n🗓 ${formatDue(task.dueAt)} · dificultad ${task.difficulty.toUpperCase()}`,
      { parse_mode: "HTML", reply_markup: taskKeyboard(task.id) },
    );
  });

  // Botones
  bot.callbackQuery(/^done:(\d+)$/, async (ctx) => {
    const reward = await completeTask(Number(ctx.match[1]));
    await ctx.answerCallbackQuery(reward ? `+${reward.xpGained} XP` : "Ya estaba completada");
    if (reward) await ctx.reply(rewardMessage(reward), { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^start:(\d+)$/, async (ctx) => {
    const task = await startTask(Number(ctx.match[1]));
    await ctx.answerCallbackQuery(task ? "🔥 ¡Vamos!" : "No encontrada");
  });

  bot.callbackQuery(/^snooze:(\d+):(\d+)$/, async (ctx) => {
    const hours = Number(ctx.match[2]);
    await snoozeTask(Number(ctx.match[1]), hours);
    await ctx.answerCallbackQuery(hours >= 24 ? "Te aviso mañana 🌙" : `Te aviso en ${hours} h ⏰`);
  });

  bot.catch((err) => console.error("Bot error", err));
  return bot;
}
