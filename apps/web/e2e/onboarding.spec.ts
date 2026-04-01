import { expect, test } from "@playwright/test";
import { createAlbum, logout, openSettings, register, uniqueEmail } from "./helpers";

test("registers, creates an album, enters settings, and logs out", async ({ page }) => {
  const password = "demo12345";
  await register(page, {
    displayName: "Playwright Parent",
    email: uniqueEmail("onboarding"),
    password
  });

  await createAlbum(page, {
    babyName: "Playwright Baby",
    relation: "爸爸",
    birthDate: "2024-06-01"
  });

  await openSettings(page);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "管理账号和宝宝空间" })).toBeVisible();

  await logout(page);
});
