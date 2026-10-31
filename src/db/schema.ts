import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────
export const difficultyEnum = pgEnum("difficulty", ["s", "m", "l"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "done"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "done", "archived"]);
export const eventTypeEnum = pgEnum("event_type", [
  "task_created",
  "task_started",
  "task_completed",
  "task_snoozed",
  "streak_freeze_used",
  "level_up",
]);
export const reminderStageEnum = pgEnum("reminder_stage", [
  "d3", // 3 días antes
  "d1", // 1 día antes
  "today", // el día límite
  "overdue", // vencida
]);

// ── Metas ────────────────────────────────────────────────────────────────
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").default("🎯"),
  status: goalStatusEnum("status").notNull().default("active"),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Tareas ───────────────────────────────────────────────────────────────
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    difficulty: difficultyEnum("difficulty").notNull().default("m"),
    status: taskStatusEnum("status").notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_status_due_idx").on(t.status, t.dueAt)],
);

// ── Trazabilidad: todo lo que pasa queda registrado ──────────────────────
export const activityEvents = pgTable(
  "activity_events",
  {
    id: serial("id").primaryKey(),
    type: eventTypeEnum("type").notNull(),
    taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
    xp: integer("xp").notNull().default(0),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_created_idx").on(t.createdAt)],
);

// ── Estadísticas (una sola fila, id = 1: la app es solo para ti) ─────────
export const userStats = pgTable("user_stats", {
  id: integer("id").primaryKey().default(1),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: date("last_active_date"), // YYYY-MM-DD en tu zona horaria
  freezesAvailable: integer("freezes_available").notNull().default(1),
  freezesRefilledAt: date("freezes_refilled_at"),
});

// ── Notificaciones push del navegador ────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Evita mandar el mismo recordatorio dos veces ─────────────────────────
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    // para recordatorios que no son de una tarea (ej. "racha en riesgo")
    key: text("key"),
    stage: reminderStageEnum("stage"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reminder_task_stage_uq").on(t.taskId, t.stage),
    uniqueIndex("reminder_key_uq").on(t.key),
  ],
);
