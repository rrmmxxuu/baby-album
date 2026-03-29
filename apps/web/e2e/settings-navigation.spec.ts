import { expect, test } from "@playwright/test";
import { login, openSettings } from "./helpers";

test("keeps settings route in sync while navigating nested screens", async ({ page }) => {
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });

  await expect(page).toHaveURL(/\/album\/family-demo\/photos/);
  await openSettings(page);

  await page.getByRole("button", { name: /账户管理/ }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=account$/);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings$/);

  await page.getByRole("button", { name: /宝宝管理/ }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=babies$/);
  await page.getByRole("button", { name: /Little Qin/ }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=babyDetail$/);

  await page.getByRole("button", { name: /Ramon/ }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=memberDetail&memberId=user-owner$/);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=babyDetail$/);
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/\/album\/family-demo\/settings\?screen=babies$/);
});

