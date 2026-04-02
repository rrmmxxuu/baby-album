import { expect, test } from "@playwright/test";
import { login, register, setRelation, uniqueEmail } from "./helpers";

test("refreshes baby manage data when re-entering settings screens", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const joinerPage = await joinerContext.newPage();
  const joinerName = `Refresh Joiner ${Date.now().toString().slice(-6)}`;
  const visibleMemberButton = () => ownerPage.locator("button.settingsMemberCard:visible").filter({ hasText: joinerName });

  try {
    await login(ownerPage, {
      email: "owner@example.com",
      password: "demo12345"
    });

    await ownerPage.getByRole("link", { name: "设置" }).click();
    await ownerPage.getByRole("button", { name: /宝宝管理/ }).click();
    await ownerPage.getByRole("button", { name: /Little Qin/ }).click();
    await expect(ownerPage).toHaveURL(/\/babies\/baby-demo\/manage$/);

    const inviteResponse = ownerPage.waitForResponse((response) => (
      response.request().method() === "POST"
      && /\/api\/proxy\/api\/v1\/albums\/[^/]+\/invites$/.test(response.url())
      && response.status() === 201
    ));
    await ownerPage.getByRole("button", { name: "生成邀请码" }).click();
    const invitePayload = await (await inviteResponse).json() as { code?: string };
    const inviteCode = invitePayload.code?.trim() ?? "";
    expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);

    await register(joinerPage, {
      displayName: joinerName,
      email: uniqueEmail("settings-refresh"),
      password: "demo12345"
    });
    const joinCard = joinerPage.locator("article").filter({ has: joinerPage.getByRole("heading", { name: "输入邀请码" }) });
    await joinCard.getByLabel("邀请码").fill(inviteCode);
    await setRelation(joinCard, "舅舅");
    await joinCard.getByRole("button", { name: "加入已有相册" }).click();
    await expect(joinerPage).toHaveURL(/\/babies\/baby-demo\/photos/, { timeout: 20_000 });

    await ownerPage.getByRole("button", { name: "返回" }).click();
    await expect(ownerPage).toHaveURL(/\/settings\/babies$/);
    await ownerPage.getByRole("button", { name: /Little Qin/ }).click();
    await expect(ownerPage).toHaveURL(/\/babies\/baby-demo\/manage$/);
    await expect(visibleMemberButton()).toHaveCount(1, { timeout: 20_000 });
    await expect(ownerPage.getByText(inviteCode)).toHaveCount(0);

    await visibleMemberButton().click({ force: true });
    await expect(ownerPage).toHaveURL(/\/babies\/baby-demo\/manage\/members\/.+$/, { timeout: 20_000 });
    await ownerPage.locator(".memberActions select:visible").selectOption("admin");
    await ownerPage.getByRole("button", { name: "保存权限" }).click();
    await expect(ownerPage.getByText("当前权限：管理员")).toBeVisible({ timeout: 20_000 });

    await ownerPage.getByRole("button", { name: "返回" }).click();
    await expect(ownerPage).toHaveURL(/\/babies\/baby-demo\/manage$/);
    await ownerPage.getByRole("button", { name: "返回" }).click();
    await expect(ownerPage).toHaveURL(/\/settings\/babies$/);
    await ownerPage.getByRole("button", { name: /Little Qin/ }).click();
    await visibleMemberButton().click({ force: true });
    await expect(ownerPage.getByText("当前权限：管理员")).toBeVisible({ timeout: 20_000 });

    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByRole("button", { name: "移除成员" }).click();
    await expect(ownerPage).toHaveURL(/\/babies\/baby-demo\/manage$/, { timeout: 20_000 });
    await expect(visibleMemberButton()).toHaveCount(0);

    await joinerPage.goto("/babies/baby-demo/photos");
    await expect(joinerPage).toHaveURL(/\/welcome$/, { timeout: 20_000 });
    await expect(joinerPage.getByRole("link", { name: "照片" })).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await joinerContext.close();
  }
});
