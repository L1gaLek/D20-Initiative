'use strict';

function readString(env, key, fallback = '') {
  const value = String(env?.[key] == null ? fallback : env[key]).trim();
  return value;
}

function readPort(env, key, fallback) {
  const value = Number(readString(env, key, fallback));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535`);
  }
  return value;
}

function loadServerConfig(env = process.env, options = {}) {
  const nodeEnv = readString(env, 'NODE_ENV', 'development');
  const config = Object.freeze({
    nodeEnv,
    host: readString(env, 'SERVER_HOST', '127.0.0.1'),
    port: readPort(env, 'SERVER_PORT', '8080'),
    databaseUrl: readString(env, 'DATABASE_URL'),
    sessionSecret: readString(env, 'SESSION_SECRET'),
    allowedOrigins: Object.freeze(readString(env, 'ALLOWED_ORIGINS')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean))
  });

  const strict = options.strict !== false;
  if (strict) {
    const missing = [];
    if (!config.databaseUrl) missing.push('DATABASE_URL');
    if (!config.sessionSecret) missing.push('SESSION_SECRET');
    if (config.sessionSecret && config.sessionSecret.length < 32) missing.push('SESSION_SECRET (minimum 32 characters)');
    if (!config.allowedOrigins.length) missing.push('ALLOWED_ORIGINS');
    if (missing.length) throw new Error(`Invalid server configuration: ${missing.join(', ')}`);
  }
  return config;
}

module.exports = { loadServerConfig };
