import { expect, test } from "@playwright/test";
import { login, samplePng } from "./helpers";

test("uploads a small photo batch from the draft sheet", async ({ page }) => {
  const caption = `Playwright upload ${Date.now()}`;
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });

  await expect(page).toHaveURL(/\/album\/family-demo\/photos/);
  await page.getByRole("button", { name: "+" }).click();
  await expect(page.getByText("选择照片或视频")).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles([
    samplePng("playwright-a.png", 1),
    samplePng("playwright-b.png", 2)
  ]);

  await expect(page.locator(".draftListCard")).toHaveCount(1);
  await page.locator(".draftListCaption").fill(caption);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.locator(".draftSheetOverlay")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(caption)).toBeVisible({ timeout: 20_000 });
});

