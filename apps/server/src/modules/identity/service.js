'use strict';
const crypto = require('crypto');
const { createSessionToken, verifySessionToken } = require('../../security/session-token.js');
function normalizeUserName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 64); }
function createIdentityService(options) {
  const secret = String(options.sessionSecret);
  const ttlMs = Math.max(60000, Number(options.sessionTtlMs) || 86400000);
  function readAuthorization(header) { const match = /^Bearer\s+(.+)$/i.exec(String(header || '').trim()); return match ? match[1].trim() : ''; }
  function authenticate(authorization, nowMs = Date.now()) { return verifySessionToken(readAuthorization(authorization), secret, nowMs); }
  function openSession({ authorization, userName }, nowMs = Date.now()) {
    const existing = authenticate(authorization, nowMs);
    const normalizedName = normalizeUserName(userName || existing?.userName);
    if (normalizedName.length < 2) throw Object.assign(new Error('userName must contain at least 2 characters'), { statusCode: 400 });
    const session = { userId: existing?.userId || crypto.randomUUID(), userName: normalizedName, expiresAtMs: nowMs + ttlMs };
    return Object.freeze({ token: createSessionToken(session, secret), userId: session.userId, userName: session.userName, expiresAt: new Date(session.expiresAtMs).toISOString() });
  }
  return Object.freeze({ authenticate, openSession });
}
module.exports = { createIdentityService, normalizeUserName };
