import { expect, test } from "@playwright/test";
import { resetBeforeEach, signIn, waitSaved } from "./helpers";

resetBeforeEach();

test("registers a new account that starts with an empty board", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Username", { exact: true }).fill("alice");
  await page.getByLabel("Display name", { exact: true }).fill("Alice Smith");
  await page.getByLabel("Password", { exact: true }).fill("secret-pass");
  await page.getByLabel("Confirm password", { exact: true }).fill("secret-pass");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Board name")).toHaveValue("My Board");
  await expect(page.getByText("Alice Smith")).toBeVisible();
  await expect(page.getByTestId(/^card-/)).toHaveCount(0);
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, "alice", "secret-pass");
  await expect(page.getByLabel("Board name")).toHaveValue("My Board");
});

test("creates, renames, switches and deletes boards with persistence", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Launch");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByLabel("Board name")).toHaveValue("Launch");
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: "Add a card" }).click();
  await column.getByLabel("New card title").fill("Launch task");
  await column.getByRole("button", { name: "Add card" }).click(); await waitSaved(page);
  await page.getByLabel("Board name").fill("Launch Plan"); await page.getByLabel("Board name").press("Enter"); await waitSaved(page);

  await page.reload();
  await expect(page.getByLabel("Board name")).toHaveValue("Launch Plan");
  await expect(page.getByText("Launch task")).toBeVisible();
  await page.getByLabel("Board", { exact: true }).selectOption({ label: "Main Board" });
  await expect(page.getByText("Align roadmap themes")).toBeVisible();
  await expect(page.getByText("Launch task")).toHaveCount(0);

  await page.getByLabel("Board", { exact: true }).selectOption({ label: "Launch Plan" });
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page.getByLabel("Board name")).toHaveValue("Main Board");
  await expect(page.getByLabel("Board", { exact: true }).locator("option")).toHaveCount(1);
});
