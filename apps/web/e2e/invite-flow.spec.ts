import { expect, test } from "@playwright/test";
import { login, logout, openSettings, register, setRelation, uniqueEmail } from "./helpers";

test("generates an invite code and joins an existing album", async ({ page }) => {
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });
  await expect(page).toHaveURL(/\/babies\/baby-demo\/photos/);

  await openSettings(page);
  await page.getByRole("button", { name: /宝宝管理/ }).click();
  await expect(page).toHaveURL(/\/settings\/babies$/);
  await page.getByRole("button", { name: /Little Qin/ }).click();
  await expect(page).toHaveURL(/\/babies\/baby-demo\/manage$/);
  const inviteResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && /\/api\/proxy\/api\/v1\/albums\/[^/]+\/invites$/.test(response.url())
    && response.status() === 201
  ));
  await page.getByRole("button", { name: "生成邀请码" }).click();
  const invitePayload = await (await inviteResponse).json() as { code?: string };
  const inviteCode = invitePayload.code?.trim() ?? "";
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
  await setRelation(joinCard, "舅舅");
  await joinCard.getByRole("button", { name: "加入已有相册" }).click();

  await expect(page).toHaveURL(/\/babies\/baby-demo\/photos/);
  await expect(page.getByRole("link", { name: "设置" })).toBeVisible();
});
