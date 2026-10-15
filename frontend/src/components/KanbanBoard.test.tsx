import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import Home from "@/app/page";
import type { BoardData } from "@/lib/kanban";
import { demoUser, initialData } from "@/test/fixtures";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
let board: BoardData;
let signedIn: boolean;
let posts: number;

beforeEach(() => {
  board = structuredClone(initialData); signedIn = false; posts = 0;
  window.sessionStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  global.fetch = vi.fn(async (input, init) => {
    const path = String(input);
    if (path === "/api/session") return signedIn ? response(demoUser) : response({ detail: "Please sign in." }, 401);
    if (path === "/api/login") {
      const payload = JSON.parse(String(init?.body));
      if (payload.username !== "user" || payload.password !== "password") return response({ detail: "Incorrect username or password." }, 401);
      signedIn = true; return response(demoUser);
    }
    if (path === "/api/logout") { signedIn = false; return response({ ok: true }); }
    if (path === "/api/boards") return response([{ id: 1, name: board.name, role: "owner", owner: "user" }]);
    if (path.endsWith("/participants")) return response(["alice", "user"]);
    if (path === "/api/boards/1" && init?.method === "POST") {
      posts++; board = { ...JSON.parse(String(init.body)).board, revision: board.revision + 1 };
      return response(board);
    }
    return response(board);
  }) as typeof fetch;
});
const loaded = async () => { await screen.findByLabelText("Board name"); };
const signIn = async (password = "password") => {
  await userEvent.type(screen.getByLabelText("Username"), "user");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
};
const firstColumn = () => screen.getAllByTestId(/column-/)[0];
const saved = async () => { await waitFor(() => expect(screen.queryByText("Saving board...")).not.toBeInTheDocument()); };

it("renders the authoritative five columns", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  expect(screen.getAllByTestId(/column-/)).toHaveLength(5);
});

it("commits a rename on blur rather than on each keystroke", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  const input = within(firstColumn()).getByRole("textbox", { name: /Column title:/ });
  await userEvent.clear(input); await userEvent.type(input, "New name");
  expect(posts).toBe(0);
  await userEvent.tab(); await saved();
  expect(posts).toBe(1); expect(board.columns[0].title).toBe("New name");
});

it("adds, edits, clears details, and deletes a card without AI", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  const column = firstColumn();
  await userEvent.click(within(column).getByRole("button", { name: "Add a card" }));
  await userEvent.type(within(column).getByLabelText("New card title"), "New card");
  await userEvent.type(within(column).getByLabelText("New card details"), "Notes");
  await userEvent.click(within(column).getByRole("button", { name: "Add card" })); await saved();
  await userEvent.click(screen.getByRole("button", { name: "Edit New card" }));
  await userEvent.clear(screen.getByLabelText("Card title")); await userEvent.type(screen.getByLabelText("Card title"), "Edited card");
  await userEvent.clear(screen.getByLabelText("Card details"));
  await userEvent.click(screen.getByRole("button", { name: "Save card" })); await saved();
  expect(Object.values(board.cards).find(c => c.title === "Edited card")?.details).toBe("");
  await userEvent.click(screen.getByRole("button", { name: "Delete Edited card" })); await saved();
  expect(screen.queryByText("Edited card")).not.toBeInTheDocument();
});

it("keeps a card when removal is not confirmed", async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Align roadmap themes"));
  expect(posts).toBe(0); expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
});

it("cancels card edits without saving", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  await userEvent.clear(screen.getByLabelText("Card title"));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(posts).toBe(0); expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
});

it("disables the assistant while a card editor is open", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Rename first card");
  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(screen.getByLabelText("Message to board assistant")).toBeDisabled();
  expect(screen.getByText(/Save or cancel the open card edit/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("offers movement without requiring a pointer drag", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done"); await saved();
  expect(board.columns[4].cardIds).toContain("card-1");
  await waitFor(() => expect(screen.getByLabelText("Move Align roadmap themes to column")).toHaveFocus());
});

it("does not expose seed data while loading or after a load failure", async () => {
  const pending = deferred<Response>(); global.fetch = vi.fn(() => pending.promise);
  render(<KanbanBoard boardId={1} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading board");
  expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  await act(async () => pending.resolve(response({ detail: "offline" }, 503)));
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");
  expect(screen.queryByRole("button", { name: "Add a card" })).not.toBeInTheDocument();
  global.fetch = vi.fn(async (input) => response(String(input).endsWith("/participants") ? [] : board));
  await userEvent.click(screen.getByRole("button", { name: "Retry loading board" })); await loaded();
});

it("prevents overlapping saves while a write is pending", async () => {
  const pending = deferred<Response>(); const original = global.fetch;
  global.fetch = vi.fn((input, init) => init?.method === "POST" ? pending.promise : original(input, init));
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  expect(screen.getByLabelText("Move Gather customer signals to column")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(vi.mocked(global.fetch).mock.calls.filter(([,init]) => init?.method === "POST")).toHaveLength(1);
  const next = structuredClone(board); next.revision = 1; next.columns[0].cardIds = ["card-2"]; next.columns[4].cardIds.push("card-1");
  await act(async () => pending.resolve(response(next))); await saved();
  expect(screen.getByLabelText("Move Align roadmap themes to column")).toHaveValue("col-done");
});

it("retains a failed edit for explicit retry", async () => {
  const original = global.fetch; let fail = true;
  global.fetch = vi.fn((input, init) => init?.method === "POST" && fail ? Promise.resolve(response({ detail: "Save unavailable" }, 503)) : original(input, init));
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  await screen.findByRole("button", { name: "Retry save" });
  expect(screen.getByLabelText("Move Align roadmap themes to column")).toBeDisabled();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry save" })); await saved();
  expect(board.columns[4].cardIds).toContain("card-1");
});

it("requires reload after a revision conflict rather than overwriting it", async () => {
  const original = global.fetch;
  global.fetch = vi.fn((input, init) => init?.method === "POST" ? Promise.resolve(response({ detail: "Board changed. Reload." }, 409)) : original(input, init));
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Retry save" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Discard local edits and reload" }));
  await waitFor(() => expect(screen.getByLabelText("Move Align roadmap themes to column")).toHaveValue("col-backlog"));
});

it("uses the server-committed AI board and blocks intervening manual edits", async () => {
  const original = global.fetch; const pending = deferred<Response>();
  global.fetch = vi.fn((input, init) => String(input) === "/api/boards/1/ai" ? pending.promise : original(input, init));
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Move first card");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Edit Align roadmap themes" })).toBeDisabled();
  const request = vi.mocked(global.fetch).mock.calls.find(([path]) => path === "/api/boards/1/ai");
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ prompt: "Move first card", revision: 0, conversation: [] });
  const next = structuredClone(board); next.revision = 1; next.columns[0].cardIds = ["card-2"]; next.columns[4].cardIds.push("card-1");
  await act(async () => pending.resolve(response({ response: "Moved", board: next })));
  expect(await screen.findByText("Moved")).toBeInTheDocument();
  expect(posts).toBe(0);
});

it("aborts in-flight AI on unmount and never follows it with a save", async () => {
  const original = global.fetch; const pending = deferred<Response>(); let signal: AbortSignal | undefined;
  global.fetch = vi.fn((input, init) => { if (String(input) === "/api/boards/1/ai") { signal = init?.signal as AbortSignal; return pending.promise; } return original(input, init); });
  const { unmount } = render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Delete first");
  await userEvent.click(screen.getByRole("button", { name: "Send" })); unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(response({ response: "Done", board })));
  expect(posts).toBe(0);
});

it("ignores browser storage as authorization and validates login on the server", async () => {
  window.sessionStorage.setItem("kanban-demo-auth", "authenticated");
  render(<Home />);
  await screen.findByRole("heading", { name: "Sign in" });
  await signIn("wrong");
  expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Username")); await userEvent.clear(screen.getByLabelText("Password"));
  await signIn(); await loaded();
});

it("restores and logs out a server session", async () => {
  signedIn = true; render(<Home />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Sign in" }); expect(signedIn).toBe(false);
});

it("explains on the sign-in screen that an expired session dropped the edit", async () => {
  signedIn = true; const original = global.fetch;
  global.fetch = vi.fn((input, init) => init?.method === "POST" && String(input) === "/api/boards/1"
    ? Promise.resolve(response({ detail: "Please sign in." }, 401)) : original(input, init));
  render(<Home />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByRole("alert")).toHaveTextContent("your last change was not saved");
  await signIn(); await loaded();
  expect(screen.queryByText(/your last change was not saved/)).not.toBeInTheDocument();
});

it("explains on the sign-in screen that an expired session dropped the assistant's changes", async () => {
  signedIn = true; const original = global.fetch;
  global.fetch = vi.fn((input, init) => String(input) === "/api/boards/1/ai"
    ? Promise.resolve(response({ detail: "Please sign in." }, 401)) : original(input, init));
  render(<Home />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Move first card");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByRole("alert")).toHaveTextContent("the assistant's changes were not saved");
});

it("does not duplicate a failed assistant message when it is retried", async () => {
  const original = global.fetch; let fail = true; const bodies: unknown[] = [];
  global.fetch = vi.fn((input, init) => {
    if (String(input) !== "/api/boards/1/ai") return original(input, init);
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(fail ? response({ detail: "Assistant unavailable" }, 502) : response({ response: "Moved it", board }));
  });
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Move first card");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Assistant unavailable");
  expect(screen.queryByText("Move first card")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Message to board assistant")).toHaveValue("Move first card");
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Moved it");
  expect(screen.getAllByText("Move first card")).toHaveLength(1);
  expect(bodies[1]).toEqual({ prompt: "Move first card", revision: 0, conversation: [] });
});

it("treats a non-JSON 401 as session expiry", async () => {
  signedIn = true; const original = global.fetch;
  global.fetch = vi.fn((input, init) => init?.method === "POST" && String(input) === "/api/boards/1"
    ? Promise.resolve({ ok: false, status: 401, json: async () => { throw new SyntaxError("Unexpected token <"); } } as unknown as Response)
    : original(input, init));
  render(<Home />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByRole("alert")).toHaveTextContent("your last change was not saved");
});

it("adds, reorders and deletes columns", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  expect(screen.getByRole("button", { name: "Move column Backlog left" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move column Done right" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Delete column Backlog" })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("New column title"), "Blocked");
  await userEvent.click(screen.getByRole("button", { name: "Add column" })); await saved();
  expect(board.columns.map(c => c.title)).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Done", "Blocked"]);
  expect(screen.getByLabelText("New column title")).toHaveValue("");
  await userEvent.click(screen.getByRole("button", { name: "Move column Blocked left" })); await saved();
  expect(board.columns.map(c => c.title).slice(-2)).toEqual(["Blocked", "Done"]);
  await userEvent.click(screen.getByRole("button", { name: "Delete column Blocked" })); await saved();
  expect(board.columns).toHaveLength(5);
  expect(screen.getAllByTestId(/column-/)).toHaveLength(5);
});

it("hides column editing for viewers", async () => {
  board.role = "viewer";
  render(<KanbanBoard boardId={1} />); await loaded();
  expect(screen.queryByLabelText("New column title")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move column Review left" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Column title: Backlog" })).toBeDisabled();
});

it("edits due date, priority, labels and assignee and shows them on the card", async () => {
  render(<KanbanBoard boardId={1} />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  await userEvent.type(screen.getByLabelText("Due date"), "2020-01-15");
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
  await userEvent.type(screen.getByLabelText("Labels"), "Bug, ui, bug");
  expect(within(screen.getByLabelText("Assignee")).getAllByRole("option").map(o => o.textContent)).toEqual(["Unassigned", "alice", "user"]);
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "alice");
  await userEvent.click(screen.getByRole("button", { name: "Save card" })); await saved();
  expect(board.cards["card-1"]).toMatchObject({ dueDate: "2020-01-15", priority: "high", labels: ["Bug", "ui"], assignee: "alice" });
  const card = screen.getByTestId("card-card-1");
  expect(within(card).getByText("high priority")).toBeInTheDocument();
  expect(within(card).getByText("Overdue Jan 15, 2020")).toBeInTheDocument();
  expect(within(card).getByText("Bug")).toBeInTheDocument();
  expect(within(card).getByLabelText("Assigned to alice")).toHaveTextContent("AL");

  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  expect(screen.getByLabelText("Labels")).toHaveValue("Bug, ui");
  await userEvent.clear(screen.getByLabelText("Due date"));
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "");
  await userEvent.clear(screen.getByLabelText("Labels"));
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "");
  await userEvent.click(screen.getByRole("button", { name: "Save card" })); await saved();
  expect(board.cards["card-1"]).toMatchObject({ dueDate: null, priority: null, labels: [], assignee: null });
  expect(within(screen.getByTestId("card-card-1")).queryByText("high priority")).not.toBeInTheDocument();
});

it("shows a future due date without the overdue warning", async () => {
  board.cards["card-2"] = { ...board.cards["card-2"], dueDate: "2999-03-01", priority: "low" };
  render(<KanbanBoard boardId={1} />); await loaded();
  const card = screen.getByTestId("card-card-2");
  expect(within(card).getByText("Due Mar 1, 2999")).toBeInTheDocument();
  expect(within(card).getByText("low priority")).toBeInTheDocument();
});

it("filters cards by text, priority, label, assignee and overdue, and disables dragging while filtering", async () => {
  board.cards["card-1"] = { ...board.cards["card-1"], priority: "high", labels: ["Bug"], assignee: "alice", dueDate: "2020-01-01" };
  board.cards["card-6"] = { ...board.cards["card-6"], priority: "high", labels: ["UI"] };
  render(<KanbanBoard boardId={1} />); await loaded();
  expect(screen.getByRole("button", { name: "Drag Align roadmap themes" })).toBeEnabled();
  await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
  expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);
  expect(screen.getByText(/Showing 1 of 8 cards/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Drag Align roadmap themes" })).toBeDisabled();
  expect(within(firstColumn()).getByText("1 of 2 cards")).toBeInTheDocument();
  expect(within(screen.getByTestId("column-col-discovery")).getByText("No matching cards")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete column Discovery" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByTestId(/^card-/)).toHaveLength(8);
  await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
  expect(screen.getAllByTestId(/^card-/).map(card => card.dataset.testid)).toEqual(["card-card-1", "card-card-6"]);
  expect(within(screen.getByLabelText("Filter by label")).getAllByRole("option").map(o => o.textContent)).toEqual(["Any label", "Bug", "UI"]);
  await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "UI");
  expect(screen.getAllByTestId(/^card-/).map(card => card.dataset.testid)).toEqual(["card-card-6"]);
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await userEvent.selectOptions(screen.getByLabelText("Filter by assignee"), "alice");
  expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);
  await userEvent.selectOptions(screen.getByLabelText("Filter by assignee"), "__unassigned");
  expect(screen.getAllByTestId(/^card-/)).toHaveLength(7);
  await userEvent.selectOptions(screen.getByLabelText("Filter by assignee"), "");
  await userEvent.click(screen.getByLabelText("Overdue only"));
  expect(screen.getAllByTestId(/^card-/).map(card => card.dataset.testid)).toEqual(["card-card-1"]);

  // Moving still works while filtered.
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done"); await saved();
  expect(board.columns[4].cardIds).toContain("card-1");
});

it("tells viewers the assistant cannot change the board", async () => {
  board.role = "viewer";
  render(<KanbanBoard boardId={1} />); await loaded();
  expect(screen.getByText(/view-only access, so the assistant cannot change this board/)).toBeInTheDocument();
  expect(screen.getByLabelText("Message to board assistant")).toBeDisabled();
});
