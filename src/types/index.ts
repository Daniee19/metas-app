import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { goals, tasks, activityEvents, userStats } from "@/db/schema";

export type Goal = InferSelectModel<typeof goals>;
export type Task = InferSelectModel<typeof tasks>;
export type NewTask = InferInsertModel<typeof tasks>;
export type ActivityEvent = InferSelectModel<typeof activityEvents>;
export type UserStats = InferSelectModel<typeof userStats>;

export type Difficulty = Task["difficulty"];
export type ReminderStage = "d3" | "d1" | "today" | "overdue";

/** Resultado de completar una tarea: lo que se le muestra al usuario como recompensa. */
export interface CompletionReward {
  task: Task;
  xpGained: number;
  bonusOnTime: boolean;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  streak: number;
  streakIncreased: boolean;
}

/** Lo que se manda a una notificación push del navegador. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}
