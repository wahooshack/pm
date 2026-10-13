import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("user");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};
const waitSaved = async (page: Page) => {
  await expect(page.getByLabel("Move Align roadmap themes to column")).toBeEnabled();
  await expect(page.getByText("Saving board...")).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/login", { data: { username: "user", password: "password" } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/test/reset", { data: {} })).ok()).toBeTruthy();
  await page.request.post("/api/logout", { data: {} });
});

test("server enforces login and revokes logout", async ({ page }) => {
  expect((await page.request.get("/api/board")).status()).toBe(401);
  await page.goto("/");
  await page.evaluate(() => sessionStorage.setItem("kanban-demo-auth", "authenticated"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Incorrect username or password.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/board")).status()).toBe(401);
});

test("renames once and persists across reload", async ({ page }) => {
  await signIn(page);
  const input = page.getByLabel("Column title: Backlog", { exact: true });
  const saving = page.waitForResponse(r => r.url().endsWith("/api/board") && r.request().method() === "POST");
  await input.fill("Sprint Ready"); await input.press("Enter");
  expect((await saving).ok()).toBeTruthy(); await waitSaved(page);
  await page.reload();
  await expect(page.getByLabel("Column title: Sprint Ready", { exact: true })).toHaveValue("Sprint Ready");
});

test("adds, edits, cancels, clears details, and deletes with SQLite persistence", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: "Add a card" }).click();
  await column.getByLabel("New card title").fill("Browser card");
  await column.getByLabel("New card details").fill("Original notes");
  await column.getByRole("button", { name: "Add card" }).click(); await waitSaved(page);
  await page.reload();
  await expect(page.getByText("Browser card", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Browser card" }).click();
  await page.getByLabel("Card title", { exact: true }).fill("Cancelled name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Browser card", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Browser card" }).click();
  await page.getByLabel("Card title", { exact: true }).fill("Edited browser card");
  await page.getByRole("textbox", { name: "Card details", exact: true }).fill("");
  await page.getByRole("button", { name: "Save card" }).click(); await waitSaved(page);
  await page.reload();
  await expect(page.getByText("Edited browser card", { exact: true })).toBeVisible();
  const board = await (await page.request.get("/api/board")).json();
  expect(Object.values(board.cards).find((c) => (c as {title: string}).title === "Edited browser card")).toMatchObject({ details: "" });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete Edited browser card" }).click(); await waitSaved(page);
  await page.reload(); await expect(page.getByText("Edited browser card", { exact: true })).toHaveCount(0);
});

test("moves a card with pointer drag and persists it", async ({ page }) => {
  await signIn(page);
  const handle = page.getByRole("button", { name: "Drag Align roadmap themes", exact: true });
  const target = page.getByTestId("column-col-review");
  const from = await handle.boundingBox(); const to = await target.boundingBox();
  if (!from || !to) throw new Error("Missing drag coordinates");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 }); await page.mouse.up();
  await expect(target.getByTestId("card-card-1")).toBeVisible(); await waitSaved(page);
  await page.reload(); await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
});

test("drops a card above the last card of another column", async ({ page }) => {
  await signIn(page);
  const handle = page.getByRole("button", { name: "Drag Align roadmap themes", exact: true });
  const from = await handle.boundingBox(); const to = await page.getByTestId("card-card-6").boundingBox();
  if (!from || !to) throw new Error("Missing drag coordinates");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 15 }); await page.mouse.up();
  await waitSaved(page);
  const board = await (await page.request.get("/api/board")).json();
  expect(board.columns[3].cardIds).toEqual(["card-1", "card-6"]);
});

test("moves into an empty column using keyboard controls", async ({ page }) => {
  await signIn(page);
  const board = await (await page.request.get("/api/board")).json();
  board.columns[0].cardIds.push(...board.columns[1].cardIds); board.columns[1].cardIds = [];
  expect((await page.request.post("/api/board", { data: { board } })).ok()).toBeTruthy();
  await page.reload();
  const move = page.getByLabel("Move Align roadmap themes to column");
  await move.focus(); await move.press("ArrowDown"); await move.press("Enter");
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible(); await waitSaved(page);
  await page.reload(); await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
});

test("assistant commits through the real API and survives reload", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Message to board assistant").fill("Move Align roadmap themes to Done");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Moved the card to Done.");
  await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
  await page.reload(); await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
});

test("another tab cannot overwrite a newer board", async ({ page, context }) => {
  await signIn(page);
  const other = await context.newPage(); await other.goto("/");
  await expect(other.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByLabel("Move Align roadmap themes to column").selectOption("col-done"); await waitSaved(page);
  const title = other.getByLabel("Column title: Backlog", { exact: true });
  await title.fill("Stale tab rename"); await title.press("Enter");
  await expect(other.getByRole("alert").filter({ hasText: "changed" })).toContainText("changed in another request");
  await other.getByRole("button", { name: "Discard local edits and reload" }).click();
  await expect(other.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();
  await expect(other.getByLabel("Column title: Backlog", { exact: true })).toHaveValue("Backlog");
});

test("a delayed assistant cannot overwrite another tab's manual edit", async ({ page, context }) => {
  await signIn(page);
  const other = await context.newPage(); await other.goto("/");
  await expect(other.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  const started = page.waitForRequest(r => r.url().endsWith("/api/ai"));
  await page.getByLabel("Message to board assistant").fill("Move first card");
  await page.getByRole("button", { name: "Send", exact: true }).click(); await started;
  await other.getByLabel("Move Gather customer signals to column").selectOption("col-done"); await waitSaved(other);
  await expect(page.getByRole("alert").filter({ hasText: "changed" })).toContainText("changed");
  const board = await (await page.request.get("/api/board")).json();
  expect(board.columns[4].cardIds).toContain("card-2"); expect(board.columns[0].cardIds).toContain("card-1");
});
