import { formatDue, initials, isOverdue, parseLabels, todayIso } from "@/lib/cards";

describe("card field helpers", () => {
  it("formats today's local date as ISO", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("treats only past due dates as overdue", () => {
    expect(isOverdue({ dueDate: "2026-01-04" }, "2026-01-05")).toBe(true);
    expect(isOverdue({ dueDate: "2026-01-05" }, "2026-01-05")).toBe(false);
    expect(isOverdue({ dueDate: null }, "2026-01-05")).toBe(false);
  });

  it("formats a due date without shifting the day", () => {
    expect(formatDue("2026-11-30")).toBe("Nov 30, 2026");
  });

  it("parses comma-separated labels, trimming, deduplicating and limiting them", () => {
    expect(parseLabels(" Bug, ui ,, bug, UI ")).toEqual(["Bug", "ui"]);
    expect(parseLabels("x".repeat(40))).toEqual(["x".repeat(30)]);
    expect(parseLabels(Array.from({ length: 12 }, (_, i) => `l${i}`).join(","))).toHaveLength(10);
    expect(parseLabels("")).toEqual([]);
  });

  it("derives initials from a username", () => {
    expect(initials("alice")).toBe("AL");
  });
});
