import { expect, test } from '@playwright/test';

async function openCalendar(page: import('@playwright/test').Page, name = 'Тестовый Участник') {
  await page.goto('/#/meet/demo');
  const input = page.getByLabel('Имя и фамилия');
  if (await input.isVisible()) {
    await input.fill(name);
    await page.getByRole('button', { name: /Продолжить/ }).click();
  }
  await expect(page.locator('[data-time-grid]')).toBeVisible();
}

async function fitRange(page: import('@playwright/test').Page, from: string, to: string) {
  await page.evaluate(([first, last]) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const a = document.querySelector<HTMLElement>(`[data-slot="${first}"]`)!.getBoundingClientRect();
    const b = document.querySelector<HTMLElement>(`[data-slot="${last}"]`)!.getBoundingClientRect();
    const absoluteMiddle = scrollY + (a.top + b.bottom) / 2;
    window.scrollTo(0, Math.max(0, absoluteMiddle - innerHeight / 2));
  }, [from, to]);
}

async function drag(page: import('@playwright/test').Page, from: string, to: string) {
  await fitRange(page, from, to);
  const start = await page.locator(`[data-slot="${from}"]`).boundingBox();
  const end = await page.locator(`[data-slot="${to}"]`).boundingBox();
  if (!start || !end) throw new Error('Ячейки не видны');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 14 });
  await page.mouse.up();
}

const selectedCount = (page: import('@playwright/test').Page, date: string) =>
  page.locator(`[data-slot^="${date}"][aria-pressed="true"]`).count();

test('мышь выделяет и снимает 10 слотов, смена недели сохраняет выбор', async ({ page }) => {
  await openCalendar(page);
  await drag(page, '2026-10-19T09:00', '2026-10-19T13:30');
  await expect.poll(() => selectedCount(page, '2026-10-19')).toBe(10);
  await drag(page, '2026-10-19T09:00', '2026-10-19T13:30');
  await expect.poll(() => selectedCount(page, '2026-10-19')).toBe(0);
  await drag(page, '2026-10-19T09:00', '2026-10-19T13:30');
  await page.getByRole('button', { name: /Следующая/ }).click();
  await expect(page.locator('[data-slot="2026-10-26T09:00"]')).toBeAttached();
  await page.getByRole('button', { name: /Предыдущая/ }).click();
  await expect.poll(() => selectedCount(page, '2026-10-19')).toBe(10);
});

test('pointerup за пределами не оставляет залипший drag', async ({ page }) => {
  await openCalendar(page, 'Проверка Отмены');
  await fitRange(page, '2026-10-19T09:00', '2026-10-19T09:00');
  const cell = await page.locator('[data-slot="2026-10-19T09:00"]').boundingBox();
  if (!cell) throw new Error('Ячейка не видна');
  await page.mouse.move(cell.x + 10, cell.y + 10);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await page.mouse.move(cell.x + 10, cell.y + 200);
  expect(await selectedCount(page, '2026-10-19')).toBe(1);
});

test('touch-жест выделяет диапазон на мобильном экране', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openCalendar(page, 'Мобильный Участник');
  await fitRange(page, '2026-10-19T09:00', '2026-10-19T13:30');
  const start = await page.locator('[data-slot="2026-10-19T09:00"]').boundingBox();
  const end = await page.locator('[data-slot="2026-10-19T13:30"]').boundingBox();
  if (!start || !end) throw new Error('Ячейки не видны');
  const session = await context.newCDPSession(page);
  const point = (box: typeof start) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => selectedCount(page, '2026-10-19')).toBe(10);
  await context.close();
});
