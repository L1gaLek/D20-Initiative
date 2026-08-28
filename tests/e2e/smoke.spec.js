const { test, expect } = require('@playwright/test');

async function openApp(page) {
  await page.route('https://cdn.jsdelivr.net/**', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: 'window.supabase={createClient:()=>({})};'
    });
  });
  await page.goto('/');
}

test('opens the login screen with runtime configuration', async ({ page }) => {
  await openApp(page);

  await expect(page).toHaveTitle(/К20 Инициатива/);
  await expect(page.locator('#login-container')).toBeVisible();
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.locator('#joinBtn')).toHaveText('Войти');

  const config = await page.evaluate(() => ({
    supabaseUrl: window.SUPABASE_URL,
    supabaseAnonKey: window.SUPABASE_ANON_KEY,
    wsUrl: window.WS_URL,
    vpsApiBase: window.VPS_API_BASE
  }));
  expect(config.supabaseUrl).toBeTruthy();
  expect(config.supabaseAnonKey).toBeTruthy();
  expect(config.wsUrl).toMatch(/^wss:\/\//);
  expect(config.vpsApiBase).toMatch(/^https:\/\//);
});

test('validates an empty and too short user name without a network request', async ({ page }) => {
  let sessionRequests = 0;
  await page.route('**/api/session', async (route) => {
    sessionRequests += 1;
    await route.abort();
  });
  await openApp(page);

  await page.locator('#joinBtn').click();
  await expect(page.locator('#loginError')).toHaveText('Введите имя');

  await page.locator('#username').fill('A');
  await page.locator('#joinBtn').click();
  await expect(page.locator('#loginError')).toHaveText('Имя должно содержать от 2 до 20 символов');
  expect(sessionRequests).toBe(0);
});

test('does not expose dotfiles through the local server', async ({ request }) => {
  const envResponse = await request.get('/.env');
  expect(envResponse.status()).toBe(403);

  const gitResponse = await request.get('/.git/config');
  expect(gitResponse.status()).toBe(403);
});
