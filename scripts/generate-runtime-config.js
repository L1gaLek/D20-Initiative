const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const OUTPUT_PATH = path.join(ROOT, 'client', 'runtime-config.js');

function parseEnv(source) {
  const values = {};
  String(source || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  });
  return values;
}

const fileEnv = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
const env = { ...fileEnv, ...process.env };
const required = [
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'PUBLIC_WS_URL',
  'PUBLIC_VPS_API_BASE',
  'PUBLIC_BGM_UPLOAD_ENDPOINT',
  'PUBLIC_BOARD_BG_UPLOAD_ENDPOINT'
];
const missing = required.filter((key) => !String(env[key] || '').trim());
if (missing.length) {
  throw new Error(`Missing public configuration: ${missing.join(', ')}`);
}

const config = {
  supabaseUrl: env.PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.PUBLIC_SUPABASE_ANON_KEY,
  supabaseFetchFn: env.PUBLIC_SUPABASE_FETCH_FN || 'fetch',
  wsUrl: env.PUBLIC_WS_URL,
  vpsApiBase: env.PUBLIC_VPS_API_BASE,
  bgmUploadEndpoint: env.PUBLIC_BGM_UPLOAD_ENDPOINT,
  boardBgUploadEndpoint: env.PUBLIC_BOARD_BG_UPLOAD_ENDPOINT
};

const output = `// Generated from .env by scripts/generate-runtime-config.js. Do not commit.\nwindow.D20_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
fs.writeFileSync(OUTPUT_PATH, output, { encoding: 'utf8', mode: 0o600 });
console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)}`);
