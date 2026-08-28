const { expect } = require('@playwright/test');

const TEST_ROOM = Object.freeze({
  id: 'room-a',
  name: 'Тестовая комната',
  scenario: 'Characterization',
  hasPassword: false,
  uniqueUsers: 1,
  ownerName: 'Ведущий',
  isMine: false
});

async function installMockBackend(page, options = {}) {
  const rooms = Array.isArray(options.rooms) ? options.rooms : [TEST_ROOM];

  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      static instances = [];

      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.sent = [];
        MockWebSocket.instances.push(this);
        setTimeout(() => {
          if (this.readyState !== MockWebSocket.CONNECTING) return;
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.({ type: 'open' });
        }, 0);
      }

      send(raw) {
        this.sent.push(JSON.parse(String(raw)));
      }

      close() {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ type: 'close', code: 1000 });
      }

      serverClose(code = 1006) {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ type: 'close', code });
      }

      serverMessage(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }

    window.WebSocket = MockWebSocket;
    window.__mockWebSockets = MockWebSocket.instances;
  });

  await page.route('https://cdn.jsdelivr.net/**', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: 'window.supabase={createClient:()=>({})};'
    });
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');

    if (path === '/session' && request.method() === 'POST') {
      await route.fulfill({
        json: {
          ok: true,
          token: 'test-session-token',
          userId: 'user-a',
          expiresAt: '2099-01-01T00:00:00.000Z'
        }
      });
      return;
    }

    if (path === '/rooms' && request.method() === 'GET') {
      await route.fulfill({ json: { ok: true, rooms, totalUsers: 1 } });
      return;
    }

    if (path === '/tavern/chat' && request.method() === 'GET') {
      await route.fulfill({ json: { ok: true, rows: [] } });
      return;
    }

    if (path === '/tavern/announcements' && request.method() === 'GET') {
      await route.fulfill({ json: { ok: true, rows: [] } });
      return;
    }

    await route.fulfill({ status: 404, json: { ok: false, error: `Unhandled test route: ${path}` } });
  });
}

async function login(page, name = 'Игрок') {
  await page.goto('/');
  await page.locator('#username').fill(name);
  await page.locator('#joinBtn').click();
  await expect(page.locator('#tavern-container')).toBeVisible();
}

module.exports = { TEST_ROOM, installMockBackend, login };
