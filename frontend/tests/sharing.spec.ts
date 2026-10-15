import { expect, test } from "@playwright/test";
import { registerUser, resetBeforeEach, signIn, waitSaved } from "./helpers";

resetBeforeEach();

test("owner shares a board as editor then viewer, then revokes access", async ({ page, browser }) => {
  const aliceContext = await browser.newContext({ baseURL: "http://127.0.0.1:8765" });
  await registerUser(aliceContext.request, "alice");
  const alice = await aliceContext.newPage();

  await signIn(page);
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share board" });
  await dialog.getByLabel("Username to share with").fill("alice");
  await dialog.getByRole("button", { name: "Add member" }).click();
  await expect(dialog.getByText("@alice")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // As an editor, alice can change the shared board.
  await alice.goto("/");
  await alice.getByLabel("Board", { exact: true }).selectOption({ label: "Main Board (user, editor)" });
  await expect(alice.getByLabel("Board name")).toHaveValue("Main Board");
  await expect(alice.getByRole("button", { name: "Share" })).toHaveCount(0);
  await alice.getByLabel("Move Align roadmap themes to column").selectOption({ label: "Done" }); await waitSaved(alice);
  await page.reload();
  await expect(page.getByTestId("column-col-done").getByTestId("card-card-1")).toBeVisible();

  // The owner can assign cards to members.
  await page.getByRole("button", { name: "Edit Gather customer signals" }).click();
  await page.getByLabel("Assignee", { exact: true }).selectOption("alice");
  await page.getByRole("button", { name: "Save card" }).click(); await waitSaved(page);

  // As a viewer, alice sees changes but cannot edit.
  await page.getByRole("button", { name: "Share" }).click();
  await dialog.getByLabel("Role for alice").selectOption("viewer");
  await dialog.getByRole("button", { name: "Done" }).click();
  await alice.reload();
  await alice.getByLabel("Board", { exact: true }).selectOption({ label: "Main Board (user, viewer)" });
  await expect(alice.getByText("View only")).toBeVisible();
  await expect(alice.getByTestId("card-card-2").getByLabel("Assigned to alice")).toBeVisible();
  await expect(alice.getByRole("button", { name: "Edit Gather customer signals" })).toBeDisabled();
  await expect(alice.getByLabel("New column title")).toHaveCount(0);

  // Removing alice revokes access and clears her assignment.
  await page.getByRole("button", { name: "Share" }).click();
  await dialog.getByRole("button", { name: "Remove alice" }).click();
  await expect(dialog.getByText("Only you can see this board.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("card-card-2").getByLabel("Assigned to alice")).toHaveCount(0);
  await alice.reload();
  await expect(alice.getByLabel("Board", { exact: true }).locator("option")).toHaveText(["My Board"]);
  await aliceContext.close();
});
