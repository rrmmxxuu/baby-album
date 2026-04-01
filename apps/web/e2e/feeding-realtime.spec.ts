import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function openFeeding(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "喂养" }).click();
  await expect(page).toHaveURL(/\/babies\/baby-demo\/feeding(?:\?.*)?$/, { timeout: 20_000 });
}

test("syncs the active breastfeeding timer across users and routes feed actions into the shared timer", async ({ browser }) => {
  test.slow();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA, {
      email: "owner@example.com",
      password: "demo12345"
    });
    await login(pageB, {
      email: "member@example.com",
      password: "demo12345"
    });

    await openFeeding(pageA);
    await openFeeding(pageB);

    const activeTimerCard = pageA.getByRole("button", { name: /亲喂计时中/ }).first();
    await expect(activeTimerCard).toHaveCount(0);

    await pageB.getByRole("button", { name: "记喂奶" }).click();
    await expect(pageB.getByRole("heading", { name: "记喂奶" })).toBeVisible();
    await pageB.locator(".feedingSegmentedControlThree").getByRole("button", { name: "亲喂", exact: true }).click();
    await expect(pageB.getByText("总时长")).toBeVisible();

    await pageB.locator(".feedingTimerSideButton").first().click();

    await expect(pageA.getByRole("button", { name: /亲喂计时中.*左侧喂奶中/ }).first()).toBeVisible({ timeout: 20_000 });

    await pageA.getByRole("button", { name: "记喂奶" }).click();
    await expect(pageA.getByRole("heading", { name: "记喂奶" })).toBeVisible();
    await expect(pageA.getByText("总时长")).toBeVisible();
    await expect(pageA.getByText(/左侧喂奶中/).first()).toBeVisible();

    await pageB.locator(".feedingTimerSideButton").first().click();
    await expect(pageA.getByText(/已暂停/).first()).toBeVisible({ timeout: 20_000 });

    await pageB.locator(".feedingTimerSideButton").nth(1).click();
    await expect(pageA.getByText(/右侧喂奶中/).first()).toBeVisible({ timeout: 20_000 });

    await pageB.getByRole("button", { name: "结束并保存" }).click();

    await expect(pageA.getByRole("heading", { name: "记喂奶" })).toBeHidden({ timeout: 20_000 });
    await expect(pageA.getByRole("button", { name: /亲喂计时中/ })).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: /亲喂.*左侧.*右侧/ }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
