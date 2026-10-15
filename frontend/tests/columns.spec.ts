import { expect, test } from "@playwright/test";
import { getBoard, resetBeforeEach, signIn, waitSaved } from "./helpers";

resetBeforeEach();

test("adds, reorders, renames and deletes columns with persistence", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByRole("button", { name: "Add column" }).click(); await waitSaved(page);
  await expect(page.getByLabel("Column title: Blocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move column Blocked left" }).click(); await waitSaved(page);
  await page.getByRole("button", { name: "Move column Backlog right" }).click(); await waitSaved(page);
  await page.reload();
  const titles = async () => (await getBoard(page.request)).columns.map((column: { title: string }) => column.title);
  expect(await titles()).toEqual(["Discovery", "Backlog", "In Progress", "Review", "Blocked", "Done"]);

  // Moving the last card out lets the column be deleted.
  await page.getByLabel("Move Prototype analytics view to column").selectOption({ label: "Backlog" }); await waitSaved(page);
  await page.getByRole("button", { name: "Delete column Discovery" }).click(); await waitSaved(page);
  await page.getByRole("button", { name: "Delete column Blocked" }).click(); await waitSaved(page);
  await page.reload();
  expect(await titles()).toEqual(["Backlog", "In Progress", "Review", "Done"]);
  await expect(page.getByTestId(/^column-/)).toHaveCount(4);
});
