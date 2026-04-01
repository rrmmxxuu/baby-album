import { expect, test } from "@playwright/test";
import { createAlbum, register, uniqueEmail } from "./helpers";

test("keeps the authenticated baby route after localStorage is cleared and the page reloads", async ({ page }) => {
  const password = "demo12345";
  await register(page, {
    displayName: "Cookie Session Parent",
    email: uniqueEmail("cookie"),
    password
  });

  await createAlbum(page, {
    babyName: "Cookie Session Baby",
    relation: "妈妈",
    birthDate: "2024-05-01"
  });

  await page.evaluate(() => {
    window.localStorage.clear();
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/babies\/.+\/photos(?:\?.*)?$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Cookie Session Baby" })).toBeVisible({ timeout: 20_000 });
});
