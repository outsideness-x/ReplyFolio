import { test, expect, type Page } from '@playwright/test';
async function open(page: Page, route: string) {
  await page.goto('/?demo=1#/' + route);
  await expect(page.locator('.demo-banner')).toContainText('сообщения в Instagram не отправляются');
}
async function send(page: Page, text: string) {
  await page.getByLabel('Тестовое сообщение').fill(text);
  await page.getByRole('button', { name: 'Отправить в симулятор' }).click();
}
test('material request becomes a persisted lead and can be exported', async ({ page }) => {
  await open(page, 'lab');
  await send(page, 'материалы');
  await page.getByRole('button', { name: 'Учебные материалы', exact: true }).click();
  await expect(page.locator('.phone-messages')).toContainText('email');
  await send(page, 'student@example.com');
  await expect(page.locator('.phone-messages')).toContainText('Заявка сохранена');
  await page.getByRole('button', { name: 'Заявки', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'student@example.com' });
  await expect(row).toBeVisible();
  await row.getByRole('combobox').selectOption('qualified');
  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: 'student@example.com' }).getByRole('combobox'),
  ).toHaveValue('qualified');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/replyfolio-leads.*\.csv/);
});
test('comment emits one private reply and continues only on a DM', async ({ page }) => {
  await open(page, 'lab');
  await page.getByLabel('Тип обращения').selectOption('comment');
  await send(page, 'урок');
  await expect(page.locator('.phone-messages .message-row.out')).toHaveCount(1);
  await expect(page.locator('.phone-messages')).toContainText('Ответьте «прайс»');
  await page.getByLabel('Тип обращения').selectOption('dm');
  await send(page, 'прайс');
  await expect(page.locator('.phone-messages .message-row.out')).toHaveCount(3);
  await send(page, 'comment@example.com');
  await expect(page.locator('.phone-messages')).toContainText('Передаю заявку');
  await expect(page.locator('.phone-header')).toContainText('Менеджер');
});
test('manager reply pauses the bot and subsequent inbound text stays visible', async ({ page }) => {
  await open(page, 'lab');
  await send(page, 'прайс');
  await page.getByRole('button', { name: 'Открыть диалог', exact: true }).click();
  await page.getByLabel('Ответ менеджера').fill('Помогу выбрать обучение');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await expect(page.locator('.chat-status')).toContainText('Отвечает менеджер');
  const count = await page.locator('.messages .message-row.out').count();
  await page.getByRole('button', { name: 'Сообщение ученика', exact: true }).click();
  await page.getByLabel('Сообщение ученика', { exact: true }).fill('материалы');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await expect(page.locator('.messages .message-row.in').last()).toContainText('материалы');
  await expect(page.locator('.messages .message-row.out')).toHaveCount(count);
});
test('materials can be created, edited and deleted while used materials are protected', async ({
  page,
}) => {
  await open(page, 'materials');
  await page.getByRole('button', { name: 'Добавить материал', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Урок проверки');
  await page.getByLabel('HTTPS-ссылка').fill('https://example.com/test.pdf');
  await page.getByRole('button', { name: 'Сохранить материал' }).click();
  await expect(page.getByRole('heading', { name: 'Урок проверки' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать Урок проверки', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Обновлённый урок');
  await page.getByRole('button', { name: 'Сохранить материал' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Обновлённый урок' })).toBeVisible();
  await page.getByRole('button', { name: 'Удалить Обновлённый урок' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить материал', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Обновлённый урок' })).toHaveCount(0);
  const used = page.locator('.material-card').first();
  await used.getByRole('button', { name: /Удалить/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить материал', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('используется');
});
test('visual flow edits persist and invalid message size is rejected', async ({ page }) => {
  await open(page, 'flows');
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Открыть', exact: true })
    .click();
  await page.getByLabel('Название сценария').fill('Материалы для новичка');
  await page.getByLabel('Текст блока').fill('Привет! Это бот нашей команды.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Сценарий сохранён');
  await page.getByRole('button', { name: 'Назад к сценариям' }).click();
  await expect(page.getByRole('heading', { name: 'Материалы для новичка' })).toBeVisible();
  await page.reload();
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Открыть', exact: true })
    .click();
  await expect(page.getByLabel('Текст блока')).toHaveValue('Привет! Это бот нашей команды.');
  await page.getByLabel('Текст блока').fill('я'.repeat(501));
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1000');
});
test('workspace settings persist and reset explicitly replaces demonstration data', async ({
  page,
}) => {
  await open(page, 'settings');
  await page.getByLabel('Название', { exact: true }).fill('Тестовая школа');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await page.reload();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Тестовая школа');
  await page.getByRole('button', { name: 'Сбросить демоданные' }).click();
  await page.getByRole('button', { name: 'Сбросить демосреду', exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('EdTech команда');
});
test('unsaved flow edits are protected when switching sections', async ({ page }) => {
  await open(page, 'flows');
  await page
    .locator('.flow-card')
    .first()
    .getByRole('button', { name: 'Открыть', exact: true })
    .click();
  await page.getByLabel('Текст блока').fill('Не теряем изменения');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await expect(page.getByLabel('Текст блока')).toHaveValue('Не теряем изменения');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Материалы', exact: true })).toBeVisible();
});
test('new comment flow can be configured and enabled on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'flows');
  await expect(page.locator('.sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -238, 0)');
  await page.getByRole('button', { name: 'Новый сценарий', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Из комментария в Direct/ })
    .click();
  await page.getByLabel('Название сценария').fill('Мобильный урок');
  await page.locator('.trigger-node').click();
  await page.getByLabel('Ключевые слова').fill('курс');
  await page.getByLabel('Публикации').fill('123456789');
  await page.getByLabel('Сценарий активен').check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Сценарий сохранён');
  await page.getByRole('button', { name: 'Назад к сценариям' }).click();
  const flow = page.locator('.flow-card').filter({ hasText: 'Мобильный урок' });
  await expect(flow.getByRole('switch')).toBeChecked();
  await expect(flow).toContainText('курс');
});
for (const width of [390, 768, 1440])
  test('all pages fit viewport ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [route, title] of [
      ['dashboard', 'Обзор'],
      ['app-analytics', 'Аналитика приложения'],
      ['instagram-analytics', 'Аналитика Instagram'],
      ['relationships', 'Взаимосвязи'],
      ['inbox', 'Диалоги'],
      ['flows', 'Сценарии'],
      ['materials', 'Материалы'],
      ['leads', 'Заявки'],
      ['lab', 'Симулятор'],
      ['settings', 'Настройки'],
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
