'use strict';
const crypto = require('crypto');
function encode(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload, secret) { return crypto.createHmac('sha256', secret).update(payload).digest('base64url'); }
function createSessionToken(session, secret) {
  const payload = encode(JSON.stringify({ v: 1, sub: String(session.userId), name: String(session.userName || ''), exp: Math.trunc(Number(session.expiresAtMs) / 1000) }));
  return `${payload}.${sign(payload, secret)}`;
}
function verifySessionToken(token, secret, nowMs = Date.now()) {
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return null;
    const expected = sign(payload, secret);
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.v !== 1 || !decoded.sub || !Number.isFinite(Number(decoded.exp))) return null;
    if (Number(decoded.exp) * 1000 <= nowMs) return null;
    return Object.freeze({ userId: String(decoded.sub), userName: String(decoded.name || ''), expiresAtMs: Number(decoded.exp) * 1000 });
  } catch { return null; }
}
module.exports = { createSessionToken, verifySessionToken };
