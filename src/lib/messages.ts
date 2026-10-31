import type { CompletionReward, Task, UserStats } from "@/types";
import { formatDue } from "./dates";
import { effectiveStreak, levelProgress } from "@/services/reward.service";

const DIFF_LABEL = { s: "🟢 S", m: "🟡 M", l: "🔴 L" } as const;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function progressBar(pct: number, size = 10) {
  const filled = Math.round((pct / 100) * size);
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

export function taskLine(t: Task) {
  const status = t.status === "in_progress" ? "🔥 " : "";
  return `${status}<b>${escapeHtml(t.title)}</b> · ${DIFF_LABEL[t.difficulty]} · ${formatDue(t.dueAt)}`;
}

export function rewardMessage(r: CompletionReward) {
  const p = levelProgress(r.totalXp);
  const lines = [
    `✅ <b>${escapeHtml(r.task.title)}</b>`,
    `+${r.xpGained} XP${r.bonusOnTime ? " (incluye bonus por puntualidad ⏱)" : ""}`,
    `Nivel ${p.level} ${progressBar(p.pct)} ${p.current}/${p.needed}`,
  ];
  if (r.streakIncreased) lines.push(`🔥 Racha: ${r.streak} día${r.streak === 1 ? "" : "s"}`);
  if (r.leveledUp) lines.push(`\n🎉 <b>¡Subiste a nivel ${r.level}!</b>`);
  return lines.join("\n");
}

export function statsMessage(s: UserStats) {
  const p = levelProgress(s.xp);
  return [
    `🏆 <b>Nivel ${p.level}</b>  ${progressBar(p.pct)}  ${p.current}/${p.needed} XP`,
    `🔥 Racha actual: ${effectiveStreak(s)} · Récord: ${s.longestStreak}`,
    `🧊 Congeladores: ${s.freezesAvailable}`,
    `⭐ XP total: ${s.xp}`,
  ].join("\n");
}
