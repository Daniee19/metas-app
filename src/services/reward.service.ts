import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, userStats } from "@/db/schema";
import type { Difficulty, UserStats } from "@/types";
import { addDaysYmd, daysBetween, localDate } from "@/lib/dates";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Reglas del juego (ajústalas a tu gusto) ──────────────────────────────
export const XP_BY_DIFFICULTY: Record<Difficulty, number> = { s: 10, m: 25, l: 60 };
export const ON_TIME_BONUS = 0.5; // +50 % si terminas antes de la fecha límite
const MAX_FREEZES = 2;
const FREEZE_REFILL_DAYS = 7;

export function xpForTask(difficulty: Difficulty, onTime: boolean): number {
  const base = XP_BY_DIFFICULTY[difficulty];
  return onTime ? Math.round(base * (1 + ON_TIME_BONUS)) : base;
}

/** Nivel L necesita 50·L·(L−1) XP acumulados: N2 = 100, N3 = 300, N4 = 600, N5 = 1000… */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}
export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}
export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, current: xp - from, needed: to - from, pct: Math.round(((xp - from) / (to - from)) * 100) };
}

export async function getOrCreateStats(tx: Tx | typeof db = db): Promise<UserStats> {
  const [row] = await tx.select().from(userStats).where(eq(userStats.id, 1));
  if (row) return row;
  const [created] = await tx.insert(userStats).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await tx.select().from(userStats).where(eq(userStats.id, 1)))[0];
}

/**
 * Racha "real" para mostrar: si no hiciste nada ayer ni hoy (y no te alcanza un congelador),
 * la racha ya está rota aunque en la BD siga el número anterior.
 */
export function effectiveStreak(stats: UserStats, today = localDate()): number {
  if (!stats.lastActiveDate) return 0;
  const gap = daysBetween(stats.lastActiveDate, today);
  if (gap <= 1) return stats.currentStreak;
  if (gap - 1 <= stats.freezesAvailable) return stats.currentStreak; // aún salvable
  return 0;
}

/**
 * Registra XP + actividad del día dentro de una transacción.
 * Actualiza racha, congeladores y nivel. Devuelve el antes/después.
 */
export async function grantXp(tx: Tx, xp: number, taskId: number | null) {
  const today = localDate();
  const stats = await getOrCreateStats(tx);

  // Rellenar congeladores cada semana
  let freezes = stats.freezesAvailable;
  let refilledAt = stats.freezesRefilledAt;
  if (!refilledAt || daysBetween(refilledAt, today) >= FREEZE_REFILL_DAYS) {
    freezes = Math.min(freezes + 1, MAX_FREEZES);
    refilledAt = today;
  }

  // Calcular racha
  let streak = stats.currentStreak;
  let streakIncreased = false;
  if (stats.lastActiveDate !== today) {
    const gap = stats.lastActiveDate ? daysBetween(stats.lastActiveDate, today) : Infinity;
    const missedDays = gap - 1;
    if (gap === 1) {
      streak += 1;
    } else if (missedDays > 0 && missedDays <= freezes) {
      // Usa congeladores para salvar la racha
      freezes -= missedDays;
      streak += 1;
      for (let i = 1; i <= missedDays; i++) {
        await tx.insert(activityEvents).values({
          type: "streak_freeze_used",
          meta: { day: addDaysYmd(stats.lastActiveDate!, i) },
        });
      }
    } else {
      streak = 1;
    }
    streakIncreased = true;
  }

  const totalXp = stats.xp + xp;
  const level = levelFromXp(totalXp);
  const leveledUp = level > stats.level;

  await tx
    .update(userStats)
    .set({
      xp: totalXp,
      level,
      currentStreak: streak,
      longestStreak: sql`greatest(${userStats.longestStreak}, ${streak})`,
      lastActiveDate: today,
      freezesAvailable: freezes,
      freezesRefilledAt: refilledAt,
    })
    .where(eq(userStats.id, 1));

  if (leveledUp) {
    await tx.insert(activityEvents).values({ type: "level_up", taskId, meta: { level } });
  }

  return { totalXp, level, leveledUp, streak, streakIncreased };
}
