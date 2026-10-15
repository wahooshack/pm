import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersPanel } from "@/components/MembersPanel";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
type Member = { username: string; displayName: string; role: string };
let members: Member[];

beforeEach(() => {
  members = [{ username: "eddie", displayName: "Eddie", role: "editor" }];
  global.fetch = vi.fn(async (input, init) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/api/boards/7/members" && init?.method === "POST") {
      if (body.username === "nobody") return response({ detail: "No active user has that username." }, 404);
      members = [...members.filter(m => m.username !== body.username),
        { username: body.username, displayName: body.username, role: body.role }].sort((a, b) => a.username.localeCompare(b.username));
      return response(members);
    }
    if (path.startsWith("/api/boards/7/members/") && init?.method === "DELETE") {
      members = members.filter(m => m.username !== decodeURIComponent(path.split("/").pop()!));
      return response(members);
    }
    if (path === "/api/boards/7/members") return response(members);
    return response({ detail: "Not found" }, 404);
  }) as typeof fetch;
});

const renderPanel = (onClose = vi.fn(), onSessionExpired = vi.fn()) => {
  render(<MembersPanel boardId={7} boardName="Launch" onClose={onClose} onSessionExpired={onSessionExpired} />);
  return { onClose, onSessionExpired };
};

it("lists, adds, changes and removes members", async () => {
  const { onClose } = renderPanel();
  const list = await screen.findByRole("list", { name: "Board members" });
  expect(within(list).getByText("@eddie")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Username to share with"), "Vera");
  await userEvent.selectOptions(screen.getByLabelText("Role for new member"), "viewer");
  await userEvent.click(screen.getByRole("button", { name: "Add member" }));
  expect(await screen.findByText("@vera")).toBeInTheDocument();
  expect(screen.getByLabelText("Username to share with")).toHaveValue("");
  expect(members).toContainEqual({ username: "vera", displayName: "vera", role: "viewer" });
  await userEvent.selectOptions(screen.getByLabelText("Role for eddie"), "viewer");
  expect(members.find(m => m.username === "eddie")?.role).toBe("viewer");
  await userEvent.click(screen.getByRole("button", { name: "Remove eddie" }));
  expect(await screen.findByText("@vera")).toBeInTheDocument();
  expect(screen.queryByText("@eddie")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledWith(true);
});

it("reports an unknown username and keeps the input", async () => {
  const { onClose } = renderPanel();
  await screen.findByText("@eddie");
  await userEvent.type(screen.getByLabelText("Username to share with"), "nobody");
  await userEvent.click(screen.getByRole("button", { name: "Add member" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No active user has that username.");
  expect(screen.getByLabelText("Username to share with")).toHaveValue("nobody");
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledWith(false);
});

it("explains when a board is not shared", async () => {
  members = [];
  renderPanel();
  expect(await screen.findByText("Only you can see this board.")).toBeInTheDocument();
});

it("reports an expired session", async () => {
  global.fetch = vi.fn(async () => response({ detail: "Please sign in." }, 401)) as typeof fetch;
  const { onSessionExpired } = renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("Please sign in.");
  expect(onSessionExpired).toHaveBeenCalled();
});
