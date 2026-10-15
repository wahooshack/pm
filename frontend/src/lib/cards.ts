import type { Card, Priority } from "@/lib/kanban";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;

const pad = (value: number) => String(value).padStart(2, "0");

// Due dates are calendar days, so compare against the viewer's local date.
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const isOverdue = (card: Pick<Card, "dueDate">, today = todayIso()) => !!card.dueDate && card.dueDate < today;

export const formatDue = (dueDate: string) =>
  new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const parseLabels = (text: string): string[] => {
  const labels: string[] = [];
  for (const raw of text.split(",")) {
    const label = raw.trim().slice(0, MAX_LABEL_LENGTH);
    if (label && !labels.some(existing => existing.toLowerCase() === label.toLowerCase())) labels.push(label);
  }
  return labels.slice(0, MAX_LABELS);
};

export const initials = (username: string) => username.slice(0, 2).toUpperCase();
