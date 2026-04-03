import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

async function waitForBootReady(page: Page) {
  const splash = page.locator(".bootSplash");
  if (await splash.count()) {
    await splash.waitFor({ state: "hidden", timeout: 30_000 });
  }
}

export function uniqueEmail(prefix = "e2e") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@example.com`;
}

export async function register(page: Page, input: { displayName: string; email: string; password: string }) {
  await page.goto("/");
  await waitForBootReady(page);
  await page.getByLabel("登录或注册").getByRole("button", { name: "注册" }).click();
  await page.getByLabel("你的称呼").fill(input.displayName);
  await page.getByLabel("邮箱").fill(input.email);
  await page.getByLabel("密码").fill(input.password);
  await page.getByRole("button", { name: "注册并继续" }).click();
  await page.waitForLoadState("networkidle");
  await waitForBootReady(page);
  await expect(page.getByLabel("邀请码")).toBeVisible({ timeout: 20_000 });
}

export async function login(page: Page, input: { email: string; password: string }) {
  await page.goto("/");
  await waitForBootReady(page);
  await page.getByLabel("登录或注册").getByRole("button", { name: "登录" }).click();
  const loginForm = page.locator("form").filter({ has: page.getByRole("button", { name: /^登录$/ }) }).first();
  await loginForm.getByLabel("邮箱").fill(input.email);
  await loginForm.getByLabel("密码").fill(input.password);
  await loginForm.getByRole("button", { name: /^登录$/ }).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/babies\/.+\/photos(?:\?.*)?$/, { timeout: 20_000 });
}

export async function createAlbum(page: Page, input: { babyName: string; relation: string; birthDate?: string }) {
  await waitForBootReady(page);
  const albumCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "创建第一个宝宝相册" }) });
  await expect(albumCard).toBeVisible();
  await albumCard.getByLabel("宝宝姓名").fill(input.babyName);
  if (input.birthDate) {
    await albumCard.getByLabel("出生日期").fill(input.birthDate);
  }
  await setRelation(albumCard, input.relation);
  await albumCard.getByRole("button", { name: "创建宝宝相册" }).click();
  await expect(page).toHaveURL(/\/babies\/.+\/photos/);
}

export async function openSettings(page: Page) {
  await waitForBootReady(page);
  const settingsTab = page.getByRole("link", { name: "设置" });
  if (await settingsTab.count()) {
    await settingsTab.click();
  } else {
    await page.goto("/settings");
    await waitForBootReady(page);
  }
  await expect(page).toHaveURL(/\/settings/);
}

export async function logout(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: /退出登录/ }).click();
  await waitForBootReady(page);
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:auth)?(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "把宝宝的照片，留在自己手里。" })).toBeVisible();
}

export function latestInviteCode(inviteCards: Locator) {
  return inviteCards.last();
}

export function samplePng(name: string, colorSeed: number) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      colorSeed % 2 === 0
        ? "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pM6kAAAAASUVORK5CYII="
        : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBASLQz48AAAAASUVORK5CYII=",
      "base64"
    )
  };
}

export function sampleMp4(name: string) {
  return {
    name,
    mimeType: "video/mp4",
    buffer: Buffer.from(
      "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAv1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAz//727L4FNhTIwQAAAAhBmiRsQr/+wAAAAAhBnkJ4hf/BgQAAAAgBnmF0Qr/EgAAAAAgBnmNqQr/EgQAAA3Rtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAyAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACn3RyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAyAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAEAAAABAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAMgAAAQAAAEAAAAAAhdtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAADIAAAAKAFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAHCbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABgnN0YmwAAAC+c3RzZAAAAAAAAAABAAAArmF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAEAAQAEgAAABIAAAAAAAAAAEVTGF2YzYyLjExLjEwMCBsaWJ4MjY0AAAAAAAAAAAAAAAY//8AAAA0YXZjQwFkAAr/4QAXZ2QACqzZXsBEAAADAAQAAAMAyDxIllgBAAZo6+PLIsD9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAdkgAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAUAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAA4Y3R0cwAAAAAAAAAFAAAAAQAABAAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAABxzdHNjAAAAAAAAAAEAAAABAAAABQAAAAEAAAAoc3RzegAAAAAAAAAAAAAABQAAAsUAAAAMAAAADAAAAAwAAAAMAAAAFHN0Y28AAAAAAAAAAQAAADAAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYyLjMuMTAw",
      "base64"
    )
  };
}

export async function setRelation(scope: Locator, value: string) {
  const select = scope.getByLabel("你与宝宝的关系");
  const matchingOption = select.locator(`option[value="${value}"]`);
  if (await matchingOption.count()) {
    await select.selectOption(value);
    return;
  }
  await select.selectOption("__custom__");
  await scope.getByLabel("自定义称呼").fill(value);
}
