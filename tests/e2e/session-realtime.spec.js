const { test, expect } = require('@playwright/test');
const { TEST_ROOM, installMockBackend, login } = require('./helpers/mock-backend.js');

test.beforeEach(async ({ page }) => {
  await installMockBackend(page);
});

test('creates an anonymous server session and loads the room list', async ({ page }) => {
  const sessionRequests = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/session')) sessionRequests.push(request.postDataJSON());
  });

  await login(page, 'Следопыт');

  await expect(page.locator('#tavern-my-name')).toHaveText('Следопыт');
  await expect.poll(async () => page.evaluate(() => window.__lastRoomsSnapshot?.rooms?.length || 0)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__lastRoomsSnapshot?.rooms?.[0]?.id || '')).toBe(TEST_ROOM.id);

  expect(sessionRequests).toHaveLength(1);
  expect(sessionRequests[0]).toMatchObject({ userName: 'Следопыт' });
  expect(await page.evaluate(() => localStorage.getItem('int_user_id'))).toBe('user-a');
  expect(await page.evaluate(() => localStorage.getItem('int_auth_token'))).toBe('test-session-token');
});

test('authenticates the tavern socket and reconnects with the same session', async ({ page }) => {
  await login(page);

  await expect.poll(async () => page.evaluate(() => window.__mockWebSockets.length)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__mockWebSockets[0].sent.length)).toBeGreaterThan(0);

  const firstJoin = await page.evaluate(() => window.__mockWebSockets[0].sent[0]);
  expect(firstJoin).toMatchObject({
    type: 'joinTavern',
    roomId: '__tavern_lobby__',
    authToken: 'test-session-token',
    userId: 'user-a'
  });

  await page.evaluate(() => window.__mockWebSockets[0].serverClose());

  await expect.poll(async () => page.evaluate(() => window.__mockWebSockets.length), { timeout: 2_000 }).toBe(2);
  await expect.poll(async () => page.evaluate(() => window.__mockWebSockets[1].sent.length), { timeout: 2_000 }).toBeGreaterThan(0);

  const reconnectJoin = await page.evaluate(() => window.__mockWebSockets[1].sent[0]);
  expect(reconnectJoin).toMatchObject({
    type: 'joinTavern',
    roomId: '__tavern_lobby__',
    authToken: 'test-session-token',
    userId: 'user-a'
  });
});
