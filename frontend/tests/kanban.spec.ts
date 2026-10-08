import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card into an empty column", async ({ page }) => {
  const board = {
    columns: [
      { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
      { id: "col-discovery", title: "Discovery", cardIds: [] },
      { id: "col-progress", title: "In Progress", cardIds: [] },
      { id: "col-review", title: "Review", cardIds: [] },
      { id: "col-done", title: "Done", cardIds: [] },
    ],
    cards: {
      "card-1": {
        id: "card-1",
        title: "Align roadmap themes",
        details: "Draft quarterly themes with impact statements and metrics.",
      },
    },
  };

  await page.route("**/api/board*", async (route) => {
    const responseBoard =
      route.request().method() === "GET"
        ? board
        : JSON.parse(route.request().postData() ?? "{}").board;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBoard),
    });
  });

  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const emptyZone = targetColumn.locator("[data-empty-column-zone]");
  await emptyZone.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const targetBox = await emptyZone.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve empty-column drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 }
  );
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByTestId("card-card-1")).toHaveCount(0);
});

test("applies and persists a structured assistant board update", async ({ page }) => {
  let board = {
    columns: [
      { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
      { id: "col-discovery", title: "Discovery", cardIds: [] },
      { id: "col-progress", title: "In Progress", cardIds: [] },
      { id: "col-review", title: "Review", cardIds: [] },
      { id: "col-done", title: "Done", cardIds: [] },
    ],
    cards: {
      "card-1": {
        id: "card-1",
        title: "Align roadmap themes",
        details: "Draft quarterly themes.",
      },
    },
  };
  let submittedPrompt: Record<string, unknown> | undefined;
  let persistedBoard = board;

  await page.route("**/api/board*", async (route) => {
    if (route.request().method() === "POST") {
      const payload = JSON.parse(route.request().postData() ?? "{}");
      board = payload.board;
      persistedBoard = payload.board;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(board),
    });
  });
  await page.route("**/api/ai", async (route) => {
    submittedPrompt = JSON.parse(route.request().postData() ?? "{}");
    const nextBoard = JSON.parse(JSON.stringify(board));
    nextBoard.columns[0].cardIds = [];
    nextBoard.columns[1].cardIds = ["card-1"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: "Moved Align roadmap themes to Discovery.",
        model: "mock-model",
        board: nextBoard,
        actions: [
          {
            type: "move_card",
            cardId: "card-1",
            columnId: "col-discovery",
          },
        ],
      }),
    });
  });

  await signIn(page);
  const prompt = "Move Align roadmap themes to Discovery";
  await page.getByPlaceholder("Ask the board assistant...").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("log", { name: "Assistant conversation" })).toContainText(
    "Moved Align roadmap themes to Discovery."
  );
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
  await expect.poll(() => persistedBoard.columns[1].cardIds).toEqual(["card-1"]);
  expect(submittedPrompt?.prompt).toBe(prompt);
  expect(submittedPrompt?.board).toMatchObject({
    columns: expect.arrayContaining([
      expect.objectContaining({
        id: "col-backlog",
        cardIds: ["card-1"],
      }),
    ]),
  });
});
