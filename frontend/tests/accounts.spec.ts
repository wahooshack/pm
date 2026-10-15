import { expect, test } from "@playwright/test";
import { registerUser, resetBeforeEach, signIn } from "./helpers";

resetBeforeEach();

test("updates the display name and password from the profile", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByLabel("Display name").fill("Demo Admin");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Signed in as Demo Admin")).toBeVisible();
  await page.getByLabel("Current password").fill("password");
  await page.getByLabel("New password", { exact: true }).fill("new-password");
  await page.getByLabel("Confirm new password").fill("new-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, "user", "new-password");
  await expect(page.getByText("Signed in as Demo Admin")).toBeVisible();
});

test("admin disables, re-enables and resets a user", async ({ page, browser }) => {
  const aliceContext = await browser.newContext({ baseURL: "http://127.0.0.1:8765" });
  await registerUser(aliceContext.request, "alice");
  const alice = await aliceContext.newPage();
  await alice.goto("/");
  await expect(alice.getByLabel("Board name")).toHaveValue("My Board");

  await signIn(page);
  await page.getByRole("button", { name: "Admin" }).click();
  const row = page.getByRole("row").filter({ hasText: "@alice" });
  await row.getByRole("button", { name: "Disable alice" }).click();
  await expect(row.getByText("Disabled")).toBeVisible();
  await alice.reload();
  await expect(alice.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await alice.getByLabel("Username", { exact: true }).fill("alice");
  await alice.getByLabel("Password", { exact: true }).fill("secret-pass");
  await alice.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(alice.getByText("Incorrect username or password.")).toBeVisible();

  await row.getByRole("button", { name: "Enable alice" }).click();
  await row.getByRole("button", { name: "Reset password for alice" }).click();
  await row.getByLabel("New password for alice").fill("temporary-1");
  await row.getByRole("button", { name: "Set" }).click();
  await expect(page.getByRole("status")).toContainText("Password reset for alice.");
  await signIn(alice, "alice", "temporary-1");
  await expect(alice.getByRole("button", { name: "Admin" })).toHaveCount(0);
  await aliceContext.close();
});
