import { test, expect, type Page } from '@playwright/test';
import { demoSnapshot } from '../src/data/demo.ts';
const ws = '11111111-1111-4111-8111-111111111111';
async function mockAuth(page: Page, kind: 'team' | 'outsider' | 'anonymous') {
  await page.route('**/api/auth', async (route) => {
    const request = route.request(),
      body = request.method() === 'POST' ? request.postDataJSON() : {};
    let result: Record<string, unknown> = { state: 'anonymous' };
    if (body.action === 'start') result = { state: 'code' };
    if (body.action === 'verify-email') result = { state: kind === 'team' ? 'mfa' : 'waitlist' };
    if (body.action === 'mfa-start') result = { state: 'mfa', enrollment: false };
    if (body.action === 'mfa-verify') result = { state: 'active', workspaceId: ws };
    if (body.action === 'waitlist') result = { state: 'joined' };
    await route.fulfill({ json: result });
  });
  await page.route('**/api/workspace-api', async (route) => {
    if (kind !== 'team') {
      await route.fulfill({ status: 403, json: { error: 'Доступ закрыт.' } });
      return;
    }
    await route.fulfill({ json: demoSnapshot() });
  });
}
async function verifyEmail(page: Page, email: string) {
  await page.getByLabel('Email для входа').fill(email);
  await page.getByRole('button', { name: 'Продолжить с email' }).click();
  await page.getByLabel('Код из письма').fill('12345678');
  await page.getByRole('button', { name: 'Подтвердить email', exact: true }).click();
}
test('team entry requires both email proof and MFA before rendering the workspace', async ({
  page,
}) => {
  await mockAuth(page, 'team');
  await page.goto('/');
  await verifyEmail(page, 'owner@team.invalid');
  await expect(page.getByRole('heading', { name: 'Обзор', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть проверку' }).click();
  await page.getByLabel('Код аутентификатора').fill('123456');
  await page.getByRole('button', { name: 'Подтвердить вход', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /token|supabase|sb-/.test(k)),
    ),
  ).toEqual([]);
});
test('outsider receives a consent-based waitlist and never loads the workspace', async ({
  page,
}) => {
  let reads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/workspace-api')) reads++;
  });
  await mockAuth(page, 'outsider');
  await page.goto('/#/settings');
  await verifyEmail(page, 'visitor@external.invalid');
  await expect(page.getByRole('heading', { name: /Здесь скоро/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Присоединиться к листу' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Присоединиться к листу' }).click();
  await expect(page.getByRole('heading', { name: 'До скорой встречи.' })).toBeVisible();
  expect(reads).toBe(0);
});
test('an unverified visitor cannot enter through a direct workspace URL', async ({ page }) => {
  await mockAuth(page, 'anonymous');
  await page.goto('/#/inbox');
  await expect(page.getByLabel('Email для входа')).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
});
test('theme and command search are functional while the welcome banner is absent', async ({
  page,
}) => {
  await page.goto('/?demo=1#/dashboard');
  await expect(page.locator('.welcome')).toHaveCount(0);
  await page.getByRole('button', { name: 'Тёмная тема' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Быстрый поиск').fill('материалы');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Материалы', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Быстрый поиск').fill('d7');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Аналитика приложения', exact: true }),
  ).toBeVisible();
});
for (const width of [390, 768, 1440])
  test('landing composition fits viewport ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAuth(page, 'anonymous');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Каждый шаг. Общая картина.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const previewLink = page.getByRole('link', { name: 'Как это ощущается' });
    if (await previewLink.isVisible()) await previewLink.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
