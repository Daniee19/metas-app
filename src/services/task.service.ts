import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, goals, reminderLog, tasks } from "@/db/schema";
import type { CompletionReward, Difficulty, Task } from "@/types";
import { parseTaskText } from "@/lib/dates";
import { grantXp, xpForTask } from "./reward.service";

const DIFFICULTY_TAGS: Record<string, Difficulty> = {
  "#s": "s", "#facil": "s", "#fácil": "s", "#rapida": "s", "#rápida": "s",
  "#m": "m", "#media": "m",
  "#l": "l", "#dificil": "l", "#difícil": "l", "#grande": "l",
};

/**
 * Convierte texto libre en una tarea.
 * "Terminar diagrama UPS #grande mañana a las 6pm" → título, dificultad L, fecha.
 */
export function parseQuickTask(raw: string) {
  let difficulty: Difficulty = "m";
  const withoutTags = raw.replace(/#\S+/g, (tag) => {
    const d = DIFFICULTY_TAGS[tag.toLowerCase()];
    if (d) difficulty = d;
    return d ? "" : tag;
  });
  const { title, dueAt } = parseTaskText(withoutTags);
  return { title, dueAt, difficulty };
}

export async function createTask(input: {
  title: string;
  dueAt?: Date | null;
  difficulty?: Difficulty;
  goalId?: number | null;
}): Promise<Task> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        dueAt: input.dueAt ?? null,
        difficulty: input.difficulty ?? "m",
        goalId: input.goalId ?? null,
      })
      .returning();
    await tx.insert(activityEvents).values({ type: "task_created", taskId: task.id });
    return task;
  });
}

export async function createTaskFromText(raw: string) {
  return createTask(parseQuickTask(raw));
}

export async function startTask(id: number) {
  const [task] = await db
    .update(tasks)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(and(eq(tasks.id, id), ne(tasks.status, "done")))
    .returning();
  if (task) await db.insert(activityEvents).values({ type: "task_started", taskId: id });
  return task ?? null;
}

export async function snoozeTask(id: number, hours = 3) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  const [task] = await db.update(tasks).set({ snoozedUntil: until }).where(eq(tasks.id, id)).returning();
  if (task) {
    await db.insert(activityEvents).values({ type: "task_snoozed", taskId: id, meta: { hours } });
    // Permite que el recordatorio vuelva a sonar cuando termine la posposición
    await db.delete(reminderLog).where(eq(reminderLog.taskId, id));
  }
  return task ?? null;
}

/** Completa una tarea y entrega la recompensa (XP, racha, nivel). Idempotente. */
export async function completeTask(id: number): Promise<CompletionReward | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
    if (!current || current.status === "done") return null;

    const now = new Date();
    // El bonus de puntualidad solo aplica a tareas con fecha límite
    const onTime = !!current.dueAt && now <= current.dueAt;
    const xp = xpForTask(current.difficulty, onTime);

    const [task] = await tx
      .update(tasks)
      .set({ status: "done", completedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    await tx.insert(activityEvents).values({ type: "task_completed", taskId: id, xp, meta: { onTime } });

    const result = await grantXp(tx, xp, id);
    return { task, xpGained: xp, bonusOnTime: onTime, ...result };
  });
}

export async function deleteTask(id: number) {
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  return deleted ?? null;
}

export async function listOpenTasks(limit = 50) {
  return db
    .select()
    .from(tasks)
    .where(ne(tasks.status, "done"))
    .orderBy(sql`${tasks.dueAt} asc nulls last`, asc(tasks.createdAt))
    .limit(limit);
}

/** Tareas para hoy: vencidas + las que vencen antes de que termine el día (+ en progreso). */
export async function listTodayTasks(endOfToday: Date) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        ne(tasks.status, "done"),
        or(lte(tasks.dueAt, endOfToday), eq(tasks.status, "in_progress")),
      ),
    )
    .orderBy(sql`${tasks.dueAt} asc nulls last`);
}

/** Tareas pendientes con fecha que no están pospuestas: candidatas a recordatorio. */
export async function listRemindableTasks(now: Date) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        ne(tasks.status, "done"),
        sql`${tasks.dueAt} is not null`,
        or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now)),
      ),
    );
}

export async function listGoalsWithProgress() {
  const rows = await db
    .select({
      goal: goals,
      total: sql<number>`count(${tasks.id})::int`,
      done: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(goals)
    .leftJoin(tasks, eq(tasks.goalId, goals.id))
    .where(eq(goals.status, "active"))
    .groupBy(goals.id);
  return rows.map((r) => ({ ...r.goal, total: r.total, done: r.done }));
}

/** XP ganado por día con nombres de tareas completadas (para el mapa de calor). */
export async function xpPerDay(since: Date, timezone: string) {
  return db
    .select({
      day: sql<string>`to_char(${activityEvents.createdAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
      xp: sql<number>`coalesce(sum(${activityEvents.xp}), 0)::int`,
      completed: sql<number>`count(*) filter (where ${activityEvents.type} = 'task_completed')::int`,
      started: sql<number>`count(*) filter (where ${activityEvents.type} = 'task_started')::int`,
      taskNames: sql<string[]>`array_agg(distinct ${tasks.title}) filter (where ${activityEvents.type} = 'task_completed')`,
    })
    .from(activityEvents)
    .leftJoin(tasks, eq(tasks.id, activityEvents.taskId))
    .where(gte(activityEvents.createdAt, since))
    .groupBy(sql`1`);
}
