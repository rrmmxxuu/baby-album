import { expect, test } from "@playwright/test";
import { login, openSettings, register, setRelation, uniqueEmail } from "./helpers";

test("opens the only eligible baby directly from the feeding tab", async ({ page }) => {
  await login(page, {
    email: "owner@example.com",
    password: "demo12345"
  });

  await expect(page).toHaveURL(/\/babies\/baby-demo\/photos/);
  await page.getByRole("link", { name: "喂养" }).click();
  await expect(page).toHaveURL(/\/babies\/baby-demo\/feeding$/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "重新选择宝宝" })).toBeVisible();
});

test("requires explicit baby selection when more than one baby can access feeding", async ({ page }) => {
  const password = "demo12345";
  const firstBabyName = "Picker Baby One";
  const secondBabyName = "Picker Baby Two";

  await register(page, {
    displayName: "Feeding Picker Parent",
    email: uniqueEmail("feeding"),
    password
  });

  const emptyCreateCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "创建第一个宝宝相册" }) });
  await emptyCreateCard.getByLabel("宝宝姓名").fill(firstBabyName);
  await emptyCreateCard.getByLabel("出生日期").fill("2024-05-01");
  await setRelation(emptyCreateCard, "妈妈");
  await emptyCreateCard.getByRole("button", { name: "创建宝宝相册" }).click();
  await expect(page).toHaveURL(/\/babies\/([^/]+)\/photos$/, { timeout: 20_000 });

  await openSettings(page);
  await page.getByRole("button", { name: /宝宝管理/ }).click();
  await page.getByRole("button", { name: "添加" }).click();
  await expect(page).toHaveURL(/\/settings\/babies\/new$/);

  const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "创建宝宝" }) }).first();
  await addForm.getByLabel("宝宝姓名").fill(secondBabyName);
  await addForm.getByLabel("出生日期").fill("2024-06-01");
  await setRelation(addForm, "爸爸");
  await addForm.getByRole("button", { name: "创建宝宝" }).click();
  await expect(page).toHaveURL(/\/babies\/([^/]+)\/photos$/, { timeout: 20_000 });

  await page.getByRole("link", { name: "喂养" }).click();
  await expect(page).toHaveURL(/\/feeding$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "选择宝宝" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(firstBabyName) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(secondBabyName) })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(secondBabyName) }).click();
  await expect(page).toHaveURL(/\/babies\/([^/]+)\/feeding$/, { timeout: 20_000 });

  await page.getByRole("link", { name: "照片" }).click();
  await expect(page).toHaveURL(/\/babies\/([^/]+)\/photos$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: secondBabyName })).toBeVisible({ timeout: 20_000 });
});
