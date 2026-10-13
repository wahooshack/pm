import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import Home from "@/app/page";
import { initialData, type BoardData } from "@/lib/kanban";

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
  global.fetch = vi.fn(async (input, init) => {
    const path = String(input);
    if (path === "/api/session") return signedIn ? response({ username: "user" }) : response({ detail: "Please sign in." }, 401);
    if (path === "/api/login") {
      const payload = JSON.parse(String(init?.body));
      if (payload.username !== "user" || payload.password !== "password") return response({ detail: "Incorrect username or password." }, 401);
      signedIn = true; return response({ username: "user" });
    }
    if (path === "/api/logout") { signedIn = false; return response({ ok: true }); }
    if (path === "/api/board" && init?.method === "POST") {
      posts++; board = { ...JSON.parse(String(init.body)).board, revision: board.revision + 1 };
      return response(board);
    }
    return response(board);
  }) as typeof fetch;
});
const loaded = async () => { await screen.findByRole("heading", { name: "Kanban Studio" }); };
const firstColumn = () => screen.getAllByTestId(/column-/)[0];
const saved = async () => { await waitFor(() => expect(screen.queryByText("Saving board...")).not.toBeInTheDocument()); };

it("renders the authoritative five columns", async () => {
  render(<KanbanBoard />); await loaded();
  expect(screen.getAllByTestId(/column-/)).toHaveLength(5);
});

it("commits a rename on blur rather than on each keystroke", async () => {
  render(<KanbanBoard />); await loaded();
  const input = within(firstColumn()).getByRole("textbox", { name: /Column title:/ });
  await userEvent.clear(input); await userEvent.type(input, "New name");
  expect(posts).toBe(0);
  await userEvent.tab(); await saved();
  expect(posts).toBe(1); expect(board.columns[0].title).toBe("New name");
});

it("adds, edits, clears details, and deletes a card without AI", async () => {
  render(<KanbanBoard />); await loaded();
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

it("cancels card edits without saving", async () => {
  render(<KanbanBoard />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  await userEvent.clear(screen.getByLabelText("Card title"));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(posts).toBe(0); expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
});

it("disables the assistant while a card editor is open", async () => {
  render(<KanbanBoard />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Rename first card");
  await userEvent.click(screen.getByRole("button", { name: "Edit Align roadmap themes" }));
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(screen.getByLabelText("Message to board assistant")).toBeDisabled();
  expect(screen.getByText(/Save or cancel the open card edit/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("offers movement without requiring a pointer drag", async () => {
  render(<KanbanBoard />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done"); await saved();
  expect(board.columns[4].cardIds).toContain("card-1");
  await waitFor(() => expect(screen.getByLabelText("Move Align roadmap themes to column")).toHaveFocus());
});

it("does not expose seed data while loading or after a load failure", async () => {
  const pending = deferred<Response>(); global.fetch = vi.fn(() => pending.promise);
  render(<KanbanBoard />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading board");
  expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  await act(async () => pending.resolve(response({ detail: "offline" }, 503)));
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");
  expect(screen.queryByRole("button", { name: "Add a card" })).not.toBeInTheDocument();
  global.fetch = vi.fn(async () => response(board));
  await userEvent.click(screen.getByRole("button", { name: "Retry loading board" })); await loaded();
});

it("prevents overlapping saves while a write is pending", async () => {
  const pending = deferred<Response>(); const original = global.fetch;
  global.fetch = vi.fn((input, init) => init?.method === "POST" ? pending.promise : original(input, init));
  render(<KanbanBoard />); await loaded();
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
  render(<KanbanBoard />); await loaded();
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
  render(<KanbanBoard />); await loaded();
  await userEvent.selectOptions(screen.getByLabelText("Move Align roadmap themes to column"), "col-done");
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Retry save" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Discard local edits and reload" }));
  await waitFor(() => expect(screen.getByLabelText("Move Align roadmap themes to column")).toHaveValue("col-backlog"));
});

it("uses the server-committed AI board and blocks intervening manual edits", async () => {
  const original = global.fetch; const pending = deferred<Response>();
  global.fetch = vi.fn((input, init) => String(input) === "/api/ai" ? pending.promise : original(input, init));
  render(<KanbanBoard />); await loaded();
  await userEvent.type(screen.getByLabelText("Message to board assistant"), "Move first card");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Edit Align roadmap themes" })).toBeDisabled();
  const request = vi.mocked(global.fetch).mock.calls.find(([path]) => path === "/api/ai");
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ prompt: "Move first card", revision: 0, conversation: [] });
  const next = structuredClone(board); next.revision = 1; next.columns[0].cardIds = ["card-2"]; next.columns[4].cardIds.push("card-1");
  await act(async () => pending.resolve(response({ response: "Moved", board: next })));
  expect(await screen.findByText("Moved")).toBeInTheDocument();
  expect(posts).toBe(0);
});

it("aborts in-flight AI on unmount and never follows it with a save", async () => {
  const original = global.fetch; const pending = deferred<Response>(); let signal: AbortSignal | undefined;
  global.fetch = vi.fn((input, init) => { if (String(input) === "/api/ai") { signal = init?.signal as AbortSignal; return pending.promise; } return original(input, init); });
  const { unmount } = render(<KanbanBoard />); await loaded();
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
  await userEvent.clear(screen.getByLabelText("Password")); await userEvent.type(screen.getByLabelText("Password"), "wrong");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Password")); await userEvent.type(screen.getByLabelText("Password"), "password");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" })); await loaded();
});

it("restores and logs out a server session", async () => {
  signedIn = true; render(<Home />); await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Sign in" }); expect(signedIn).toBe(false);
});
