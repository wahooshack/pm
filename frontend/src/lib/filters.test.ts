import { boardLabels, emptyFilter, isFilterActive, matchesFilter, UNASSIGNED } from "@/lib/filters";
import type { Card } from "@/lib/kanban";

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "card-1", title: "Fix login", details: "Session expiry bug", dueDate: null, priority: null, labels: [], assignee: null, ...overrides,
});
const today = "2026-06-15";

describe("card filters", () => {
  it("is inactive by default and matches everything", () => {
    expect(isFilterActive(emptyFilter)).toBe(false);
    expect(isFilterActive({ ...emptyFilter, text: "  " })).toBe(false);
    expect(matchesFilter(card(), emptyFilter, today)).toBe(true);
  });

  it("matches text in title, details and labels, ignoring case", () => {
    const filter = (text: string) => ({ ...emptyFilter, text });
    expect(matchesFilter(card(), filter("LOGIN"), today)).toBe(true);
    expect(matchesFilter(card(), filter("expiry"), today)).toBe(true);
    expect(matchesFilter(card({ labels: ["Security"] }), filter("secur"), today)).toBe(true);
    expect(matchesFilter(card(), filter("payment"), today)).toBe(false);
  });

  it("filters by priority and label", () => {
    expect(matchesFilter(card({ priority: "high" }), { ...emptyFilter, priority: "high" }, today)).toBe(true);
    expect(matchesFilter(card({ priority: "low" }), { ...emptyFilter, priority: "high" }, today)).toBe(false);
    expect(matchesFilter(card({ labels: ["Bug"] }), { ...emptyFilter, label: "bug" }, today)).toBe(true);
    expect(matchesFilter(card({ labels: ["UI"] }), { ...emptyFilter, label: "bug" }, today)).toBe(false);
  });

  it("filters by assignee, including unassigned cards", () => {
    expect(matchesFilter(card({ assignee: "alice" }), { ...emptyFilter, assignee: "alice" }, today)).toBe(true);
    expect(matchesFilter(card({ assignee: "bob" }), { ...emptyFilter, assignee: "alice" }, today)).toBe(false);
    expect(matchesFilter(card(), { ...emptyFilter, assignee: UNASSIGNED }, today)).toBe(true);
    expect(matchesFilter(card({ assignee: "bob" }), { ...emptyFilter, assignee: UNASSIGNED }, today)).toBe(false);
  });

  it("filters to overdue cards", () => {
    const overdue = { ...emptyFilter, overdue: true };
    expect(matchesFilter(card({ dueDate: "2026-06-14" }), overdue, today)).toBe(true);
    expect(matchesFilter(card({ dueDate: "2026-06-15" }), overdue, today)).toBe(false);
    expect(matchesFilter(card(), overdue, today)).toBe(false);
  });

  it("collects distinct board labels in order", () => {
    expect(boardLabels([card({ labels: ["UI", "bug"] }), card({ labels: ["Bug", "API"] })])).toEqual(["API", "bug", "UI"]);
  });
});
