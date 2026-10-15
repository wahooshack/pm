import { isOverdue, todayIso } from "@/lib/cards";
import type { Card, Priority } from "@/lib/kanban";

export const UNASSIGNED = "__unassigned";

export type CardFilter = { text: string; priority: Priority | ""; label: string; assignee: string; overdue: boolean };

export const emptyFilter: CardFilter = { text: "", priority: "", label: "", assignee: "", overdue: false };

export const isFilterActive = (filter: CardFilter) =>
  !!(filter.text.trim() || filter.priority || filter.label || filter.assignee || filter.overdue);

export const matchesFilter = (card: Card, filter: CardFilter, today = todayIso()) => {
  const text = filter.text.trim().toLowerCase();
  if (text && ![card.title, card.details, ...card.labels].some(value => value.toLowerCase().includes(text))) return false;
  if (filter.priority && card.priority !== filter.priority) return false;
  if (filter.label && !card.labels.some(label => label.toLowerCase() === filter.label.toLowerCase())) return false;
  if (filter.assignee === UNASSIGNED ? card.assignee : filter.assignee && card.assignee !== filter.assignee) return false;
  if (filter.overdue && !isOverdue(card, today)) return false;
  return true;
};

// Distinct labels, ignoring case; the first spelling seen wins.
export const boardLabels = (cards: Card[]) => {
  const seen = new Map<string, string>();
  for (const label of cards.flatMap(card => card.labels)) {
    if (!seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};
