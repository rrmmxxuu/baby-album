import { expect, test } from "@playwright/test";
import { createAlbum, register, uniqueEmail } from "./helpers";

test("restores an authenticated session from / back to the active album", async ({ page }) => {
  const password = "demo12345";
  await register(page, {
    displayName: "Root Redirect Parent",
    email: uniqueEmail("root"),
    password
  });

  await createAlbum(page, {
    babyName: "Root Redirect Baby",
    relation: "妈妈",
    birthDate: "2024-05-01"
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/album\/.+\/photos(?:\?.*)?$/, { timeout: 20_000 });
});
