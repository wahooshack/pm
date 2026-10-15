import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPanel } from "@/components/AdminPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import type { User } from "@/lib/api";
import { demoUser } from "@/test/fixtures";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
let users: User[];
let requests: { path: string; body: unknown }[];

beforeEach(() => {
  users = [
    { id: 2, username: "alice", displayName: "Alice", isAdmin: false, isActive: true },
    { ...demoUser },
  ];
  requests = [];
  global.fetch = vi.fn(async (input, init) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) requests.push({ path, body });
    if (path === "/api/me") return response({ ...demoUser, displayName: body.displayName });
    if (path === "/api/me/password") {
      return body.currentPassword === "password" ? response({ ok: true }) : response({ detail: "Current password is incorrect." }, 403);
    }
    if (path === "/api/admin/users") return response(users);
    const match = path.match(/^\/api\/admin\/users\/(.+)$/);
    if (match) {
      const user = users.find(entry => entry.username === match[1])!;
      Object.assign(user, body.isActive === undefined ? {} : { isActive: body.isActive }, body.isAdmin === undefined ? {} : { isAdmin: body.isAdmin });
      return response({ ...user });
    }
    return response({ detail: "Not found" }, 404);
  }) as typeof fetch;
});

describe("ProfilePanel", () => {
  it("saves the display name", async () => {
    const onUserChange = vi.fn();
    render(<ProfilePanel user={demoUser} onUserChange={onUserChange} onSessionExpired={vi.fn()} />);
    const name = screen.getByLabelText("Display name");
    await userEvent.clear(name); await userEvent.type(name, "Demo Admin");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Display name saved.");
    expect(onUserChange).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Demo Admin" }));
  });

  it("changes the password, checking confirmation and the current password", async () => {
    render(<ProfilePanel user={demoUser} onUserChange={vi.fn()} onSessionExpired={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("New passwords do not match.");
    expect(requests).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await userEvent.type(screen.getByLabelText("Confirm new password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
    await userEvent.clear(screen.getByLabelText("Current password"));
    await userEvent.type(screen.getByLabelText("Current password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });
});

describe("AdminPanel", () => {
  it("lists users and toggles status and role, protecting the signed-in admin", async () => {
    render(<AdminPanel user={demoUser} onSessionExpired={vi.fn()} />);
    const aliceRow = (await screen.findByText("@alice")).closest("tr")!;
    expect(within(aliceRow).getByText("Member")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable user" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove admin from user" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset password for user" })).toBeDisabled();

    await userEvent.click(within(aliceRow).getByRole("button", { name: "Disable alice" }));
    expect(await within(aliceRow).findByText("Disabled")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("alice disabled.");
    await userEvent.click(within(aliceRow).getByRole("button", { name: "Enable alice" }));
    expect(await within(aliceRow).findByText("Active")).toBeInTheDocument();
    await userEvent.click(within(aliceRow).getByRole("button", { name: "Make admin alice" }));
    expect(await within(aliceRow).findByText("Admin")).toBeInTheDocument();
  });

  it("resets a password", async () => {
    render(<AdminPanel user={demoUser} onSessionExpired={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reset password for alice" }));
    await userEvent.type(screen.getByLabelText("New password for alice"), "temporary-1");
    await userEvent.click(screen.getByRole("button", { name: "Set" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password reset for alice.");
    expect(requests).toContainEqual({ path: "/api/admin/users/alice", body: { password: "temporary-1" } });
    expect(screen.queryByLabelText("New password for alice")).not.toBeInTheDocument();
  });

  it("reports access errors", async () => {
    global.fetch = vi.fn(async () => response({ detail: "Administrator access is required." }, 403)) as typeof fetch;
    render(<AdminPanel user={demoUser} onSessionExpired={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Administrator access is required.");
  });
});
