"use server";

import { refresh } from "next/cache";
import { completeTask, createTask, createTaskFromText, deleteTask, startTask } from "@/services/task.service";
import { deadlineFromDateStr } from "@/lib/dates";
import type { Difficulty } from "@/types";

export async function addTaskAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const deadlineStr = formData.get("deadline") as string | null;
  const difficulty = (formData.get("difficulty") as Difficulty) || "m";
  const dueAt = deadlineStr ? deadlineFromDateStr(deadlineStr) : null;
  await createTask({ title, dueAt, difficulty });
  refresh();
}

export async function startTaskAction(id: number) {
  const task = await startTask(id);
  refresh();
  return !!task;
}

export async function deleteTaskAction(id: number) {
  await deleteTask(id);
  refresh();
}

export async function completeTaskAction(id: number) {
  const reward = await completeTask(id);
  refresh();
  if (!reward) return null;
  return {
    xpGained: reward.xpGained,
    bonusOnTime: reward.bonusOnTime,
    leveledUp: reward.leveledUp,
    level: reward.level,
    streak: reward.streak,
  };
}
