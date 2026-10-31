import { db } from "@/db";
import { reminderLog } from "@/db/schema";
import type { ReminderStage, Task } from "@/types";
import { daysBetween, formatDue, localDate, localHour } from "@/lib/dates";
import { listRemindableTasks } from "./task.service";
import { effectiveStreak, getOrCreateStats } from "./reward.service";
import { notify, taskButtons } from "./notification.service";

const QUIET_START = Number(process.env.QUIET_HOURS_START ?? 23); // no molestar desde las 23:00
const QUIET_END = Number(process.env.QUIET_HOURS_END ?? 8); // …hasta las 08:00
const STREAK_WARNING_HOUR = 19; // a partir de las 7 pm avisa si tu racha está en riesgo

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Mensajes que suben de tono según se acerca la fecha (estilo Duolingo). */
const MESSAGES: Record<ReminderStage, ((t: string) => string)[]> = {
  d3: [
    (t) => `📅 En 3 días vence <b>${t}</b>. Un avance pequeño hoy y llegas sobrado.`,
    (t) => `👀 Se acerca <b>${t}</b>. ¿Le das 25 minutos hoy?`,
  ],
  d1: [
    (t) => `⏳ <b>Mañana</b> vence <b>${t}</b>. ¿Lo cerramos hoy y te llevas el bonus de puntualidad?`,
    (t) => `🚨 Queda 1 día para <b>${t}</b>. Tú puedes, empieza por lo más fácil.`,
  ],
  today: [
    (t) => `🔥 <b>Hoy</b> es el día de <b>${t}</b>. Termínalo y suma XP extra.`,
    (t) => `⚡ Último día para <b>${t}</b>. Tu yo de mañana te lo va a agradecer.`,
  ],
  overdue: [
    (t) => `😬 <b>${t}</b> se pasó de la fecha. No pasa nada: termínalo hoy o muévelo a otro día.`,
    (t) => `🫠 <b>${t}</b> sigue pendiente. ¿Lo reprogramamos o lo matamos ahora?`,
  ],
};

export function stageFor(task: Task, now: Date): ReminderStage | null {
  if (!task.dueAt) return null;
  if (now > task.dueAt) return "overdue";
  const days = daysBetween(localDate(now), localDate(task.dueAt));
  if (days === 0) return "today";
  if (days === 1) return "d1";
  if (days <= 3) return "d3";
  return null;
}

/** "Reclama" un recordatorio antes de enviarlo; si ya existe, devuelve false (evita duplicados). */
async function claim(values: { taskId?: number; stage?: ReminderStage; key?: string }) {
  const rows = await db.insert(reminderLog).values(values).onConflictDoNothing().returning({ id: reminderLog.id });
  return rows.length > 0;
}

/** Lo llama el cron cada 15–30 min. Revisa qué toca avisar y lo envía. */
export async function runReminders(now = new Date()) {
  const hour = localHour(now);
  const quiet = QUIET_START > QUIET_END ? hour >= QUIET_START || hour < QUIET_END : hour >= QUIET_START && hour < QUIET_END;
  if (quiet) return { sent: 0, skipped: "quiet-hours" as const };

  let sent = 0;

  // 1) Recordatorios por fecha límite
  for (const task of await listRemindableTasks(now)) {
    const stage = stageFor(task, now);
    if (!stage) continue;
    if (!(await claim({ taskId: task.id, stage }))) continue;

    await notify({
      text: `${pick(MESSAGES[stage])(task.title)}\n🗓 ${formatDue(task.dueAt)}`,
      buttons: taskButtons(task.id),
      push: { title: stage === "overdue" ? "Tarea vencida" : "Fecha límite cerca", body: task.title, url: "/", tag: `task-${task.id}` },
    });
    sent++;
  }

  // 2) Racha en riesgo / volver después de días sin actividad
  const today = localDate(now);
  const stats = await getOrCreateStats();
  const streak = effectiveStreak(stats, today);
  const gap = stats.lastActiveDate ? daysBetween(stats.lastActiveDate, today) : null;

  if (hour >= STREAK_WARNING_HOUR && streak > 0 && stats.lastActiveDate !== today && (await claim({ key: `streak:${today}` }))) {
    await notify({
      text: `🔥 Tu racha de <b>${streak} día${streak === 1 ? "" : "s"}</b> está en riesgo. Completa aunque sea una tarea pequeña hoy.`,
      push: { title: `¡Racha de ${streak} en riesgo!`, body: "Una tarea pequeña basta para salvarla.", url: "/", tag: "streak" },
    });
    sent++;
  }

  if (gap !== null && gap >= 3 && hour >= 10 && (await claim({ key: `comeback:${today}` }))) {
    await notify({
      text: `👋 Hace ${gap} días que no avanzas nada. Escríbeme una tarea pequeña y arrancamos de nuevo.`,
      push: { title: "Te extrañamos 👀", body: "Una tarea pequeña y vuelves al ritmo.", url: "/", tag: "comeback" },
    });
    sent++;
  }

  return { sent };
}
