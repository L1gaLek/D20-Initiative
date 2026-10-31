const DEFAULT_TIMEOUT_MS = 7000;

function getArgValue(...names) {
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    for (const name of names) {
      if (arg === name) return process.argv[i + 1] || '';
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return '';
}

function normalizeBaseUrl(raw) {
  const fallbackPort = String(process.env.PORT || '8080').trim();
  const fallback = `http://127.0.0.1:${fallbackPort}`;
  return String(raw || fallback).trim().replace(/\/+$/g, '');
}

function apiUrl(baseUrl, path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  if (baseUrl.endsWith('/api')) return `${baseUrl}${cleanPath}`;
  return `${baseUrl}/api${cleanPath}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    getArgValue('--url', '--base-url') || process.env.SMOKE_BASE_URL
  );
  const timeoutMs = Math.max(
    1000,
    Math.trunc(Number(getArgValue('--timeout') || process.env.SMOKE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  );

  const healthUrl = apiUrl(baseUrl, '/health');
  const health = await fetchWithTimeout(healthUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  }, timeoutMs);
  const healthText = await health.text();

  assert(health.status === 200, `GET ${healthUrl} expected 200, got ${health.status}: ${healthText}`);
  assert(/"ok"\s*:\s*true/.test(healthText), `GET ${healthUrl} response should contain {"ok":true}`);
  assert(
    String(health.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff',
    'Missing or invalid X-Content-Type-Options header'
  );
  assert(
    String(health.headers.get('x-frame-options') || '').toUpperCase() === 'DENY',
    'Missing or invalid X-Frame-Options header'
  );
  assert(
    String(health.headers.get('ratelimit-limit') || '').trim(),
    'Missing RateLimit-Limit header'
  );

  const badJsonUrl = apiUrl(baseUrl, '/session');
  const badJson = await fetchWithTimeout(badJsonUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: '{"broken"'
  }, timeoutMs);
  const badJsonText = await badJson.text();

  assert(
    badJson.status === 400,
    `POST ${badJsonUrl} with invalid JSON expected 400, got ${badJson.status}: ${badJsonText}`
  );
  assert(
    /Invalid JSON body/i.test(badJsonText),
    `POST ${badJsonUrl} invalid JSON response should mention "Invalid JSON body": ${badJsonText}`
  );

  console.log(`Smoke test passed: ${baseUrl}`);
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error?.message || error}`);
  process.exit(1);
});
