import { expect, test } from "@playwright/test";
import { latestInviteCode, login, logout, openSettings, register, uniqueEmail } from "./helpers";

test("generates an invite code and joins an existing album", async ({ page }) => {
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });
  await expect(page).toHaveURL(/\/album\/family-demo\/photos/);

  await openSettings(page);
  await page.getByRole("button", { name: /宝宝管理/ }).click();
  await page.getByRole("button", { name: /Little Qin/ }).click();
  await page.getByRole("button", { name: "生成邀请码" }).click();

  const inviteCode = (await latestInviteCode(page.locator(".inviteLink")).textContent())?.trim() ?? "";
  expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);

  await logout(page);

  const joinerPassword = "demo12345";
  await register(page, {
    displayName: "Invite Joiner",
    email: uniqueEmail("invite"),
    password: joinerPassword
  });
  const joinCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "输入邀请码" }) });
  await expect(joinCard).toBeVisible();
  await joinCard.getByLabel("邀请码").fill(inviteCode);
  await joinCard.getByLabel("你与宝宝的关系").fill("舅舅");
  await joinCard.getByRole("button", { name: "加入已有相册" }).click();

  await expect(page).toHaveURL(/\/album\/family-demo\/photos/);
  await expect(page.getByRole("link", { name: "设置" })).toBeVisible();
});
