import { test, expect, type Page } from '@playwright/test';
async function open(page: Page, route: string) {
  await page.goto('/?demo=1#/' + route);
  await expect(page.locator('.demo-banner')).toContainText('no messages are sent to Instagram');
}
async function send(page: Page, text: string) {
  await page.getByLabel('Test message').fill(text);
  await page.getByRole('button', { name: 'Send to simulator' }).click();
}
test('material request becomes a persisted lead and can be exported', async ({ page }) => {
  await open(page, 'lab');
  await send(page, 'materials');
  await page.getByRole('button', { name: 'Learning resources', exact: true }).click();
  await expect(page.locator('.phone-messages')).toContainText('email');
  await send(page, 'student@example.com');
  await expect(page.locator('.phone-messages')).toContainText('Your lead has been saved');
  await page.getByRole('button', { name: 'Leads', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'student@example.com' });
  await expect(row).toBeVisible();
  await row.getByRole('combobox').selectOption('qualified');
  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: 'student@example.com' }).getByRole('combobox'),
  ).toHaveValue('qualified');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/growththread-leads.*\.csv/);
});
test('comment emits one private reply and continues only on a DM', async ({ page }) => {
  await open(page, 'lab');
  await page.getByLabel('Request type').selectOption('comment');
  await send(page, 'lesson');
  await expect(page.locator('.phone-messages .message-row.out')).toHaveCount(1);
  await expect(page.locator('.phone-messages')).toContainText('Reply “price”');
  await page.getByLabel('Request type').selectOption('dm');
  await send(page, 'price');
  await expect(page.locator('.phone-messages .message-row.out')).toHaveCount(3);
  await send(page, 'comment@example.com');
  await expect(page.locator('.phone-messages')).toContainText("I'm passing your lead");
  await expect(page.locator('.phone-header')).toContainText('Team');
});
test('manager reply pauses the bot and subsequent inbound text stays visible', async ({ page }) => {
  await open(page, 'lab');
  await send(page, 'price');
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  await page.getByLabel('Team reply').fill("I'll help you choose a course");
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.chat-status')).toContainText('Team is replying');
  const count = await page.locator('.messages .message-row.out').count();
  await page.getByRole('button', { name: 'Learner message', exact: true }).click();
  await page.getByLabel('Learner message', { exact: true }).fill('materials');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.messages .message-row.in').last()).toContainText('materials');
  await expect(page.locator('.messages .message-row.out')).toHaveCount(count);
});
test('materials can be created, edited and deleted while used materials are protected', async ({
  page,
}) => {
  await open(page, 'materials');
  await page.getByRole('button', { name: 'Add material', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Test lesson');
  await page.getByLabel('HTTPS link').fill('https://example.com/test.pdf');
  await page.getByRole('button', { name: 'Save material' }).click();
  await expect(page.getByRole('heading', { name: 'Test lesson' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test lesson', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Updated lesson');
  await page.getByRole('button', { name: 'Save material' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Updated lesson' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Updated lesson' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete material', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Updated lesson' })).toHaveCount(0);
  const used = page.locator('.material-card').first();
  await used.getByRole('button', { name: /Delete/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete material', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('used');
});
test('visual flow edits persist and invalid message size is rejected', async ({ page }) => {
  await open(page, 'flows');
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await page.getByLabel('Flow name').fill('Resources for beginners');
  await page.getByLabel('Block text').fill("Hi! This is our team's bot.");
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Flow saved');
  await page.getByRole('button', { name: 'Back to flows' }).click();
  await expect(page.getByRole('heading', { name: 'Resources for beginners' })).toBeVisible();
  await page.reload();
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await expect(page.getByLabel('Block text')).toHaveValue("Hi! This is our team's bot.");
  await page.getByLabel('Block text').fill('я'.repeat(501));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1000');
});
test('workspace settings persist and reset explicitly replaces demonstration data', async ({
  page,
}) => {
  await open(page, 'settings');
  await page.getByLabel('Title', { exact: true }).fill('Test school');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Test school');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('button', { name: 'Reset demo workspace', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('EdTech team');
});
test('unsaved flow edits are protected when switching sections', async ({ page }) => {
  await open(page, 'flows');
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await page.getByLabel('Block text').fill('Keep our changes');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await expect(page.getByLabel('Block text')).toHaveValue('Keep our changes');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Materials', exact: true })).toBeVisible();
});
test('new comment flow can be configured and enabled on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'flows');
  await expect(page.locator('.sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -238, 0)');
  await page.getByRole('button', { name: 'New flow', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /From comments to Direct/ })
    .click();
  await page.getByLabel('Flow name').fill('Mobile lesson');
  await page.locator('.trigger-node').click();
  await page.getByLabel('Keywords').fill('course');
  await page.getByLabel('Posts').fill('123456789');
  await page.getByLabel('Flow active').check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Flow saved');
  await page.getByRole('button', { name: 'Back to flows' }).click();
  const flow = page.locator('.flow-card').filter({ hasText: 'Mobile lesson' });
  await expect(flow.getByRole('switch')).toBeChecked();
  await expect(flow).toContainText('course');
});
for (const width of [390, 768, 1440])
  test('all pages fit viewport ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [route, title] of [
      ['dashboard', 'Overview'],
      ['app-analytics', 'App analytics'],
      ['instagram-analytics', 'Instagram analytics'],
      ['relationships', 'Relationships'],
      ['inbox', 'Inbox'],
      ['flows', 'Flows'],
      ['materials', 'Materials'],
      ['leads', 'Leads'],
      ['lab', 'Simulator'],
      ['settings', 'Settings'],
    ]) {
      await open(page, route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        route,
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
