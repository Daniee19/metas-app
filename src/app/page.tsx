import { Suspense } from "react";
import { connection } from "next/server";
import { addTaskAction } from "./actions";
import { TaskItem } from "@/components/task-item";
import { PushToggle } from "@/components/push-toggle";
import { listGoalsWithProgress, listOpenTasks, xpPerDay } from "@/services/task.service";
import { effectiveStreak, getOrCreateStats, levelProgress } from "@/services/reward.service";
import { TIMEZONE, addDaysYmd, endOfLocalDay, formatDue, localDate } from "@/lib/dates";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      <Suspense fallback={<div className="h-32 animate-pulse rounded-3xl bg-white/5" />}>
        <StatsCard />
      </Suspense>

      <form action={addTaskAction} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            name="title"
            placeholder="¿Qué necesitas hacer?"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-2xl bg-white/5 px-4 py-3 outline-none ring-violet-500 placeholder:text-zinc-500 focus:ring-2"
          />
          <button type="submit" className="rounded-2xl bg-violet-600 px-4 font-semibold">+</button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            name="deadline"
            className="rounded-xl bg-white/5 px-3 py-1.5 text-sm text-zinc-300 outline-none ring-violet-500 focus:ring-2 [color-scheme:dark]"
          />
          <div className="flex gap-1">
            {(["s", "m", "l"] as const).map((d) => (
              <label
                key={d}
                className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold uppercase transition-colors bg-white/5 text-zinc-400 has-[:checked]:bg-violet-500/20 has-[:checked]:text-violet-300"
              >
                <input type="radio" name="difficulty" value={d} defaultChecked={d === "m"} className="sr-only" />
                {d === "s" ? "Fácil" : d === "m" ? "Media" : "Grande"}
              </label>
            ))}
          </div>
        </div>
      </form>

      <PushToggle />

      <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl bg-white/5" />}>
        <TaskList />
      </Suspense>

      <Suspense fallback={null}>
        <Goals />
      </Suspense>

      <Suspense fallback={null}>
        <Heatmap />
      </Suspense>
    </main>
  );
}

async function StatsCard() {
  await connection();
  const stats = await getOrCreateStats();
  const p = levelProgress(stats.xp);
  const streak = effectiveStreak(stats);
  const activeToday = stats.lastActiveDate === localDate();

  return (
    <section className="rounded-3xl bg-gradient-to-br from-violet-600/40 to-fuchsia-600/20 p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-violet-200">Nivel</p>
          <p className="text-4xl font-bold">{p.level}</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${activeToday ? "" : "opacity-50 grayscale"}`}>🔥 {streak}</p>
          <p className="text-xs text-violet-200">
            {activeToday ? "racha a salvo hoy" : streak > 0 ? "¡completa algo hoy!" : "empieza una racha"} · 🧊{" "}
            {stats.freezesAvailable}
          </p>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: `${p.pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-violet-200">
        {p.current}/{p.needed} XP para nivel {p.level + 1}
      </p>
    </section>
  );
}

async function TaskList() {
  await connection();
  const now = new Date();
  const endToday = endOfLocalDay(now);
  const tasks = await listOpenTasks();
  const today = tasks.filter((t) => t.status === "in_progress" || (t.dueAt && t.dueAt <= endToday));
  const later = tasks.filter((t) => !today.includes(t));

  const render = (list: typeof tasks) =>
    list.map((t) => (
      <TaskItem
        key={t.id}
        id={t.id}
        title={t.title}
        due={formatDue(t.dueAt)}
        difficulty={t.difficulty}
        inProgress={t.status === "in_progress"}
        overdue={!!t.dueAt && t.dueAt < now}
        startedAt={t.startedAt ? formatDue(t.startedAt) : null}
      />
    ));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Hoy</h2>
        {today.length ? (
          <ul className="flex flex-col gap-2">{render(today)}</ul>
        ) : (
          <p className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-400">🎉 Nada urgente para hoy.</p>
        )}
      </div>
      {later.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Próximas</h2>
          <ul className="flex flex-col gap-2">{render(later)}</ul>
        </div>
      )}
    </section>
  );
}

async function Goals() {
  await connection();
  const goals = await listGoalsWithProgress();
  if (!goals.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Metas</h2>
      <ul className="flex flex-col gap-2">
        {goals.map((g) => {
          const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
          return (
            <li key={g.id} className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="flex justify-between text-sm">
                <span>
                  {g.emoji} {g.title}
                </span>
                <span className="text-zinc-400">
                  {g.done}/{g.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const WEEKS = 16;
const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

async function Heatmap() {
  await connection();
  const today = localDate();
  const start = addDaysYmd(today, -(WEEKS * 7 - 1));
  const rows = await xpPerDay(new Date(Date.parse(start) - 24 * 3600 * 1000), TIMEZONE);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDaysYmd(start, i));
  const color = (xp: number) =>
    xp === 0 ? "bg-white/5" : xp < 25 ? "bg-violet-900" : xp < 60 ? "bg-violet-700" : xp < 120 ? "bg-violet-500" : "bg-violet-300";

  const monthLabels: { col: number; name: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < WEEKS; col++) {
    const d = days[col * 7];
    const month = new Date(d).getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ col, name: MONTH_NAMES[month] });
      lastMonth = month;
    }
  }

  const formatDay = (ymd: string) => {
    const d = new Date(ymd + "T12:00:00Z");
    return new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short" }).format(d);
  };

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Tu actividad</h2>
      <div className="rounded-2xl bg-white/5 p-3">
        <div className="mb-1 ml-7 flex">
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.name}`}
              className="text-[10px] text-zinc-500"
              style={{ marginLeft: m.col === monthLabels[0].col ? 0 : undefined, position: "absolute", left: `calc(${(m.col / WEEKS) * 100}%)` }}
            />
          ))}
          {/* Month labels as simple inline flow */}
          {(() => {
            const els: React.ReactNode[] = [];
            for (let i = 0; i < monthLabels.length; i++) {
              const gapCols = i === 0 ? monthLabels[0].col : monthLabels[i].col - monthLabels[i - 1].col;
              if (i > 0) els.push(<span key={`gap-${i}`} style={{ width: `${((gapCols - 1) / WEEKS) * 100}%` }} className="shrink-0" />);
              els.push(<span key={`m-${i}`} className="text-[10px] text-zinc-500 shrink-0">{monthLabels[i].name}</span>);
            }
            return els;
          })()}
        </div>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 pt-0">
            {DAY_LABELS.map((l, i) => (
              <span key={i} className="flex h-[14px] w-5 items-center text-[9px] text-zinc-500">{i % 2 === 0 ? l : ""}</span>
            ))}
          </div>
          <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1">
            {days.map((d) => {
              const r = byDay.get(d);
              const xp = r?.xp ?? 0;
              const completed = r?.completed ?? 0;
              const names = r?.taskNames ?? [];
              return (
                <div key={d} className="group/cell relative">
                  <div className={`flex aspect-square items-center justify-center rounded-[3px] ${color(xp)}`}>
                    {completed > 0 && <span className="text-[7px] font-bold leading-none text-white/70">{completed}</span>}
                  </div>
                  {(xp > 0 || completed > 0) && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 scale-95 rounded-lg bg-zinc-900 px-3 py-2 text-xs opacity-0 shadow-xl ring-1 ring-white/10 transition-all group-hover/cell:scale-100 group-hover/cell:opacity-100">
                      <p className="font-medium capitalize text-zinc-200">{formatDay(d)}</p>
                      <p className="mt-1 text-zinc-400">✅ {completed} {completed === 1 ? "tarea" : "tareas"} · {xp} XP</p>
                      {names.length > 0 && (
                        <ul className="mt-1.5 border-t border-white/10 pt-1.5">
                          {names.slice(0, 5).map((n) => (
                            <li key={n} className="truncate text-zinc-300">• {n}</li>
                          ))}
                          {names.length > 5 && <li className="text-zinc-500">+{names.length - 5} más</li>}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
