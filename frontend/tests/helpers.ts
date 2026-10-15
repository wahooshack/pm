import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

export const signIn = async (page: Page, username = "user", password = "password") => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Board name")).toBeVisible();
};

// Registers through the API in a request context of its own, so the page's session is untouched.
export const registerUser = async (request: APIRequestContext, username: string, password = "secret-pass") => {
  const response = await request.post("/api/register", { data: { username, displayName: username[0].toUpperCase() + username.slice(1), password } });
  expect(response.ok()).toBeTruthy();
};

// The demo user's seeded board; the reset gives it a fresh ID each test.
export const boardUrl = async (request: APIRequestContext) => `/api/boards/${(await (await request.get("/api/boards")).json())[0].id}`;
export const getBoard = async (request: APIRequestContext) => (await request.get(await boardUrl(request))).json();

export const waitSaved = async (page: Page) => {
  await expect(page.getByLabel("Board name")).toBeVisible();
  await expect(page.getByText("Saving board...")).toHaveCount(0);
};

export const resetBeforeEach = () => test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/test/reset", { data: {} })).ok()).toBeTruthy();
});
