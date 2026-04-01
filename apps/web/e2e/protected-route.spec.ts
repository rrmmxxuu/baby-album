import { expect, test } from "@playwright/test";
import { createAlbum, register, uniqueEmail } from "./helpers";

test("redirects protected baby routes to auth when session cookies are gone", async ({ context, page }) => {
  const password = "demo12345";
  await register(page, {
    displayName: "Protected Route Parent",
    email: uniqueEmail("protected"),
    password
  });

  await createAlbum(page, {
    babyName: "Protected Route Baby",
    relation: "爸爸",
    birthDate: "2024-05-01"
  });

  const albumUrl = page.url();
  await context.clearCookies();
  await page.goto(albumUrl, { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/auth(?:\?.*)?$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "把宝宝的照片，留在自己手里。" })).toBeVisible({ timeout: 20_000 });
});
