import { expect, test } from "@playwright/test";
import { login, sampleMp4, samplePng } from "./helpers";

const ALBUM_ID = "family-demo";
const UPLOAD_SETTLE_TIMEOUT_MS = 45_000;
const UPLOAD_TEST_TIMEOUT_MS = 90_000;

async function waitForTimelineCaption(page: import("@playwright/test").Page, caption: string) {
  await expect.poll(async () => {
    return page.evaluate(async ({ albumId, targetCaption }) => {
      const response = await fetch(`/api/proxy/api/v1/timeline?albumId=${encodeURIComponent(albumId)}&limit=20`, {
        cache: "no-store",
        credentials: "include"
      });
      if (!response.ok) {
        return false;
      }
      const payload = await response.json() as { items?: Array<{ caption?: string }> };
      return Boolean(payload.items?.some((item) => item.caption === targetCaption));
    }, {
      albumId: ALBUM_ID,
      targetCaption: caption
    });
  }, {
    timeout: UPLOAD_SETTLE_TIMEOUT_MS
  }).toBe(true);
}

test("uploads a small photo batch from the draft sheet", async ({ page }) => {
  test.setTimeout(UPLOAD_TEST_TIMEOUT_MS);
  const caption = `Playwright upload ${Date.now()}`;
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });

  await expect(page).toHaveURL(/\/babies\/baby-demo\/photos/);
  await page.getByRole("button", { name: "+" }).click();
  await expect(page.getByText("选择照片或视频")).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles([
    samplePng("playwright-a.png", 1),
    samplePng("playwright-b.png", 2)
  ]);

  await expect(page.locator(".draftListCard")).toHaveCount(1);
  await page.locator(".draftListCaption").fill(caption);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.locator(".draftSheetOverlay")).toHaveCount(0, { timeout: UPLOAD_SETTLE_TIMEOUT_MS });
  await waitForTimelineCaption(page, caption);
});

test("uploads a small video and shows a local video preview in the draft sheet", async ({ page }) => {
  test.setTimeout(UPLOAD_TEST_TIMEOUT_MS);
  const caption = `Playwright video ${Date.now()}`;
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });

  await expect(page).toHaveURL(/\/babies\/baby-demo\/photos/);
  await page.getByRole("button", { name: "+" }).click();
  await expect(page.getByText("选择照片或视频")).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles([
    sampleMp4("playwright-video.mp4")
  ]);

  await expect(page.locator(".draftListCard")).toHaveCount(1);
  await expect(page.locator(".draftMediaThumbVideoElement")).toHaveCount(1);
  await expect(page.locator(".draftMediaThumbVideoElement")).toHaveAttribute("poster", /blob:/);
  await page.locator(".draftListCaption").fill(caption);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.locator(".draftSheetOverlay")).toHaveCount(0, { timeout: UPLOAD_SETTLE_TIMEOUT_MS });
  await waitForTimelineCaption(page, caption);
});
