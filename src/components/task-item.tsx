"use client";

import { useState, useTransition } from "react";
import { completeTaskAction, deleteTaskAction, startTaskAction } from "@/app/actions";

type Props = {
  id: number;
  title: string;
  due: string;
  difficulty: "s" | "m" | "l";
  inProgress: boolean;
  overdue: boolean;
  startedAt: string | null;
};

const DIFF = { s: "bg-emerald-500/20 text-emerald-300", m: "bg-amber-500/20 text-amber-300", l: "bg-rose-500/20 text-rose-300" };

export function TaskItem({ id, title, due, difficulty, inProgress: initialInProgress, overdue, startedAt }: Props) {
  const [pending, start] = useTransition();
  const [inProgress, setInProgress] = useState(initialInProgress);
  const [reward, setReward] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  function handleClick() {
    start(async () => {
      if (navigator.vibrate) navigator.vibrate(30);
      if (!inProgress) {
        const ok = await startTaskAction(id);
        if (ok) setInProgress(true);
      } else {
        const r = await completeTaskAction(id);
        if (r) {
          setReward(
            `+${r.xpGained} XP${r.bonusOnTime ? " ⏱" : ""}${r.leveledUp ? ` · ¡Nivel ${r.level}! 🎉` : ""} · 🔥 ${r.streak}`,
          );
        }
      }
    });
  }

  function handleDelete() {
    start(async () => {
      await deleteTaskAction(id);
      setDeleted(true);
    });
  }

  if (deleted) return null;

  if (reward) {
    return (
      <li className="rounded-2xl bg-violet-500/15 px-4 py-3 text-sm text-violet-200 animate-pulse">
        ✅ {title} — {reward}
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${inProgress ? "bg-violet-500/10 ring-1 ring-violet-500/30" : "bg-white/5"}`}>
      <button
        onClick={handleClick}
        disabled={pending}
        aria-label={inProgress ? `Completar ${title}` : `Empezar ${title}`}
        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${
          inProgress
            ? "border-violet-400 bg-violet-500/20 text-violet-300 hover:bg-violet-500/40"
            : "border-zinc-500 hover:border-violet-400 hover:bg-violet-500/20"
        } disabled:opacity-50`}
      >
        {pending ? "…" : inProgress ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {inProgress && <span className="text-violet-400">● </span>}
          {title}
        </p>
        <div className={`flex flex-wrap gap-x-2 text-xs ${overdue ? "text-rose-400" : inProgress ? "text-violet-300/70" : "text-zinc-400"}`}>
          {inProgress && startedAt && <span>▶ {startedAt}</span>}
          {inProgress && !startedAt && <span>▶ En progreso</span>}
          {due !== "sin fecha" && <span>{inProgress ? `⏰ ${due}` : due}</span>}
          {!inProgress && due === "sin fecha" && <span>sin fecha</span>}
        </div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${DIFF[difficulty]}`}>{difficulty}</span>
      <button
        onClick={handleDelete}
        disabled={pending}
        aria-label={`Borrar ${title}`}
        className="shrink-0 text-zinc-600 transition hover:text-rose-400 disabled:opacity-50"
      >
        ✕
      </button>
    </li>
  );
}
