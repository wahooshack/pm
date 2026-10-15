import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { Workspace } from "@/components/Workspace";
import type { BoardData, BoardSummary } from "@/lib/kanban";
import { demoUser, initialData } from "@/test/fixtures";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
let boards: Record<number, BoardData>;
let summaries: BoardSummary[];
let registered: unknown[];

beforeEach(() => {
  boards = { 1: structuredClone(initialData) };
  summaries = [{ id: 1, name: "Main Board", role: "owner", owner: "user" }];
  registered = [];
  window.localStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  global.fetch = vi.fn(async (input, init) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/api/session") return response({ detail: "Please sign in." }, 401);
    if (path === "/api/register") {
      if (body.username === "taken") return response({ detail: "That username is taken." }, 409);
      registered.push(body);
      return response({ ...demoUser, username: body.username, displayName: body.displayName, isAdmin: false });
    }
    if (path === "/api/boards" && init?.method === "POST") {
      const id = Math.max(...Object.keys(boards).map(Number)) + 1;
      boards[id] = { ...structuredClone(initialData), id, name: body.name, columns: initialData.columns.map(c => ({ ...c, cardIds: [] })), cards: {} };
      return response(boards[id]);
    }
    if (path === "/api/boards") return response(summaries);
    if (path.endsWith("/participants")) return response(["user"]);
    const match = path.match(/^\/api\/boards\/(\d+)$/);
    if (match && init?.method === "DELETE") { delete boards[Number(match[1])]; return response({ ok: true }); }
    if (match && init?.method === "POST") {
      const id = Number(match[1]);
      boards[id] = { ...body.board, revision: boards[id].revision + 1 };
      return response(boards[id]);
    }
    if (match) return boards[Number(match[1])] ? response(boards[Number(match[1])]) : response({ detail: "Board not found." }, 404);
    return response({ detail: "Not found" }, 404);
  }) as typeof fetch;
});

const renderWorkspace = () => render(<Workspace user={demoUser} onLogout={vi.fn()} onSessionExpired={vi.fn()} />);
const boardSelect = () => screen.getByLabelText("Board");

it("registers a new account and validates matching passwords", async () => {
  render(<Home />);
  await userEvent.click(await screen.findByRole("button", { name: "New here? Create an account" }));
  expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Username"), "Alice");
  expect(screen.getByLabelText("Username")).toHaveValue("alice");
  await userEvent.type(screen.getByLabelText("Display name"), "Alice");
  await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
  await userEvent.type(screen.getByLabelText("Confirm password"), "different");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  expect(registered).toHaveLength(0);
  await userEvent.clear(screen.getByLabelText("Confirm password"));
  await userEvent.type(screen.getByLabelText("Confirm password"), "secret-pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(registered).toEqual([{ username: "alice", displayName: "Alice", password: "secret-pass" }]);
});

it("reports a taken username and can return to sign in", async () => {
  render(<Home />);
  await userEvent.click(await screen.findByRole("button", { name: "New here? Create an account" }));
  await userEvent.type(screen.getByLabelText("Username"), "taken");
  await userEvent.type(screen.getByLabelText("Display name"), "T");
  await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
  await userEvent.type(screen.getByLabelText("Confirm password"), "secret-pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("That username is taken.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
});

it("creates, switches, renames and deletes boards", async () => {
  renderWorkspace();
  await screen.findByLabelText("Board name");
  await userEvent.click(screen.getByRole("button", { name: "New board" }));
  await userEvent.type(screen.getByLabelText("New board name"), "Launch");
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Launch"));
  expect(boardSelect()).toHaveValue("2");
  expect(window.localStorage.getItem("pm-last-board")).toBe("2");

  const name = screen.getByLabelText("Board name");
  await userEvent.clear(name); await userEvent.type(name, "Launch Plan{Enter}");
  await waitFor(() => expect(within(boardSelect()).getByRole("option", { name: "Launch Plan" })).toBeInTheDocument());
  expect(boards[2].name).toBe("Launch Plan");

  await userEvent.selectOptions(boardSelect(), "1");
  await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Main Board"));
  await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Main Board"));
  await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Launch Plan"));
  expect(boards[1]).toBeUndefined();
});

it("reopens the last board, ignoring a remembered board that is no longer listed", async () => {
  boards[3] = { ...structuredClone(initialData), id: 3, name: "Remembered" };
  summaries.push({ id: 3, name: "Remembered", role: "owner", owner: "user" });
  window.localStorage.setItem("pm-last-board", "3");
  const { unmount } = renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Remembered"));
  unmount();
  window.localStorage.setItem("pm-last-board", "99");
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Main Board"));
});

it("shows an empty state without boards", async () => {
  summaries = [];
  renderWorkspace();
  expect(await screen.findByText(/You have no boards yet/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Board")).not.toBeInTheDocument();
});

it("keeps the board when deletion is not confirmed", async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  renderWorkspace();
  await screen.findByLabelText("Board name");
  await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
  expect(boards[1]).toBeDefined();
});

it("labels shared boards and makes a viewer's board read-only", async () => {
  boards[1].role = "viewer";
  summaries = [{ id: 1, name: "Main Board", role: "viewer", owner: "alice" }];
  renderWorkspace();
  await screen.findByLabelText("Board name");
  expect(within(boardSelect()).getByRole("option", { name: "Main Board (alice, viewer)" })).toBeInTheDocument();
  expect(screen.getByText("View only")).toBeInTheDocument();
  expect(screen.getByLabelText("Board name")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit Align roadmap themes" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

it("reports a failed board list and retries", async () => {
  const original = global.fetch; let fail = true;
  global.fetch = vi.fn((input, init) => String(input) === "/api/boards" && fail
    ? Promise.resolve(response({ detail: "down" }, 503)) : original(input, init));
  renderWorkspace();
  expect(await screen.findByText("Unable to load your boards.")).toBeInTheDocument();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByLabelText("Board name")).toHaveValue("Main Board");
});

it("reports a failed board creation", async () => {
  const original = global.fetch;
  global.fetch = vi.fn((input, init) => String(input) === "/api/boards" && init?.method === "POST"
    ? Promise.resolve(response({ detail: "Name rejected." }, 422)) : original(input, init));
  renderWorkspace();
  await screen.findByLabelText("Board name");
  await userEvent.click(screen.getByRole("button", { name: "New board" }));
  await userEvent.type(screen.getByLabelText("New board name"), "Bad{Enter}");
  expect(await screen.findByText("Name rejected.")).toBeInTheDocument();
});
