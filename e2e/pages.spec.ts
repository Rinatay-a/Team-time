import { expect, test } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';

const id = '00000000-0000-0000-0000-000000000003';
const meeting = {
  id, title: 'Общий опрос', description: '', poll_type: 'availability', meeting_duration: null,
  timezone: 'Europe/Moscow', start_hour: '09:00', end_hour: '12:00', slot_duration: 30,
  results_visibility: 'organizer', status: 'collecting', dates: ['2026-10-21'],
};

test('production: /Team-time/, прямой вход, сохранение, повторный визит и второе устройство', async ({ browser }) => {
  // Only the HTTP boundary is mocked; the production bundle and Supabase SDK
  // run unchanged. Shared state represents the remote database for two devices.
  const responses = new Map<string, { id: string; display_name: string; slots: string[]; updated_at: string }>();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const requests: string[] = [];
  const attach = async (context: BrowserContext) => context.route('https://pages-check.supabase.co/functions/v1/team-time-api', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    } });
    const body = route.request().postDataJSON();
    requests.push(body.action);
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (body.action === 'public_meeting') return route.fulfill({ json: {
      meeting, canViewResults: false, myResponse: responses.get(body.editToken) || null,
    }, headers });
    if (body.action === 'save_availability') {
      const participant = { id: body.editToken.slice(0, 8), display_name: body.displayName, slots: body.slots, updated_at: new Date().toISOString() };
      responses.set(body.editToken, participant);
      return route.fulfill({ json: { participant, editToken: body.editToken }, headers });
    }
    throw new Error(`Unexpected API action: ${body.action}`);
  });
  await attach(contextA);
  await attach(contextB);
  try {
    const page = await contextA.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Время команды', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Создать опрос', exact: true })).toHaveAttribute('href', '#/admin/new');
    await expect(page.getByText('Пример календаря. Не данные участников.')).toBeVisible();
    const loadedFonts = await page.evaluate(async () => {
      const body = await document.fonts.load('400 16px Montserrat', 'Время команды 0123');
      const heading = await document.fonts.load('500 32px Unbounded', 'Время команды');
      return { body: body.length, heading: heading.length };
    });
    expect(loadedFonts.body).toBeGreaterThan(0);
    expect(loadedFonts.heading).toBeGreaterThan(0);
    const fontPaths = await page.locator('link[as="font"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(fontPaths).toHaveLength(2);
    expect(fontPaths.every((path) => path?.startsWith('/Team-time/fonts/'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Открыть демо' })).toHaveCount(0);
    const assets = await page.locator('script[src]').evaluateAll((scripts) => scripts.map((node) => node.getAttribute('src')));
    expect(assets.every((src) => src?.startsWith('/Team-time/assets/'))).toBe(true);

    await page.goto(`./#/meet/${id}`);
    await page.getByLabel('Имя и фамилия').fill('Анна Соколова');
    await page.getByRole('button', { name: /Продолжить/ }).click();
    await page.locator('[data-slot="2026-10-21T09:00"]').click();
    await page.getByRole('button', { name: 'Сохранить доступность' }).click();
    await expect(page.getByRole('heading', { name: 'Ответ сохранён' })).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-slot="2026-10-21T09:00"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-slot="2026-10-21T09:30"]').click();
    await page.getByRole('button', { name: 'Сохранить доступность' }).click();
    await expect(page.getByRole('heading', { name: 'Ответ сохранён' })).toBeVisible();
    expect(responses.size).toBe(1);
    expect([...responses.values()][0].slots).toHaveLength(2);

    const mobile = await contextB.newPage();
    await mobile.goto(`./#/meet/${id}`);
    await mobile.getByLabel('Имя и фамилия').fill('Борис Иванов');
    await mobile.getByRole('button', { name: /Продолжить/ }).click();
    await mobile.locator('[data-slot="2026-10-21T10:00"]').tap();
    await mobile.getByRole('button', { name: 'Сохранить доступность' }).click();
    await expect(mobile.getByRole('heading', { name: 'Ответ сохранён' })).toBeVisible();
    expect(responses.size).toBe(2);
    expect([...responses.values()].map((p) => p.display_name).sort()).toEqual(['Анна Соколова', 'Борис Иванов']);
    await page.goto('./#/admin/new');
    await expect(page.getByRole('heading', { name: 'Вход организатора' })).toBeVisible();
    expect(requests.filter((action) => action === 'save_availability')).toHaveLength(3);
    expect(errors).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('production: вход организатора и создание двух типов опроса', async ({ page }) => {
  const user = { id: '00000000-0000-0000-0000-000000000001', email: 'organizer@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode('test-signature')}`;
  const created: Record<string, unknown>[] = [];
  let current = { ...meeting };
  await page.route('https://pages-check.supabase.co/**', async (route) => {
    const request = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
    if (request.url().includes('/auth/v1/token')) return route.fulfill({ headers, json: {
      access_token: accessToken, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user,
    } });
    const body = request.postDataJSON();
    expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
    if (body.action === 'admin_list') return route.fulfill({ headers, json: [] });
    if (body.action === 'admin_create') {
      created.push(body.input);
      current = { ...meeting, ...body.input };
      return route.fulfill({ headers, json: { meeting: current } });
    }
    if (body.action === 'admin_detail') return route.fulfill({ headers, json: { meeting: current, participants: [] } });
    throw new Error(`Unexpected authenticated request: ${request.url()} ${body.action}`);
  });
  await page.goto('./#/login');
  await page.getByLabel('Электронная почта').fill(user.email);
  await page.getByLabel('Пароль').fill('local-test-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои опросы' })).toBeVisible();
  for (const [type, label] of [['availability', 'Собрать свободное время'], ['meeting', 'Подобрать время встречи']]) {
    await page.goto('./#/admin/new');
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByLabel('Название', { exact: true }).fill(`Проверка ${type}`);
    await page.getByRole('button', { name: 'Создать опрос', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Проверка ${type}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  expect(created).toHaveLength(2);
  expect(created[0]).toMatchObject({ poll_type: 'availability', meeting_duration: null });
  expect(created[1]).toMatchObject({ poll_type: 'meeting', meeting_duration: 90 });
});
