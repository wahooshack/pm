import { expect, test } from "@playwright/test";
import { getBoard, resetBeforeEach, signIn, waitSaved } from "./helpers";

resetBeforeEach();

test("sets card fields, shows them on the card and persists them", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await page.getByLabel("Due date").fill("2020-01-15");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("Labels").fill("Bug, Frontend");
  await page.getByLabel("Assignee").selectOption("user");
  await page.getByRole("button", { name: "Save card" }).click(); await waitSaved(page);
  await page.reload();
  const card = page.getByTestId("card-card-1");
  await expect(card.getByText("high priority")).toBeVisible();
  await expect(card.getByText("Overdue Jan 15, 2020")).toBeVisible();
  await expect(card.getByText("Frontend")).toBeVisible();
  await expect(card.getByLabel("Assigned to user")).toBeVisible();
  expect((await getBoard(page.request)).cards["card-1"]).toMatchObject(
    { dueDate: "2020-01-15", priority: "high", labels: ["Bug", "Frontend"], assignee: "user" });
});
