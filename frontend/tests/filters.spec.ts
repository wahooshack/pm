import { expect, test } from "@playwright/test";
import { boardUrl, getBoard, resetBeforeEach, signIn } from "./helpers";

resetBeforeEach();

test("searches and filters cards, and restores dragging when cleared", async ({ page }) => {
  await signIn(page);
  const board = await getBoard(page.request);
  Object.assign(board.cards["card-3"], { priority: "high", labels: ["Analytics"], dueDate: "2020-05-01" });
  expect((await page.request.post(await boardUrl(page.request), { data: { board } })).ok()).toBeTruthy();
  await page.reload();

  await page.getByLabel("Search cards").fill("customer");
  await expect(page.getByTestId(/^card-card-/)).toHaveCount(1);
  await expect(page.getByTestId("card-card-2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag Gather customer signals" })).toBeDisabled();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by label").selectOption("Analytics");
  await expect(page.getByTestId(/^card-card-/)).toHaveCount(1);
  await page.getByLabel("Filter by label").selectOption("");
  await page.getByLabel("Overdue only").check();
  await expect(page.getByTestId(/^card-card-/)).toHaveCount(1);
  await expect(page.getByText("Showing 1 of 8 cards")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId(/^card-card-/)).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Drag Gather customer signals" })).toBeEnabled();
});
