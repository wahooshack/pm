import type { BoardData, Card } from "../lib/kanban";

const card = (id: string, title: string, details: string): Card =>
  ({ id, title, details, dueDate: null, priority: null, labels: [], assignee: null });

// Mirrors DEFAULT_BOARD in backend/app/database.py for mocked unit tests; browser tests reset through the backend seed.
export const initialData: BoardData = {
  id: 1,
  name: "Main Board",
  role: "owner",
  revision: 0,
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: Object.fromEntries([
    card("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    card("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    card("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    card("card-4", "Refine status language", "Standardize column labels and tone across the board."),
    card("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    card("card-6", "QA micro-interactions", "Verify hover, focus, and loading states."),
    card("card-7", "Ship marketing page", "Final copy approved and asset pack delivered."),
    card("card-8", "Close onboarding sprint", "Document release notes and share internally."),
  ].map(entry => [entry.id, entry])),
};

export const demoUser = { id: 1, username: "user", displayName: "User", isAdmin: true, isActive: true };
