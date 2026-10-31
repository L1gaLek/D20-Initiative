require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const { Pool } = require('pg');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;

const S3_ENDPOINT = String(process.env.S3_ENDPOINT || 'https://s3.twcstorage.ru').trim();
const S3_REGION = String(process.env.S3_REGION || 'ru-1').trim();
const S3_BUCKET = String(process.env.S3_BUCKET || '').trim();
const S3_ACCESS_KEY = String(process.env.S3_ACCESS_KEY || '').trim();
const S3_SECRET_KEY = String(process.env.S3_SECRET_KEY || '').trim();
const S3_PUBLIC_BASE_URL = String(process.env.S3_PUBLIC_BASE_URL || '').trim();
const ENABLE_APP_CORS = String(process.env.ENABLE_APP_CORS || '1') !== '0';
const ENABLE_APP_CORS_ORIGIN = String(process.env.ENABLE_APP_CORS_ORIGIN || '1') !== '0';
const TRUST_PROXY_HOPS = Math.max(0, Math.min(3, Math.trunc(Number(process.env.TRUST_PROXY_HOPS) || 1)));
const API_RATE_LIMIT_WINDOW_MS = Math.max(1000, Math.trunc(Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60_000));
const API_RATE_LIMIT_MAX = Math.max(1, Math.trunc(Number(process.env.API_RATE_LIMIT_MAX) || 300));
const SESSION_RATE_LIMIT_WINDOW_MS = Math.max(1000, Math.trunc(Number(process.env.SESSION_RATE_LIMIT_WINDOW_MS) || 10 * 60_000));
const SESSION_RATE_LIMIT_MAX = Math.max(1, Math.trunc(Number(process.env.SESSION_RATE_LIMIT_MAX) || 40));
const UPLOAD_RATE_LIMIT_WINDOW_MS = Math.max(1000, Math.trunc(Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS) || 60 * 60_000));
const UPLOAD_RATE_LIMIT_MAX = Math.max(1, Math.trunc(Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 40));
const ALLOWED_CORS_ORIGINS = new Set(
  String(process.env.CORS_ORIGINS || [
    'https://l1galek.github.io',
    'https://1ligalek.github.io',
    'https://l1galek-d20-initiative-370c.twc1.net',
    'https://1lgalek-d20-initiative-370c.twc1.net',
    'http://localhost:8080',
    'http://localhost:5173',
    'http://127.0.0.1:8080'
  ].join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const APP_AUTH_SECRET = String(process.env.APP_AUTH_SECRET || process.env.AUTH_SECRET || '').trim();
const AUTH_TOKEN_TTL_DAYS = Math.max(1, Math.min(3650, Number(process.env.AUTH_TOKEN_TTL_DAYS) || 365));
const ALLOW_LEGACY_USER_ID_BOOTSTRAP = String(process.env.ALLOW_LEGACY_USER_ID_BOOTSTRAP || '0') === '1';
const ALLOW_LEGACY_CHARACTER_MIGRATION = String(process.env.ALLOW_LEGACY_CHARACTER_MIGRATION || '0') === '1';
const ROOM_STATE_CACHE_TTL_MS = Math.max(
  0,
  Math.min(60 * 60_000, Math.trunc(Number(process.env.ROOM_STATE_CACHE_TTL_MS) || 15 * 60_000))
);
const ROOM_CONTEXT_CACHE_TTL_MS = Math.max(
  2500,
  Math.min(5 * 60_000, Math.trunc(Number(process.env.ROOM_CONTEXT_CACHE_TTL_MS) || 30_000))
);

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
  throw new Error('S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required');
}

const AUTH_SECRET = APP_AUTH_SECRET || crypto
  .createHash('sha256')
  .update(`${DATABASE_URL}|${S3_ACCESS_KEY}|${S3_SECRET_KEY}`, 'utf8')
  .digest();

if (!APP_AUTH_SECRET) {
  console.warn('[auth] APP_AUTH_SECRET is not set; deriving auth secret from existing server secrets.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY
  }
});

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);

function addSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  return next();
}

function createRateLimiter({ windowMs, max, bucketName }) {
  const buckets = new Map();
  let lastSweep = 0;

  return function rateLimit(req, res, next) {
    if (req.method === 'OPTIONS') return next();

    const now = Date.now();
    if (now - lastSweep > windowMs) {
      lastSweep = now;
      for (const [key, bucket] of buckets) {
        if (!bucket || Number(bucket.resetAt) <= now) buckets.delete(key);
      }
    }

    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const key = `${bucketName}:${ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    return next();
  };
}

app.use(addSecurityHeaders);
app.use((req, res, next) => {
  if (ENABLE_APP_CORS) {
    const origin = String(req.headers.origin || '').trim();
    if (ENABLE_APP_CORS_ORIGIN && origin && ALLOWED_CORS_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use('/api/session', createRateLimiter({
  windowMs: SESSION_RATE_LIMIT_WINDOW_MS,
  max: SESSION_RATE_LIMIT_MAX,
  bucketName: 'session'
}));
app.use('/api/uploads', createRateLimiter({
  windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX,
  bucketName: 'uploads'
}));
app.use('/api', createRateLimiter({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  bucketName: 'api'
}));
app.use(express.json({ limit: '2mb' }));
app.use((error, req, res, next) => {
  if (!error) return next();
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Request body is too large' });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }
  return next(error);
});

const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const USER_ID_RE = /^[a-zA-Z0-9_.:@-]{1,160}$/;
const ENTITY_ID_RE = /^[a-zA-Z0-9_.:@-]{1,180}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TAVERN_ROOM_LOG_ID = '__tavern_lobby__';
const TAVERN_LOG_PREFIX = 'TVRN1:';
const TAVERN_BOARD_MAX_PER_USER = 2;
const TAVERN_BOARD_MAX_MS_AHEAD = 10.5 * 24 * 60 * 60 * 1000;
const TAVERN_CHAT_TTL_MS = 24 * 60 * 60 * 1000;
const GM_ALREADY_IN_ROOM_MESSAGE = 'В комнате уже присутствует ГМ. Вы не можете войти как ГМ.';

function normalizeRole(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'gm' || raw === 'гм') return 'GM';
  if (raw === 'player' || raw === 'игрок') return 'Player';
  if (raw === 'spectator' || raw === 'observer' || raw === 'зритель') return 'Spectator';
  return '';
}

function normalizeSafeId(value, re = ENTITY_ID_RE) {
  const id = String(value || '').trim();
  if (!id || !re.test(id)) return '';
  return id;
}

function makeHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeText(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signAuthPayload(payloadPart) {
  return base64UrlEncode(
    crypto.createHmac('sha256', AUTH_SECRET).update(String(payloadPart || ''), 'utf8').digest()
  );
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createAuthSession(userIdRaw) {
  const userId = normalizeSafeId(userIdRaw, USER_ID_RE);
  if (!userId) throw makeHttpError('Invalid user id', 400);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.trunc(AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60);
  const payloadPart = base64UrlEncode(JSON.stringify({
    v: 1,
    sub: userId,
    iat: now,
    exp
  }));
  const signature = signAuthPayload(payloadPart);
  return {
    userId,
    token: `${payloadPart}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

function verifyAuthToken(tokenRaw) {
  const token = String(tokenRaw || '').trim();
  const [payloadPart, signature, extra] = token.split('.');
  if (!payloadPart || !signature || extra !== undefined) throw makeHttpError('Authentication required', 401);
  const expected = signAuthPayload(payloadPart);
  if (!safeEqualText(signature, expected)) throw makeHttpError('Invalid auth token', 401);
  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecodeText(payloadPart));
  } catch {
    throw makeHttpError('Invalid auth token', 401);
  }
  const userId = normalizeSafeId(payload?.sub, USER_ID_RE);
  const exp = Number(payload?.exp || 0);
  if (!userId || !Number.isFinite(exp)) throw makeHttpError('Invalid auth token', 401);
  if (exp <= Math.floor(Date.now() / 1000)) throw makeHttpError('Auth token expired', 401);
  return { userId, exp, payload };
}

function getRequestAuthToken(req) {
  const header = String(req.headers?.authorization || '').trim();
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer?.[1]) return bearer[1].trim();
  return String(req.body?.authToken || req.query?.authToken || '').trim();
}

function getOptionalRequestActor(req) {
  const token = getRequestAuthToken(req);
  if (!token) return null;
  try {
    const verified = verifyAuthToken(token);
    return { userId: verified.userId, exp: verified.exp };
  } catch {
    return null;
  }
}

function requireRequestActor(req) {
  const token = getRequestAuthToken(req);
  if (!token) throw makeHttpError('Authentication required', 401);
  const verified = verifyAuthToken(token);
  return { userId: verified.userId, exp: verified.exp };
}

function statusFromError(error, pattern = /required|invalid|member|role|banned|not found|owner/i, fallback = 500) {
  if (Number(error?.status)) return Number(error.status);
  return pattern.test(String(error?.message || '')) ? 403 : fallback;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function stripRoomSecretsFromState(state) {
  const safe = cloneJson(state || {}) || {};
  if (safe.roomAccess && typeof safe.roomAccess === 'object') {
    delete safe.roomAccess.password;
    delete safe.roomAccess.passwordHash;
    delete safe.roomAccess.authorizedUsers;
    delete safe.roomAccess.bannedUsers;
    safe.roomAccess.hasPassword = !!safe.roomAccess.hasPassword;
  }
  return safe;
}

function normalizeIsoDate(value) {
  try {
    if (!value) return null;
    const ms = Number(new Date(value).getTime()) || 0;
    return ms > 0 ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

function makeStatePayload(roomId, state, updatedAt = null, extra = {}) {
  const stateUpdatedAt = normalizeIsoDate(updatedAt);
  return {
    type: 'state',
    roomId,
    state: stripRoomSecretsFromState(state || {}),
    stateUpdatedAt,
    updatedAt: stateUpdatedAt,
    ...extra
  };
}

const roomStateCache = new Map();
const roomStateFetchInFlight = new Map();

function cloneRoomStateRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    ...row,
    state: (row.state && typeof row.state === 'object') ? cloneJson(row.state) : row.state
  };
}

function getCachedRoomStateRow(roomId) {
  if (ROOM_STATE_CACHE_TTL_MS <= 0) return null;
  const id = normalizeSafeId(roomId, ROOM_ID_RE);
  if (!id) return null;
  const entry = roomStateCache.get(id);
  if (!entry || Number(entry.expiresAt || 0) <= Date.now()) {
    roomStateCache.delete(id);
    return null;
  }
  return cloneRoomStateRow(entry.row);
}

function rememberRoomStateRow(roomId, row) {
  if (ROOM_STATE_CACHE_TTL_MS <= 0 || !row) return null;
  const id = normalizeSafeId(roomId || row.id || row.room_id, ROOM_ID_RE);
  if (!id) return null;
  const prev = roomStateCache.get(id)?.row || {};
  const merged = {
    ...prev,
    ...row,
    id: String(row.id || prev.id || id),
    room_id: String(row.room_id || prev.room_id || id)
  };
  if (row.state && typeof row.state === 'object') merged.state = cloneJson(row.state);
  roomStateCache.set(id, {
    row: merged,
    expiresAt: Date.now() + ROOM_STATE_CACHE_TTL_MS
  });
  return cloneRoomStateRow(merged);
}

function rememberRoomStateValue(roomId, state, updatedAt = null, extra = {}) {
  const id = normalizeSafeId(roomId, ROOM_ID_RE);
  if (!id) return null;
  const updated = normalizeIsoDate(updatedAt) || new Date().toISOString();
  return rememberRoomStateRow(id, {
    ...extra,
    id,
    room_id: id,
    state: state && typeof state === 'object' ? state : {},
    updated_at: updated
  });
}

function forgetRoomStateCache(roomId) {
  const id = normalizeSafeId(roomId, ROOM_ID_RE);
  if (id) roomStateCache.delete(id);
}

function boolFrom(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || typeof value === 'undefined') return fallback;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  return fallback;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeRoomId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function sanitizeTrackFileName(name) {
  return String(name || 'track')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/[\\/]+/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 120) || 'track';
}

function getRequestValue(req, ...keys) {
  for (const key of keys) {
    const value = req.body?.[key] ?? req.query?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function resolveUploadedFile(req) {
  if (req.file) return req.file;

  if (Array.isArray(req.files)) {
    return req.files.find(Boolean) || null;
  }

  if (req.files && typeof req.files === 'object') {
    const fromFile = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
    if (fromFile) return fromFile;

    const fromAudio = Array.isArray(req.files.audio) ? req.files.audio[0] : req.files.audio;
    if (fromAudio) return fromAudio;
  }

  return null;
}

function buildS3ObjectKey({ roomId, trackId, fileName }) {
  const safeRoomId = sanitizeRoomId(roomId);
  const safeTrackId = String(trackId || crypto.randomUUID())
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120) || crypto.randomUUID();
  const safeFileName = sanitizeTrackFileName(fileName);
  return `room-audio/${safeRoomId}/${safeTrackId}-${safeFileName}`;
}

function buildPublicS3Url(objectKey) {
  const key = String(objectKey || '').replace(/^\/+/, '');
  const base = String(S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/${key}`;
}

const uploadRoomAudio = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = String(path.extname(file.originalname || '') || '').toLowerCase();

    const allowedMimes = new Set([
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/flac',
      'audio/x-flac'
    ]);

    const allowedExts = new Set([
      '.mp3',
      '.wav',
      '.ogg',
      '.webm',
      '.m4a',
      '.aac',
      '.flac'
    ]);

    if (allowedMimes.has(mime) || allowedExts.has(ext)) {
      return cb(null, true);
    }

    cb(new Error('Unsupported audio format'));
  }
});

const uploadRoomBoardBg = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = String(path.extname(file.originalname || '') || '').toLowerCase();
    const allowedMimes = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'video/webm'
    ]);
    const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm']);
    if (allowedMimes.has(mime) || allowedExts.has(ext)) return cb(null, true);
    cb(new Error('Unsupported board background format'));
  }
});

function getStateRoomMeta(state) {
  const meta = (state && typeof state === 'object' && state.roomMeta && typeof state.roomMeta === 'object')
    ? state.roomMeta
    : {};
  return {
    ownerId: String(meta.ownerId || '').trim(),
    ownerName: String(meta.ownerName || '').trim()
  };
}

async function fetchRoomStateRow(roomId, options = {}) {
  const id = normalizeSafeId(roomId, ROOM_ID_RE);
  const useCache = !options?.forceFresh;
  const cached = useCache ? getCachedRoomStateRow(id || roomId) : null;
  if (cached) return cached;

  if (useCache && id && roomStateFetchInFlight.has(id)) {
    return cloneRoomStateRow(await roomStateFetchInFlight.get(id));
  }

  const load = (async () => {
    const { rows } = await pool.query(
      `
        select
          r.id,
          r.name,
          r.scenario,
          r.has_password,
          r.password_hash,
          s.phase,
          s.current_actor_id,
          s.state,
          s.updated_at
        from public.rooms r
        left join public.room_state s on s.room_id = r.id
        where r.id = $1
        limit 1
      `,
      [id || roomId]
    );
    const row = rows[0] || null;
    if (row) rememberRoomStateRow(id || roomId, row);
    return row;
  })();

  if (useCache && id) roomStateFetchInFlight.set(id, load);
  try {
    return cloneRoomStateRow(await load);
  } finally {
    if (useCache && id) roomStateFetchInFlight.delete(id);
  }
}

async function fetchRoomMember(roomId, userId) {
  const { rows } = await pool.query(
    `
      select room_id, user_id, name, role, last_seen
      from public.room_members
      where room_id = $1 and user_id = $2
      limit 1
    `,
    [roomId, userId]
  );
  return rows[0] || null;
}

async function touchRoomMember(roomId, userId) {
  await pool.query(
    `
      update public.room_members
      set last_seen = now()
      where room_id = $1 and user_id = $2
    `,
    [roomId, userId]
  );
}

async function fetchActiveRoomBan(roomId, userId) {
  const { rows } = await pool.query(
    `
      select room_id, user_id, reason, banned_until
      from public.room_bans
      where room_id = $1
        and user_id = $2
        and banned_until > now()
      order by banned_until desc
      limit 1
    `,
    [roomId, userId]
  );
  return rows[0] || null;
}

async function loadRoomContext(roomIdRaw, userIdRaw) {
  const roomId = normalizeSafeId(roomIdRaw, ROOM_ID_RE);
  const userId = normalizeSafeId(userIdRaw, USER_ID_RE);
  if (!roomId) throw new Error('roomId is invalid');
  if (!userId) throw new Error('userId is invalid');

  const [stateRow, member, ban] = await Promise.all([
    fetchRoomStateRow(roomId),
    fetchRoomMember(roomId, userId),
    fetchActiveRoomBan(roomId, userId).catch(() => null)
  ]);

  if (!stateRow) throw new Error('Room not found');
  if (ban) throw new Error('User is banned in this room');
  if (!member) throw new Error('User is not a member of this room');

  const state = (stateRow.state && typeof stateRow.state === 'object') ? stateRow.state : {};
  const role = normalizeRole(member.role);
  if (!role) throw new Error('Room role is invalid');

  return {
    roomId,
    userId,
    role,
    name: String(member.name || '').trim(),
    ownerId: getStateRoomMeta(state).ownerId,
    room: stateRow,
    state
  };
}

async function loadWsRoomContext(ws, roomIdRaw = '') {
  const roomId = normalizeSafeId(roomIdRaw || ws.currentRoomId, ROOM_ID_RE);
  if (!roomId || !ws.userId) throw new Error('Join room before sending commands');
  if (ws.currentRoomId && ws.currentRoomId !== roomId) throw new Error('roomId does not match current WebSocket room');

  const now = Date.now();
  if (
    ws.roomContext
    && ws.roomContext.roomId === roomId
    && ws.roomContext.userId === ws.userId
    && Number(ws.roomContext.cachedAt || 0) + ROOM_CONTEXT_CACHE_TTL_MS > now
  ) {
    return ws.roomContext;
  }

  const ctx = await loadRoomContext(roomId, ws.userId);
  ctx.cachedAt = now;
  ws.roomContext = ctx;
  ws.role = ctx.role;
  ws.userName = ctx.name;
  return ctx;
}

function ensureGm(ctx) {
  if (!ctx || ctx.role !== 'GM') throw new Error('GM role required');
}

function ensurePlayerOrGm(ctx) {
  if (!ctx || (ctx.role !== 'GM' && ctx.role !== 'Player')) {
    throw new Error('Player or GM role required');
  }
}

function getStatePlayers(state) {
  return Array.isArray(state?.players) ? state.players : [];
}

function findPlayerById(state, tokenId) {
  const id = String(tokenId || '').trim();
  if (!id) return null;
  return getStatePlayers(state).find((p) => p && String(p.id || '') === id) || null;
}

function getActiveMapId(state, fallback = '') {
  return String(state?.currentMapId || fallback || '').trim();
}

function findMapById(state, mapId) {
  const id = String(mapId || '').trim();
  if (!id) return null;
  const maps = Array.isArray(state?.maps) ? state.maps : [];
  return maps.find((m) => m && String(m.id || m.map_id || '') === id) || null;
}

function getStateMapBounds(state, mapId, options = {}) {
  const map = findMapById(state, mapId);
  const fallbackSize = options?.relaxed ? 150 : 10;
  const width = Math.max(5, Math.min(150, Number(map?.boardWidth || state?.boardWidth || fallbackSize) || fallbackSize));
  const height = Math.max(5, Math.min(150, Number(map?.boardHeight || state?.boardHeight || fallbackSize) || fallbackSize));
  return { width, height };
}

async function getMapBounds(roomId, mapId, state) {
  const { rows } = await pool.query(
    `
      select board_width, board_height
      from public.room_map_meta
      where room_id = $1 and map_id = $2
      limit 1
    `,
    [roomId, mapId]
  );
  const row = rows[0] || null;
  const fallback = getStateMapBounds(state, mapId);
  const width = Math.max(5, Math.min(150, Number(row?.board_width || fallback.width || 10) || 10));
  const height = Math.max(5, Math.min(150, Number(row?.board_height || fallback.height || 10) || 10));
  return { width, height };
}

function canControlPlayer(ctx, player) {
  if (!ctx || !player) return false;
  if (ctx.role === 'GM') return true;
  if (ctx.role === 'Spectator') return false;
  return String(player.ownerId || '') === String(ctx.userId || '');
}

function ensureCanControlPlayer(ctx, player) {
  ensurePlayerOrGm(ctx);
  if (!canControlPlayer(ctx, player)) throw new Error('You cannot control this token');
}

function ensureCanMoveInCombat(ctx, state, player, prevTokenRow) {
  if (ctx.role === 'GM') return;
  if (String(state?.phase || '') !== 'combat') return;
  const turnOrder = Array.isArray(state?.turnOrder) ? state.turnOrder : [];
  const currentId = String(turnOrder[Math.max(0, Number(state?.currentTurnIndex) || 0)] || '');
  const notPlacedYet = !prevTokenRow || prevTokenRow.x === null || typeof prevTokenRow.x === 'undefined' || prevTokenRow.y === null || typeof prevTokenRow.y === 'undefined';
  if (String(player?.id || '') !== currentId && !notPlacedYet) {
    throw new Error('Only the current combatant can move during combat');
  }
}

function sanitizeTokenSize(value, fallback = 1) {
  return Math.max(1, Math.min(5, Math.trunc(Number(value) || fallback || 1)));
}

function validateBoardPosition(xRaw, yRaw, size, bounds) {
  const x = Math.trunc(Number(xRaw));
  const y = Math.trunc(Number(yRaw));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('x/y must be numbers');
  const s = sanitizeTokenSize(size);
  if (x < 0 || y < 0 || x > bounds.width - s || y > bounds.height - s) {
    throw new Error('Token position is outside the board');
  }
  return { x, y, size: s };
}

function overlaps(a, b) {
  return !(
    (a.x + a.size) <= b.x
    || (b.x + b.size) <= a.x
    || (a.y + a.size) <= b.y
    || (b.y + b.size) <= a.y
  );
}

async function ensureTokenAreaFree(client, roomId, mapId, tokenId, x, y, size) {
  if (x === null || y === null || typeof x === 'undefined' || typeof y === 'undefined') return;
  const { rows } = await client.query(
    `
      select token_id, x, y, size
      from public.room_tokens
      where room_id = $1
        and map_id = $2
        and token_id <> $3
        and x is not null
        and y is not null
    `,
    [roomId, mapId, tokenId]
  );

  const nextBox = { x: Number(x), y: Number(y), size: sanitizeTokenSize(size) };
  for (const row of rows) {
    const other = {
      x: Number(row.x),
      y: Number(row.y),
      size: sanitizeTokenSize(row.size)
    };
    if (overlaps(nextBox, other)) throw new Error('Cell is occupied');
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function fetchRoomMembers(roomId) {
  const { rows } = await pool.query(
    `
      select user_id, name, role
      from public.room_members
      where room_id = $1
      order by joined_at asc
    `,
    [roomId]
  );
  return rows.map((row) => ({
    id: String(row.user_id || ''),
    userId: String(row.user_id || ''),
    name: String(row.name || ''),
    role: normalizeRole(row.role) || String(row.role || '')
  }));
}

const ROOM_ROW_READS = Object.freeze({
  room_members: {
    select: 'room_id, user_id, name, role, joined_at, last_seen',
    orderBy: 'joined_at',
    defaultLimit: 500,
    maxLimit: 1000
  },
  room_tokens: {
    select: '*',
    mapScoped: true,
    orderBy: 'updated_at',
    defaultLimit: 2000,
    maxLimit: 5000
  },
  room_log: {
    select: 'id, room_id, text, created_at',
    orderBy: 'created_at',
    defaultLimit: 200,
    maxLimit: 500
  },
  room_dice_events: {
    select: '*',
    orderBy: 'created_at',
    orderDir: 'desc',
    defaultLimit: 50,
    maxLimit: 200
  },
  room_map_meta: {
    select: '*',
    orderBy: 'map_id',
    defaultLimit: 500,
    maxLimit: 1000
  },
  room_walls: {
    select: '*',
    mapScoped: true,
    orderBy: 'map_id, x, y, dir',
    defaultLimit: 5000,
    maxLimit: 10000
  },
  room_marks: {
    select: '*',
    mapScoped: true,
    orderBy: 'updated_at',
    defaultLimit: 2000,
    maxLimit: 5000
  },
  room_fog: {
    select: '*',
    mapScoped: true,
    orderBy: 'map_id',
    defaultLimit: 500,
    maxLimit: 1000
  },
  room_music_state: {
    select: '*',
    maybeSingle: true,
    defaultLimit: 1,
    maxLimit: 1
  }
});

function normalizeReadLimit(value, config) {
  const fallback = Math.max(1, Number(config?.defaultLimit) || 500);
  const max = Math.max(1, Number(config?.maxLimit) || fallback);
  const raw = Math.trunc(Number(value));
  if (!Number.isFinite(raw) || raw <= 0) return Math.min(fallback, max);
  return Math.max(1, Math.min(max, raw));
}

async function fetchWhitelistedRoomRows(ctx, tableNameRaw, query = {}) {
  const tableName = String(tableNameRaw || '').trim().toLowerCase();
  const config = ROOM_ROW_READS[tableName];
  if (!config) throw makeHttpError('Room table is not available through this endpoint', 404);

  const values = [ctx.roomId];
  let sql = `select ${config.select} from public.${tableName} where room_id = $1`;

  const mapId = normalizeSafeId(query?.mapId || query?.map_id || '', ENTITY_ID_RE);
  if (config.mapScoped && mapId) {
    values.push(mapId);
    sql += ` and map_id = $${values.length}`;
  }

  if (config.orderBy) {
    const direction = String(config.orderDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    sql += ` order by ${config.orderBy} ${direction}`;
  }

  values.push(normalizeReadLimit(query?.limit, config));
  sql += ` limit $${values.length}`;

  const { rows } = await pool.query(sql, values);
  return {
    rows,
    row: config.maybeSingle ? (rows[0] || null) : undefined
  };
}

function shouldPurgeExpired(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

async function purgeExpiredTavernAnnouncements() {
  await pool.query('delete from public.tavern_announcements where start_at < now()');
}

function cleanTavernAnnouncementPayload(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const startAt = new Date(String(data.start_at || data.startAt || ''));
  const maxPlayers = Math.trunc(Number(data.max_players ?? data.maxPlayers));
  const neededPlayers = Math.trunc(Number(data.needed_players ?? data.neededPlayers));

  const payload = {
    scenario: sanitizeText(data.scenario, '', 160),
    adventure_type: sanitizeText(data.adventure_type || data.adventureType, '', 40),
    level: sanitizeText(data.level, '', 80),
    max_players: maxPlayers,
    needed_players: neededPlayers,
    start_at: startAt,
    contact: sanitizeText(data.contact, '', 160),
    description: sanitizeText(data.description, '', 2000)
  };

  if (!payload.scenario || !payload.adventure_type || !payload.level || !payload.contact) {
    throw makeHttpError('Announcement fields are required', 400);
  }
  if (!Number.isInteger(maxPlayers) || !Number.isInteger(neededPlayers) || maxPlayers < 1 || neededPlayers < 1 || neededPlayers > maxPlayers) {
    throw makeHttpError('Invalid players count', 400);
  }
  if (!Number.isFinite(startAt.getTime())) {
    throw makeHttpError('Invalid start_at', 400);
  }
  const now = Date.now();
  if (startAt.getTime() <= now) {
    throw makeHttpError('start_at must be in the future', 400);
  }
  if ((startAt.getTime() - now) > TAVERN_BOARD_MAX_MS_AHEAD) {
    throw makeHttpError('start_at is too far in the future', 400);
  }

  return {
    ...payload,
    start_at: startAt.toISOString()
  };
}

async function countActiveTavernAnnouncementsByUser(userId, excludeId = '') {
  const params = [userId];
  let sql = `
    select count(*)::int as count
    from public.tavern_announcements
    where author_id = $1
      and start_at > now()
  `;
  if (excludeId) {
    params.push(excludeId);
    sql += ` and id::text <> $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

async function listTavernAnnouncements({ purgeExpired = false } = {}) {
  if (purgeExpired) await purgeExpiredTavernAnnouncements().catch(() => {});
  const { rows } = await pool.query(
    `
      select id, author_id, author_name, scenario, adventure_type, level,
             max_players, needed_players, start_at, contact, description,
             created_at, updated_at
      from public.tavern_announcements
      where start_at > now()
      order by start_at asc
      limit 200
    `
  );
  return rows;
}

function normalizeTavernAnnouncementId(value) {
  const id = String(value || '').trim();
  if (!/^[0-9a-fA-F-]{20,80}$/.test(id)) throw makeHttpError('Invalid announcement id', 400);
  return id;
}

function normalizeTavernChatText(value) {
  const text = String(value || '').trim();
  if (!text || !text.startsWith(TAVERN_LOG_PREFIX)) {
    throw makeHttpError('Invalid tavern chat payload', 400);
  }
  if (text.length > 12000) throw makeHttpError('Tavern chat payload is too long', 400);
  return text;
}

function normalizeCampaignOwnerKey(value) {
  const ownerKey = normalizeSafeId(value, ENTITY_ID_RE);
  if (!ownerKey) throw makeHttpError('campaign owner key required', 400);
  return ownerKey;
}

function normalizeCampaignSaveId(value) {
  const id = normalizeSafeId(value, ENTITY_ID_RE);
  if (!id) throw makeHttpError('campaign save id required', 400);
  return id;
}

function cleanDetachedTokenRow(ctx, raw, playerById = new Map()) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const mapId = normalizeSafeId(row.map_id || row.mapId, ENTITY_ID_RE);
  const tokenId = normalizeSafeId(row.token_id || row.tokenId || row.id, ENTITY_ID_RE);
  if (!mapId || !tokenId) throw new Error('Invalid token row');
  const player = playerById.get(tokenId) || {};
  const rawX = row.x;
  const rawY = row.y;
  const x = rawX === null || typeof rawX === 'undefined' ? null : Math.trunc(Number(rawX));
  const y = rawY === null || typeof rawY === 'undefined' ? null : Math.trunc(Number(rawY));
  if (x !== null && !Number.isFinite(x)) throw new Error('Invalid token x');
  if (y !== null && !Number.isFinite(y)) throw new Error('Invalid token y');
  const color = String(row.color || player.color || '').trim();
  return {
    roomId: ctx.roomId,
    mapId,
    tokenId,
    ownerId: normalizeSafeId(row.owner_id || row.ownerId || player.ownerId || '', USER_ID_RE) || null,
    x,
    y,
    size: sanitizeTokenSize(row.size || player.size || 1),
    color: HEX_COLOR_RE.test(color) ? color : null,
    isPublic: boolFrom(row.is_public ?? row.isPublic ?? player.isPublic, true)
  };
}

function dedupeRowsBy(rows, keyFn) {
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(keyFn(row) || '').trim();
    if (key) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

async function bulkInsertRoomMapMeta(client, rowsIn) {
  if (!rowsIn.length) return [];
  const { rows } = await client.query(
    `
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as r(
          room_id text,
          map_id text,
          name text,
          section_id text,
          board_width integer,
          board_height integer,
          board_bg_url text,
          board_bg_storage_path text,
          board_bg_storage_bucket text,
          grid_alpha double precision,
          wall_alpha double precision
        )
      )
      insert into public.room_map_meta (
        room_id, map_id, name, section_id, board_width, board_height,
        board_bg_url, board_bg_storage_path, board_bg_storage_bucket,
        grid_alpha, wall_alpha, updated_at
      )
      select
        room_id, map_id, name, section_id, board_width, board_height,
        board_bg_url, board_bg_storage_path, board_bg_storage_bucket,
        grid_alpha, wall_alpha, now()
      from input
      on conflict (room_id, map_id)
      do update set
        name = excluded.name,
        section_id = excluded.section_id,
        board_width = excluded.board_width,
        board_height = excluded.board_height,
        board_bg_url = excluded.board_bg_url,
        board_bg_storage_path = excluded.board_bg_storage_path,
        board_bg_storage_bucket = excluded.board_bg_storage_bucket,
        grid_alpha = excluded.grid_alpha,
        wall_alpha = excluded.wall_alpha,
        updated_at = now()
      returning *
    `,
    [JSON.stringify(rowsIn)]
  );
  return rows;
}

async function bulkInsertRoomWalls(client, rowsIn) {
  if (!rowsIn.length) return [];
  const { rows } = await client.query(
    `
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as r(
          room_id text,
          map_id text,
          x integer,
          y integer,
          dir text,
          wall_type text,
          thickness integer
        )
      )
      insert into public.room_walls(room_id, map_id, x, y, dir, wall_type, thickness, updated_at)
      select room_id, map_id, x, y, dir, wall_type, thickness, now()
      from input
      on conflict (room_id, map_id, x, y, dir)
      do update set wall_type = excluded.wall_type, thickness = excluded.thickness, updated_at = now()
      returning *
    `,
    [JSON.stringify(rowsIn)]
  );
  return rows;
}

async function bulkInsertRoomMarks(client, rowsIn) {
  if (!rowsIn.length) return [];
  const { rows } = await client.query(
    `
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as r(
          room_id text,
          map_id text,
          mark_id text,
          owner_id text,
          kind text,
          payload jsonb
        )
      )
      insert into public.room_marks(room_id, map_id, mark_id, owner_id, kind, payload, updated_at)
      select room_id, map_id, mark_id, owner_id, kind, payload, now()
      from input
      on conflict (room_id, map_id, mark_id)
      do update set owner_id = excluded.owner_id, kind = excluded.kind, payload = excluded.payload, updated_at = now()
      returning *
    `,
    [JSON.stringify(rowsIn)]
  );
  return rows;
}

async function bulkInsertRoomFog(client, rowsIn) {
  if (!rowsIn.length) return [];
  const { rows } = await client.query(
    `
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as r(
          room_id text,
          map_id text,
          settings jsonb,
          manual_stamps jsonb,
          explored_packed text
        )
      )
      insert into public.room_fog(room_id, map_id, settings, manual_stamps, explored_packed, updated_at)
      select room_id, map_id, settings, manual_stamps, explored_packed, now()
      from input
      on conflict (room_id, map_id)
      do update set settings = excluded.settings, manual_stamps = excluded.manual_stamps,
                    explored_packed = excluded.explored_packed, updated_at = now()
      returning *
    `,
    [JSON.stringify(rowsIn)]
  );
  return rows;
}

async function bulkInsertRoomTokens(client, rowsIn) {
  if (!rowsIn.length) return [];
  const { rows } = await client.query(
    `
      with input as (
        select *
        from jsonb_to_recordset($1::jsonb) as r(
          room_id text,
          map_id text,
          token_id text,
          owner_id text,
          x integer,
          y integer,
          size integer,
          color text,
          is_public boolean
        )
      )
      insert into public.room_tokens (
        room_id, map_id, token_id, owner_id, x, y, size, color, is_public, updated_at
      )
      select room_id, map_id, token_id, owner_id, x, y, size, color, is_public, now()
      from input
      on conflict (room_id, map_id, token_id)
      do update set
        owner_id   = coalesce(excluded.owner_id, public.room_tokens.owner_id),
        x          = excluded.x,
        y          = excluded.y,
        size       = excluded.size,
        color      = excluded.color,
        is_public  = excluded.is_public,
        updated_at = now()
      returning room_id, map_id, token_id, owner_id, x, y, size, color, is_public, updated_at
    `,
    [JSON.stringify(rowsIn)]
  );
  return rows;
}

async function replaceRoomDetachedData(ctx, detachedRaw, stateRaw) {
  ensureGm(ctx);
  const detached = detachedRaw && typeof detachedRaw === 'object' ? detachedRaw : {};
  const state = stateRaw && typeof stateRaw === 'object' ? stateRaw : {};
  const maps = Array.isArray(state.maps) ? state.maps : [];
  const mapIds = new Set(maps.map((map) => String(map?.id || '').trim()).filter(Boolean));
  const hasMapFilter = mapIds.size > 0;
  const inLoadedCampaign = (row) => !hasMapFilter || mapIds.has(String(row?.map_id || row?.mapId || '').trim());
  const players = Array.isArray(state.players) ? state.players : [];
  const playerById = new Map(players.map((player) => [String(player?.id || '').trim(), player]).filter(([id]) => !!id));

  const mapMetaIn = (Array.isArray(detached.roomMapMeta) ? detached.roomMapMeta : [])
    .filter(inLoadedCampaign)
    .slice(0, 500);
  const wallsIn = (Array.isArray(detached.roomWalls) ? detached.roomWalls : [])
    .filter(inLoadedCampaign)
    .slice(0, 10000);
  const marksIn = (Array.isArray(detached.roomMarks) ? detached.roomMarks : [])
    .filter(inLoadedCampaign)
    .slice(0, 5000);
  const fogIn = (Array.isArray(detached.roomFog) ? detached.roomFog : [])
    .filter(inLoadedCampaign)
    .slice(0, 500);
  const tokensIn = (Array.isArray(detached.roomTokens) ? detached.roomTokens : [])
    .filter(inLoadedCampaign)
    .slice(0, 5000);

  const mapMetaRowsIn = dedupeRowsBy(
    mapMetaIn.map((item) => cleanMapMetaRow(ctx, item)),
    (row) => row.map_id
  );
  const wallRowsIn = dedupeRowsBy(
    wallsIn.map((item) => cleanWallRow(ctx, item)),
    (row) => `${row.map_id}:${row.x}:${row.y}:${row.dir}`
  );
  const markRowsIn = dedupeRowsBy(
    marksIn.map((item) => {
      const raw = (item?.payload || item?.mark || item) || {};
      const mark = normalizeMarkPayload({
        ...raw,
        id: raw?.id || item?.mark_id,
        mapId: raw?.mapId || item?.map_id,
        kind: raw?.kind || item?.kind,
        ownerId: raw?.ownerId || item?.owner_id
      }, ctx, item?.owner_id || raw?.ownerId || '');
      return {
        room_id: ctx.roomId,
        map_id: mark.mapId,
        mark_id: mark.id,
        owner_id: mark.ownerId,
        kind: mark.kind,
        payload: mark
      };
    }),
    (row) => `${row.map_id}:${row.mark_id}`
  );
  const fogRowsIn = dedupeRowsBy(
    fogIn.map((item) => cleanFogRow(ctx, item)),
    (row) => row.map_id
  );
  const tokenRowsIn = dedupeRowsBy(
    tokensIn.map((item) => cleanDetachedTokenRow(ctx, item, playerById)),
    (row) => `${row.mapId}:${row.tokenId}`
  ).map((row) => ({
    room_id: row.roomId,
    map_id: row.mapId,
    token_id: row.tokenId,
    owner_id: row.ownerId,
    x: row.x,
    y: row.y,
    size: row.size,
    color: row.color,
    is_public: row.isPublic
  }));

  return withTransaction(async (client) => {
    await client.query('delete from public.room_map_meta where room_id = $1', [ctx.roomId]);
    await client.query('delete from public.room_walls where room_id = $1', [ctx.roomId]);
    await client.query('delete from public.room_marks where room_id = $1', [ctx.roomId]);
    await client.query('delete from public.room_fog where room_id = $1', [ctx.roomId]);
    await client.query('delete from public.room_tokens where room_id = $1', [ctx.roomId]);

    const roomMapMeta = await bulkInsertRoomMapMeta(client, mapMetaRowsIn);
    const roomWalls = await bulkInsertRoomWalls(client, wallRowsIn);
    const roomMarks = await bulkInsertRoomMarks(client, markRowsIn);
    const roomFog = await bulkInsertRoomFog(client, fogRowsIn);
    const roomTokens = await bulkInsertRoomTokens(client, tokenRowsIn);

    return { roomMapMeta, roomWalls, roomMarks, roomFog, roomTokens };
  });
}

async function broadcastUsersSnapshot(roomId) {
  const users = await fetchRoomMembers(roomId);
  broadcastToRoom(roomId, { type: 'users', roomId, users });
}

async function requireHttpRoomContext(req) {
  const roomId = getRequestValue(req, 'roomId', 'room_id');
  const actor = requireRequestActor(req);
  return loadRoomContext(roomId, actor.userId);
}

function httpError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function assertObjectKeyUnderRoomPrefix(objectKey, prefix, roomId) {
  const key = String(objectKey || '').replace(/^\/+/, '');
  const expectedPrefix = `${String(prefix || '').replace(/^\/+|\/+$/g, '')}/${sanitizeRoomId(roomId)}/`;
  if (!key || !key.startsWith(expectedPrefix)) {
    throw new Error('Object key does not belong to this room');
  }
  return key;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function sanitizeText(value, fallback, maxLength = 200) {
  const text = String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
  return text || fallback;
}

function normalizePassword(value) {
  return String(value || '').trim().slice(0, 256);
}

function hashRoomPassword(passwordRaw) {
  const password = normalizePassword(passwordRaw);
  if (!password) return null;
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(password, salt, 32).toString('base64');
  return `scrypt:v1:${salt}:${hash}`;
}

function verifyRoomPassword(passwordRaw, storedHashRaw) {
  const password = normalizePassword(passwordRaw);
  const storedHash = String(storedHashRaw || '').trim();
  if (!password || !storedHash) return false;

  // Legacy rooms used plain SHA-256. Keep verification so old rooms still work.
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    return safeEqualText(sha256Hex(password), storedHash);
  }

  const [algorithm, version, salt, expectedHash] = storedHash.split(':');
  if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !expectedHash) return false;

  try {
    const expected = Buffer.from(expectedHash, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createServerInitialState() {
  const mapId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  return {
    phase: 'lobby',
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    round: 1,
    boardWidth: 10,
    boardHeight: 10,
    currentMapId: mapId,
    mapSections: [{ id: sectionId, name: 'Основной раздел' }],
    maps: [{
      id: mapId,
      name: 'Карта',
      sectionId,
      boardWidth: 10,
      boardHeight: 10,
      boardBgDataUrl: null,
      boardBgUrl: null,
      boardBgStoragePath: null,
      boardBgStorageBucket: null,
      gridAlpha: 1,
      wallAlpha: 1,
      walls: [],
      marks: [],
      fog: {
        enabled: false,
        mode: 'manual',
        manualBase: 'hide',
        manualStamps: [],
        visionRadius: 8,
        useWalls: true,
        exploredEnabled: true,
        gmViewMode: 'gm',
        gmOpen: false,
        moveOnlyExplored: false,
        explored: []
      },
      playersPos: {}
    }],
    roomAccess: {
      hasPassword: false,
      passwordDisplay: '',
      authorizedUsers: {},
      bannedUsers: {}
    },
    roomMeta: {
      ownerId: '',
      ownerName: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

function prepareRoomStateForStorage(rawState, {
  ownerId,
  ownerName,
  hasPassword,
  passwordDisplay = '',
  existingMeta = null,
  sanitizeRuntime = true,
  preserveRoomAccessRuntime = false
} = {}) {
  const state = (rawState && typeof rawState === 'object') ? cloneJson(rawState) : createServerInitialState();
  if (!state || typeof state !== 'object') return createServerInitialState();
  if (!Array.isArray(state.players)) state.players = [];
  if (!Array.isArray(state.turnOrder)) state.turnOrder = [];
  if (!Array.isArray(state.maps) || !state.maps.length) {
    const fallback = createServerInitialState();
    state.maps = fallback.maps;
    state.mapSections = fallback.mapSections;
    state.currentMapId = fallback.currentMapId;
  }
  if (!state.currentMapId) state.currentMapId = String(state.maps?.[0]?.id || crypto.randomUUID());
  if (!Array.isArray(state.mapSections)) state.mapSections = [];
  if (sanitizeRuntime) {
    state.log = [];
    state.players.forEach((player) => {
      if (!player || typeof player !== 'object') return;
      player.x = null;
      player.y = null;
    });
  }
  const prevAccess = state.roomAccess && typeof state.roomAccess === 'object' ? state.roomAccess : {};
  state.roomAccess = {
    hasPassword: !!hasPassword,
    passwordDisplay: hasPassword ? normalizePassword(passwordDisplay) : '',
    authorizedUsers: {},
    bannedUsers: (preserveRoomAccessRuntime && prevAccess.bannedUsers && typeof prevAccess.bannedUsers === 'object')
      ? prevAccess.bannedUsers
      : {}
  };
  if (preserveRoomAccessRuntime && prevAccess.moderationEvent && typeof prevAccess.moderationEvent === 'object') {
    state.roomAccess.moderationEvent = prevAccess.moderationEvent;
  }
  const now = new Date().toISOString();
  const prevMeta = existingMeta && typeof existingMeta === 'object' ? existingMeta : state.roomMeta || {};
  state.roomMeta = {
    ownerId: String(ownerId || prevMeta.ownerId || '').trim(),
    ownerName: String(ownerName || prevMeta.ownerName || '').trim(),
    createdAt: String(prevMeta.createdAt || now),
    updatedAt: now
  };
  return state;
}

function publicRoomFromRows(roomRow, stateRow, uniqueUsers = 0, viewerUserId = '') {
  const state = stateRow?.state || roomRow?.state || {};
  const meta = getStateRoomMeta(state);
  const ownerId = String(roomRow?.owner_id || roomRow?.ownerId || meta.ownerId || '').trim();
  const ownerName = String(roomRow?.owner_name || roomRow?.ownerName || meta.ownerName || '').trim();
  const gmUserId = String(roomRow?.gm_user_id || roomRow?.gmUserId || '').trim();
  const hasGM = !!(roomRow?.has_gm ?? roomRow?.hasGM ?? gmUserId);
  return {
    id: String(roomRow?.id || stateRow?.room_id || ''),
    name: String(roomRow?.name || ''),
    scenario: String(roomRow?.scenario || ''),
    created_at: roomRow?.created_at || null,
    hasPassword: !!(roomRow?.has_password || roomRow?.password_hash),
    has_password: !!(roomRow?.has_password || roomRow?.password_hash),
    hasGM,
    has_gm: hasGM,
    isMyGMSeat: !!viewerUserId && !!gmUserId && gmUserId === viewerUserId,
    uniqueUsers: Number(uniqueUsers) || 0,
    ownerId,
    ownerName,
    isMine: !!viewerUserId && ownerId === viewerUserId
  };
}

async function listRoomsForUser(userIdRaw = '') {
  const viewerUserId = normalizeSafeId(userIdRaw, USER_ID_RE);
  const { rows } = await pool.query(`
    with member_stats as (
      select
        room_id,
        count(distinct user_id)::int as unique_users,
        coalesce(bool_or(role = 'GM'), false) as has_gm,
        min(user_id) filter (where role = 'GM') as gm_user_id
      from public.room_members
      group by room_id
    )
    select
      r.id,
      r.name,
      r.scenario,
      r.created_at,
      r.has_password,
      r.password_hash,
      s.state #>> '{roomMeta,ownerId}' as owner_id,
      s.state #>> '{roomMeta,ownerName}' as owner_name,
      coalesce(ms.unique_users, 0) as unique_users,
      coalesce(ms.has_gm, false) as has_gm,
      coalesce(ms.gm_user_id, '') as gm_user_id
    from public.rooms r
    left join public.room_state s on s.room_id = r.id
    left join member_stats ms on ms.room_id = r.id
    order by r.created_at desc
  `);
  return rows.map((row) => publicRoomFromRows(row, row, Number(row.unique_users) || 0, viewerUserId));
}

async function findOwnedRoomByUserIdServer(userId, excludeRoomId = '', db = pool) {
  const ownerId = normalizeSafeId(userId, USER_ID_RE);
  const excluded = normalizeSafeId(excludeRoomId, ROOM_ID_RE);
  if (!ownerId) return null;
  const params = excluded ? [ownerId, excluded] : [ownerId];
  const { rows } = await db.query(
    `
      select
        room_id,
        state #>> '{roomMeta,ownerId}' as owner_id,
        state #>> '{roomMeta,ownerName}' as owner_name
      from public.room_state
      where state #>> '{roomMeta,ownerId}' = $1
      ${excluded ? 'and room_id <> $2' : ''}
      limit 1
    `,
    params
  );
  const row = rows[0];
  if (!row) return null;
  return {
    roomId: String(row.room_id || ''),
    meta: {
      ownerId: String(row.owner_id || ''),
      ownerName: String(row.owner_name || '')
    }
  };
}

async function requireRoomOwner(roomIdRaw, userIdRaw) {
  const roomId = normalizeSafeId(roomIdRaw, ROOM_ID_RE);
  const userId = normalizeSafeId(userIdRaw, USER_ID_RE);
  if (!roomId || !userId) throw new Error('roomId/userId required');
  const row = await fetchRoomStateRow(roomId);
  if (!row) throw new Error('Room not found');
  const meta = getStateRoomMeta(row.state || {});
  if (!meta.ownerId || meta.ownerId !== userId) throw new Error('Only room owner can do this');
  return { roomId, userId, row, meta };
}

async function deleteRoomCascadeServer(roomId, client = pool) {
  const tables = [
    'room_members',
    'room_log',
    'room_dice_events',
    'room_tokens',
    'room_map_meta',
    'room_walls',
    'room_marks',
    'room_fog',
    'room_music_state',
    'room_bans'
  ];
  for (const table of tables) {
    await client.query(`delete from public.${table} where room_id = $1`, [roomId]);
  }
  await client.query('delete from public.room_state where room_id = $1', [roomId]);
  await client.query('delete from public.rooms where id = $1', [roomId]);
  forgetRoomStateCache(roomId);
}

function removeUserOwnedPlayersFromState(state, targetUserId) {
  const next = cloneJson(state || {}) || {};
  const removedIds = [];
  const uid = String(targetUserId || '').trim();
  if (!uid || !Array.isArray(next.players)) return { state: next, removedIds };
  next.players = next.players.filter((player) => {
    const owned = String(player?.ownerId || '') === uid;
    if (owned && player?.id) removedIds.push(String(player.id));
    return !owned;
  });
  if (Array.isArray(next.turnOrder) && removedIds.length) {
    const removed = new Set(removedIds);
    next.turnOrder = next.turnOrder.filter((id) => !removed.has(String(id)));
    if (removed.has(String(next.current_actor_id || ''))) next.current_actor_id = null;
  }
  return { state: next, removedIds };
}

async function broadcastRoomStateSnapshot(roomId, exceptWs = null) {
  const row = await fetchRoomStateRow(roomId);
  if (!row) return null;
  const payload = makeStatePayload(roomId, row.state || {}, row.updated_at);
  broadcastToRoom(roomId, payload, exceptWs);
  return payload;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/session', (req, res) => {
  try {
    const actor = getOptionalRequestActor(req);
    let userId = actor?.userId || '';
    if (!userId && ALLOW_LEGACY_USER_ID_BOOTSTRAP) {
      userId = normalizeSafeId(req.body?.legacyUserId || req.body?.userId || req.body?.user_id, USER_ID_RE);
    }
    if (!userId) userId = crypto.randomUUID();
    const session = createAuthSession(userId);
    const userName = sanitizeText(req.body?.userName || req.body?.user_name || req.body?.name, '', 120);
    return res.json({
      ok: true,
      userId: session.userId,
      token: session.token,
      expiresAt: session.expiresAt,
      userName
    });
  } catch (error) {
    console.error('[session] failed:', error);
    return res.status(statusFromError(error)).json({ ok: false, error: error?.message || 'Session failed' });
  }
});

app.get('/api/tavern/announcements', async (req, res) => {
  try {
    const announcements = await listTavernAnnouncements({
      purgeExpired: shouldPurgeExpired(req.query?.purgeExpired || req.query?.purge_expired)
    });
    return res.json({ ok: true, announcements });
  } catch (error) {
    console.error('[tavern announcements list] failed:', error);
    return res.status(statusFromError(error, /required|invalid/i, 500)).json({ ok: false, error: error?.message || 'Announcements list failed' });
  }
});

app.post('/api/tavern/announcements', async (req, res) => {
  try {
    const actor = requireRequestActor(req);
    const activeCount = await countActiveTavernAnnouncementsByUser(actor.userId);
    if (activeCount >= TAVERN_BOARD_MAX_PER_USER) {
      return httpError(res, 409, 'Active announcement limit reached');
    }
    const payload = cleanTavernAnnouncementPayload(req.body);
    const authorName = sanitizeText(req.body?.author_name || req.body?.authorName || req.body?.userName, 'Player', 120);
    const { rows } = await pool.query(
      `
        insert into public.tavern_announcements (
          author_id, author_name, scenario, adventure_type, level,
          max_players, needed_players, start_at, contact, description
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning id, author_id, author_name, scenario, adventure_type, level,
                  max_players, needed_players, start_at, contact, description,
                  created_at, updated_at
      `,
      [
        actor.userId,
        authorName,
        payload.scenario,
        payload.adventure_type,
        payload.level,
        payload.max_players,
        payload.needed_players,
        payload.start_at,
        payload.contact,
        payload.description
      ]
    );
    return res.json({ ok: true, announcement: rows[0] || null });
  } catch (error) {
    console.error('[tavern announcement create] failed:', error);
    return res.status(statusFromError(error, /required|invalid|limit/i, 500)).json({ ok: false, error: error?.message || 'Announcement create failed' });
  }
});

async function updateTavernAnnouncement(req, res) {
  try {
    const actor = requireRequestActor(req);
    const announcementId = normalizeTavernAnnouncementId(req.params.announcementId);
    const activeCount = await countActiveTavernAnnouncementsByUser(actor.userId, announcementId);
    if (activeCount >= TAVERN_BOARD_MAX_PER_USER) {
      return httpError(res, 409, 'Active announcement limit reached');
    }
    const payload = cleanTavernAnnouncementPayload(req.body);
    const { rows } = await pool.query(
      `
        update public.tavern_announcements
        set scenario = $3,
            adventure_type = $4,
            level = $5,
            max_players = $6,
            needed_players = $7,
            start_at = $8,
            contact = $9,
            description = $10,
            updated_at = now()
        where id = $1
          and author_id = $2
        returning id, author_id, author_name, scenario, adventure_type, level,
                  max_players, needed_players, start_at, contact, description,
                  created_at, updated_at
      `,
      [
        announcementId,
        actor.userId,
        payload.scenario,
        payload.adventure_type,
        payload.level,
        payload.max_players,
        payload.needed_players,
        payload.start_at,
        payload.contact,
        payload.description
      ]
    );
    if (!rows[0]) return httpError(res, 404, 'Announcement not found');
    return res.json({ ok: true, announcement: rows[0] });
  } catch (error) {
    console.error('[tavern announcement update] failed:', error);
    return res.status(statusFromError(error, /required|invalid|limit|not found/i, 500)).json({ ok: false, error: error?.message || 'Announcement update failed' });
  }
}

app.patch('/api/tavern/announcements/:announcementId', updateTavernAnnouncement);
app.post('/api/tavern/announcements/:announcementId', updateTavernAnnouncement);

app.delete('/api/tavern/announcements/:announcementId', async (req, res) => {
  try {
    const actor = requireRequestActor(req);
    const announcementId = normalizeTavernAnnouncementId(req.params.announcementId);
    await pool.query(
      'delete from public.tavern_announcements where id = $1 and author_id = $2',
      [announcementId, actor.userId]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[tavern announcement delete] failed:', error);
    return res.status(statusFromError(error, /required|invalid|not found/i, 500)).json({ ok: false, error: error?.message || 'Announcement delete failed' });
  }
});

app.get('/api/tavern/chat', async (req, res) => {
  try {
    requireRequestActor(req);
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(req.query?.limit)) || 300));
    const sinceRaw = String(req.query?.since || '').trim();
    const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw))
      ? new Date(sinceRaw).toISOString()
      : new Date(Date.now() - TAVERN_CHAT_TTL_MS).toISOString();
    const { rows } = await pool.query(
      `
        select id, room_id, text, created_at
        from public.room_log
        where room_id = $1
          and left(text, $2) = $3
          and created_at >= $4
        order by created_at asc
        limit $5
      `,
      [TAVERN_ROOM_LOG_ID, TAVERN_LOG_PREFIX.length, TAVERN_LOG_PREFIX, since, limit]
    );
    return res.json({ ok: true, rows });
  } catch (error) {
    console.error('[tavern chat list] failed:', error);
    return res.status(statusFromError(error, /required|invalid/i, 500)).json({ ok: false, error: error?.message || 'Tavern chat list failed' });
  }
});

app.post('/api/tavern/chat', async (req, res) => {
  try {
    requireRequestActor(req);
    const text = normalizeTavernChatText(req.body?.text);
    const { rows } = await pool.query(
      'insert into public.room_log(room_id, text) values ($1, $2) returning id, room_id, text, created_at',
      [TAVERN_ROOM_LOG_ID, text]
    );
    const row = rows[0] || null;
    if (row) broadcastToRoom(TAVERN_ROOM_LOG_ID, { type: 'tavernLogRow', roomId: TAVERN_ROOM_LOG_ID, row });
    return res.json({ ok: true, row });
  } catch (error) {
    console.error('[tavern chat insert] failed:', error);
    return res.status(statusFromError(error, /required|invalid|too long/i, 500)).json({ ok: false, error: error?.message || 'Tavern chat insert failed' });
  }
});

app.get('/api/campaign-saves', async (req, res) => {
  try {
    requireRequestActor(req);
    const ownerKey = normalizeCampaignOwnerKey(req.query?.ownerKey || req.query?.owner_key);
    const { rows } = await pool.query(
      `
        select id, name, created_at
        from public.campaign_saves
        where owner_key = $1
        order by created_at desc
        limit 50
      `,
      [ownerKey]
    );
    return res.json({ ok: true, saves: rows });
  } catch (error) {
    console.error('[campaign saves list] failed:', error);
    const status = statusFromError(error, /required|invalid|campaign/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Campaign saves list failed' });
  }
});

app.post('/api/campaign-saves', async (req, res) => {
  try {
    requireRequestActor(req);
    const ownerKey = normalizeCampaignOwnerKey(req.body?.ownerKey || req.body?.owner_key);
    const name = sanitizeText(req.body?.name, 'Campaign save', 160);
    const state = req.body?.state;
    if (!state || typeof state !== 'object') return httpError(res, 400, 'campaign state object required');
    const { rows } = await pool.query(
      `
        insert into public.campaign_saves(owner_key, name, state)
        values ($1,$2,$3)
        returning id, name, created_at
      `,
      [ownerKey, name, state]
    );
    return res.json({ ok: true, save: rows[0] || null });
  } catch (error) {
    console.error('[campaign save create] failed:', error);
    const status = statusFromError(error, /required|invalid|campaign|state object/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Campaign save create failed' });
  }
});

app.get('/api/campaign-saves/:saveId', async (req, res) => {
  try {
    requireRequestActor(req);
    const saveId = normalizeCampaignSaveId(req.params.saveId);
    const ownerKey = normalizeCampaignOwnerKey(req.query?.ownerKey || req.query?.owner_key);
    const { rows } = await pool.query(
      `
        select state
        from public.campaign_saves
        where id = $1 and owner_key = $2
        limit 1
      `,
      [saveId, ownerKey]
    );
    if (!rows[0]) return httpError(res, 404, 'Campaign save not found');
    return res.json({ ok: true, state: rows[0].state || null });
  } catch (error) {
    console.error('[campaign save read] failed:', error);
    const status = statusFromError(error, /required|invalid|campaign|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Campaign save read failed' });
  }
});

app.delete('/api/campaign-saves/:saveId', async (req, res) => {
  try {
    requireRequestActor(req);
    const saveId = normalizeCampaignSaveId(req.params.saveId);
    const ownerKey = normalizeCampaignOwnerKey(req.body?.ownerKey || req.body?.owner_key || req.query?.ownerKey || req.query?.owner_key);
    const { rowCount } = await pool.query(
      'delete from public.campaign_saves where id = $1 and owner_key = $2',
      [saveId, ownerKey]
    );
    return res.json({ ok: true, deleted: rowCount > 0 });
  } catch (error) {
    console.error('[campaign save delete] failed:', error);
    const status = statusFromError(error, /required|invalid|campaign/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Campaign save delete failed' });
  }
});

app.post('/api/uploads/room-audio', (req, res) => {
  uploadRoomAudio.fields([
    { name: 'file', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        ok: false,
        error: err?.message || 'Upload failed'
      });
    }

    try {
      const ctx = await requireHttpRoomContext(req);
      ensureGm(ctx);
      const roomId = sanitizeRoomId(getRequestValue(req, 'roomId', 'room_id'));
      const trackId = getRequestValue(req, 'trackId', 'track_id') || crypto.randomUUID();
      const file = resolveUploadedFile(req);

      if (!roomId || roomId !== ctx.roomId) {
        return res.status(400).json({ ok: false, error: 'roomId is required' });
      }

      if (!file || !file.buffer) {
        return res.status(400).json({ ok: false, error: 'file is required' });
      }

      const objectKey = buildS3ObjectKey({
        roomId,
        trackId,
        fileName: file.originalname || 'track'
      });

      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream'
      }));

      const publicUrl = buildPublicS3Url(objectKey);

      return res.json({
        ok: true,
        source: 's3-timeweb',
        roomId,
        trackId,
        url: publicUrl,
        path: objectKey,
        fileName: file.originalname,
        storageKey: objectKey,
        deleteKey: objectKey
      });
    } catch (error) {
      console.error('[room-audio upload] failed:', error);
      const message = error?.message || 'Upload failed';
      const status = statusFromError(error, /required|invalid|not a member|role|banned|not found/i);
      return res.status(status).json({
        ok: false,
        error: message
      });
    }
  });
});

app.delete('/api/uploads/room-audio', async (req, res) => {
  try {
    const ctx = await requireHttpRoomContext(req);
    ensureGm(ctx);
    const deleteKey = getRequestValue(
      req,
      'deleteKey',
      'storageKey',
      'path'
    );

    if (!deleteKey) {
      return res.status(400).json({ ok: false, error: 'deleteKey is required' });
    }
    const safeDeleteKey = assertObjectKeyUnderRoomPrefix(deleteKey, 'room-audio', ctx.roomId);

    await s3.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: safeDeleteKey
    }));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[room-audio delete] failed:', error);
    const message = error?.message || 'Delete failed';
    const status = statusFromError(error, /required|invalid|not a member|role|banned|not found|belong/i);
    return res.status(status).json({
      ok: false,
      error: message
    });
  }
});

app.post('/api/uploads/room-board-bg', (req, res) => {
  uploadRoomBoardBg.fields([
    { name: 'file', maxCount: 1 },
    { name: 'background', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        ok: false,
        error: err?.message || 'Upload failed'
      });
    }

    try {
      const ctx = await requireHttpRoomContext(req);
      ensureGm(ctx);
      const roomId = sanitizeRoomId(getRequestValue(req, 'roomId', 'room_id'));
      const file = resolveUploadedFile(req);

      if (!roomId || roomId !== ctx.roomId) {
        return httpError(res, 400, 'roomId is required');
      }

      if (!file || !file.buffer) {
        return httpError(res, 400, 'file is required');
      }

      const objectKey = `room-board-bg/${roomId}/${crypto.randomUUID()}-${sanitizeTrackFileName(file.originalname || 'board-bg')}`;

      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream'
      }));

      const publicUrl = buildPublicS3Url(objectKey);

      return res.json({
        ok: true,
        source: 's3-timeweb',
        roomId,
        url: publicUrl,
        path: objectKey,
        bucket: 's3-timeweb-board-bg',
        fileName: file.originalname,
        storageKey: objectKey,
        deleteKey: objectKey
      });
    } catch (error) {
      console.error('[room-board-bg upload] failed:', error);
      const message = error?.message || 'Upload failed';
      const status = statusFromError(error, /required|invalid|not a member|role|banned|not found/i);
      return res.status(status).json({ ok: false, error: message });
    }
  });
});

app.delete('/api/uploads/room-board-bg', async (req, res) => {
  try {
    const ctx = await requireHttpRoomContext(req);
    ensureGm(ctx);
    const deleteKey = getRequestValue(req, 'deleteKey', 'storageKey', 'path');
    if (!deleteKey) return httpError(res, 400, 'deleteKey is required');
    const safeDeleteKey = assertObjectKeyUnderRoomPrefix(deleteKey, 'room-board-bg', ctx.roomId);

    await s3.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: safeDeleteKey
    }));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[room-board-bg delete] failed:', error);
    const message = error?.message || 'Delete failed';
    const status = statusFromError(error, /required|invalid|not a member|role|banned|not found|belong/i);
    return res.status(status).json({ ok: false, error: message });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const userId = getOptionalRequestActor(req)?.userId || '';
    const roomsList = await listRoomsForUser(userId);
    const totalUsers = roomsList.reduce((sum, room) => sum + (Number(room.uniqueUsers) || 0), 0);
    return res.json({ ok: true, rooms: roomsList, totalUsers });
  } catch (error) {
    console.error('[rooms list] failed:', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Rooms list failed' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const userName = sanitizeText(req.body?.userName || req.body?.user_name, 'Игрок', 120);

    const roomId = crypto.randomUUID();
    const name = sanitizeText(req.body?.name, 'Комната', 160);
    const scenario = sanitizeText(req.body?.scenario, '', 400);
    const password = normalizePassword(req.body?.password);
    const passwordHash = hashRoomPassword(password);
    const state = prepareRoomStateForStorage(req.body?.state, {
      ownerId: userId,
      ownerName: userName,
      hasPassword: !!password,
      passwordDisplay: password
    });

    await withTransaction(async (client) => {
      await client.query(
        "select pg_advisory_xact_lock(hashtext('d20_room_owner'), hashtext($1))",
        [userId]
      );
      const existing = await findOwnedRoomByUserIdServer(userId, '', client);
      if (existing) throw makeHttpError('User already owns a room', 409);

      await client.query(
        `
          insert into public.rooms(id, name, scenario, has_password, password_hash)
          values ($1,$2,$3,$4,$5)
        `,
        [roomId, name, scenario, !!password, passwordHash]
      );
      await client.query(
        `
          insert into public.room_state(room_id, phase, current_actor_id, state, updated_at)
          values ($1,$2,$3,$4,now())
        `,
        [roomId, String(state.phase || 'lobby'), null, state]
      );
    });

    const row = await fetchRoomStateRow(roomId);
    return res.json({
      ok: true,
      room: publicRoomFromRows(row, row, 0, userId),
      state: stripRoomSecretsFromState(state),
      stateUpdatedAt: normalizeIsoDate(row?.updated_at),
      updatedAt: normalizeIsoDate(row?.updated_at)
    });
  } catch (error) {
    console.error('[rooms create] failed:', error);
    const status = Number(error?.status) || (/already owns/i.test(error?.message || '') ? 409 : 500);
    return res.status(status).json({ ok: false, error: error?.message || 'Room create failed' });
  }
});

app.post('/api/rooms/:roomId/update', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const { roomId, row, meta } = await requireRoomOwner(req.params.roomId, userId);
    const name = sanitizeText(req.body?.name, 'Комната', 160);
    const scenario = sanitizeText(req.body?.scenario, '', 400);
    const password = normalizePassword(req.body?.password);
    const passwordHash = hashRoomPassword(password);
    const nextState = prepareRoomStateForStorage(row.state || {}, {
      ownerId: meta.ownerId,
      ownerName: meta.ownerName,
      hasPassword: !!password,
      passwordDisplay: password,
      existingMeta: meta,
      sanitizeRuntime: false,
      preserveRoomAccessRuntime: true
    });

    let updatedAt = null;
    await withTransaction(async (client) => {
      await client.query(
        `
          update public.rooms
          set name = $1, scenario = $2, has_password = $3, password_hash = $4
          where id = $5
        `,
        [name, scenario, !!password, passwordHash, roomId]
      );
      const stateUpdate = await client.query(
        `
          update public.room_state
          set state = $1, updated_at = now()
          where room_id = $2
          returning updated_at
        `,
        [nextState, roomId]
      );
      updatedAt = stateUpdate.rows?.[0]?.updated_at || null;
    });

    rememberRoomStateValue(roomId, nextState, updatedAt, {
      ...row,
      name,
      scenario,
      has_password: !!password,
      password_hash: passwordHash
    });
    const updated = await fetchRoomStateRow(roomId);
    const roomPayload = publicRoomFromRows(updated, updated, 0, userId);
    const statePayload = makeStatePayload(roomId, updated.state || {}, updated.updated_at);
    broadcastToRoom(roomId, { type: 'roomUpdated', roomId, room: roomPayload });
    broadcastToRoom(roomId, statePayload);
    return res.json({
      ok: true,
      room: roomPayload,
      state: statePayload.state,
      stateUpdatedAt: statePayload.stateUpdatedAt,
      updatedAt: statePayload.updatedAt
    });
  } catch (error) {
    console.error('[rooms update] failed:', error);
    const status = statusFromError(error, /owner|required|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Room update failed' });
  }
});

app.delete('/api/rooms/:roomId', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const { roomId, row } = await requireRoomOwner(req.params.roomId, userId);
    const roomName = String(row?.name || 'Комната');
    broadcastToRoom(roomId, { type: 'roomDeleted', roomId, roomName });
    await withTransaction(async (client) => {
      await deleteRoomCascadeServer(roomId, client);
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[rooms delete] failed:', error);
    const status = statusFromError(error, /owner|required|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Room delete failed' });
  }
});

app.post('/api/rooms/:roomId/join', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    const userName = sanitizeText(req.body?.userName || req.body?.user_name, 'Игрок', 120);
    const role = normalizeRole(req.body?.role);
    if (!roomId || !role) return httpError(res, 400, 'roomId/role required');

    const room = await fetchRoomStateRow(roomId);
    if (!room) return httpError(res, 404, 'Room not found');
    const ban = await fetchActiveRoomBan(roomId, userId);
    if (ban) return httpError(res, 403, 'User is banned in this room');
    const passwordHash = String(room.password_hash || '').trim();
    const hasPassword = !!(room.has_password || passwordHash);
    if (hasPassword) {
      const provided = normalizePassword(req.body?.password);
      if (!verifyRoomPassword(provided, passwordHash)) {
        return httpError(res, 403, 'Invalid room password');
      }
    }

    if (role === 'GM') {
      await withTransaction(async (client) => {
        await client.query(
          "select pg_advisory_xact_lock(hashtext('d20_room_gm'), hashtext($1))",
          [roomId]
        );
        const { rows } = await client.query(
          `
            select user_id
            from public.room_members
            where room_id = $1 and role = 'GM' and user_id <> $2
            limit 1
          `,
          [roomId, userId]
        );
        if (rows.length) throw new Error(GM_ALREADY_IN_ROOM_MESSAGE);
        await client.query(
          `
            insert into public.room_members(room_id, user_id, name, role, last_seen)
            values ($1,$2,$3,$4,now())
            on conflict (room_id, user_id)
            do update set name = excluded.name, role = excluded.role, last_seen = now()
          `,
          [roomId, userId, userName, role]
        );
      });
    } else {
      await pool.query(
        `
          insert into public.room_members(room_id, user_id, name, role, last_seen)
          values ($1,$2,$3,$4,now())
          on conflict (room_id, user_id)
          do update set name = excluded.name, role = excluded.role, last_seen = now()
        `,
        [roomId, userId, userName, role]
      );
    }

    let state = room.state || createServerInitialState();
    if (!room.state || typeof room.state !== 'object') {
      state = prepareRoomStateForStorage(createServerInitialState(), {
        ownerId: userId,
        ownerName: userName,
        hasPassword,
        passwordDisplay: hasPassword ? normalizePassword(req.body?.password) : ''
      });
      await pool.query(
        `
          insert into public.room_state(room_id, phase, current_actor_id, state, updated_at)
          values ($1,$2,null,$3,now())
          on conflict (room_id)
          do update set state = excluded.state, updated_at = now()
        `,
        [roomId, String(state.phase || 'lobby'), state]
      );
      rememberRoomStateValue(roomId, state, new Date().toISOString(), room);
    }

    const members = await fetchRoomMembers(roomId);
    const gmMember = members.find((member) => normalizeRole(member?.role) === 'GM') || null;
    broadcastToRoom(roomId, { type: 'users', roomId, users: members });
    return res.json({
      ok: true,
      room: publicRoomFromRows({
        ...room,
        has_gm: !!gmMember,
        gm_user_id: gmMember?.userId || ''
      }, room, members.length, userId),
      state: stripRoomSecretsFromState(state),
      stateUpdatedAt: normalizeIsoDate(room?.updated_at),
      updatedAt: normalizeIsoDate(room?.updated_at),
      members,
      role
    });
  } catch (error) {
    console.error('[rooms join] failed:', error);
    const rawMessage = String(error?.message || '');
    const isGmAlready = /GM already|uq_one_gm_per_room|ГМ.*(уже|присутств)|уже.*ГМ/i.test(rawMessage) || error?.code === '23505';
    const status = Number(error?.status) || (isGmAlready
      ? 409
      : /required|password|banned|not found/i.test(rawMessage) ? 403 : 500);
    return res.status(status).json({
      ok: false,
      error: isGmAlready ? GM_ALREADY_IN_ROOM_MESSAGE : (rawMessage || 'Room join failed')
    });
  }
});

app.post('/api/rooms/:roomId/touch', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    await touchRoomMember(ctx.roomId, ctx.userId);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[rooms touch] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Touch failed' });
  }
});

app.get('/api/rooms/:roomId/state', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    const row = await fetchRoomStateRow(ctx.roomId);
    return res.json({
      ok: true,
      state: stripRoomSecretsFromState(row?.state || {}),
      stateUpdatedAt: normalizeIsoDate(row?.updated_at),
      updatedAt: row?.updated_at || null
    });
  } catch (error) {
    console.error('[rooms state read] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'State read failed' });
  }
});

app.get('/api/rooms/:roomId/rows/:tableName', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    const payload = await fetchWhitelistedRoomRows(ctx, req.params.tableName, req.query);
    return res.json({ ok: true, table: String(req.params.tableName || ''), ...payload });
  } catch (error) {
    console.error('[rooms rows read] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found|available/i, 500);
    return res.status(status).json({ ok: false, error: error?.message || 'Rows read failed' });
  }
});

app.post('/api/rooms/:roomId/detached/replace', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    ensureGm(ctx);
    const detached = await replaceRoomDetachedData(ctx, req.body?.detached, req.body?.state);
    return res.json({ ok: true, detached });
  } catch (error) {
    console.error('[rooms detached replace] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found|role|invalid/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Detached restore failed' });
  }
});

app.post('/api/rooms/:roomId/state', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    await persistStateForContext(ctx, req.body?.state);
    const row = await fetchRoomStateRow(roomId);
    const payload = makeStatePayload(roomId, row?.state || {}, row?.updated_at);
    broadcastToRoom(roomId, payload);
    return res.json({
      ok: true,
      state: payload.state,
      stateUpdatedAt: payload.stateUpdatedAt,
      updatedAt: payload.updatedAt
    });
  } catch (error) {
    console.error('[rooms state] failed:', error);
    const status = statusFromError(error, /required|role|member|banned|state object/i);
    return res.status(status).json({ ok: false, error: error?.message || 'State update failed' });
  }
});

app.post('/api/rooms/:roomId/log', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    const text = sanitizeText(req.body?.text, '', 1000);
    if (!text) return httpError(res, 400, 'text is required');
    const { rows } = await pool.query(
      'insert into public.room_log(room_id, text) values ($1, $2) returning id, room_id, text, created_at',
      [ctx.roomId, text]
    );
    return res.json({ ok: true, row: rows[0] || null });
  } catch (error) {
    console.error('[rooms log] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Log insert failed' });
  }
});

app.post('/api/rooms/:roomId/dice', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const ctx = await loadRoomContext(roomId, userId);
    const incoming = req.body?.event && typeof req.body.event === 'object' ? req.body.event : {};
    const sidesRaw = Math.trunc(Number(incoming.sides) || 20);
    const sides = Math.max(2, Math.min(100, sidesRaw));
    const count = Math.max(1, Math.min(20, Math.trunc(Number(incoming.count) || 1)));
    const bonus = Math.max(-1000, Math.min(1000, Math.trunc(Number(incoming.bonus) || 0)));
    const incomingRolls = Array.isArray(incoming.rolls)
      ? incoming.rolls.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value))
      : [];
    const canUseIncomingRolls = (
      incomingRolls.length === count
      && incomingRolls.every((value) => value >= 1 && value <= sides)
    );
    const rolls = canUseIncomingRolls
      ? incomingRolls
      : Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const fallbackTotal = rolls.reduce((sum, value) => sum + value, 0) + bonus;
    const incomingTotal = Math.trunc(Number(incoming.total));
    const total = Number.isFinite(incomingTotal)
      ? Math.max(-10000, Math.min(10000, incomingTotal))
      : fallbackTotal;
    const incomingCrit = String(incoming.crit || '').trim();
    const crit = (incomingCrit === 'crit-success' || incomingCrit === 'crit-fail')
      ? incomingCrit
      : '';
    const event = {
      fromId: ctx.userId,
      fromName: ctx.name || sanitizeText(incoming.fromName, 'Player', 120),
      kindText: sanitizeText(incoming.kindText, `d${sides}`, 200),
      sides,
      count,
      bonus,
      rolls,
      total,
      crit
    };
    const { rows } = await pool.query(
      `
        insert into public.room_dice_events(room_id, from_id, from_name, kind_text, sides, count, bonus, rolls, total, crit)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning id, room_id, created_at, from_id, from_name, kind_text, sides, count, bonus, rolls, total, crit
      `,
      [ctx.roomId, event.fromId, event.fromName, event.kindText, event.sides, event.count, event.bonus, event.rolls, event.total, event.crit]
    );
    const logText = `${event.fromName}: ${event.kindText}: ${event.rolls.join(',')}${event.bonus ? (event.bonus > 0 ? `+${event.bonus}` : String(event.bonus)) : ''} = ${event.total}${event.crit === 'crit-success' ? ' (CRIT)' : event.crit === 'crit-fail' ? ' (FAIL)' : ''}`;
    const log = await pool.query(
      'insert into public.room_log(room_id, text) values ($1, $2) returning id, room_id, text, created_at',
      [ctx.roomId, logText]
    ).catch(() => ({ rows: [] }));
    return res.json({ ok: true, event, row: rows[0] || null, logRow: log.rows?.[0] || null });
  } catch (error) {
    console.error('[rooms dice] failed:', error);
    const status = statusFromError(error, /required|member|banned|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Dice insert failed' });
  }
});

app.post('/api/rooms/:roomId/leave', async (req, res) => {
  try {
    const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
    const userId = requireRequestActor(req).userId;
    if (!roomId) return httpError(res, 400, 'roomId required');
    const room = await fetchRoomStateRow(roomId);
    if (!room) return httpError(res, 404, 'Room not found');
    await pool.query('delete from public.room_members where room_id = $1 and user_id = $2', [roomId, userId]);
    await broadcastUsersSnapshot(roomId).catch(() => {});
    return res.json({ ok: true });
  } catch (error) {
    console.error('[rooms leave] failed:', error);
    const status = statusFromError(error, /required|not found/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Leave failed' });
  }
});

async function handleModerationApi(req, res, action) {
  const roomId = normalizeSafeId(req.params.roomId, ROOM_ID_RE);
  const actorUserId = requireRequestActor(req).userId;
  const targetUserId = normalizeSafeId(req.body?.targetUserId || req.body?.target_user_id, USER_ID_RE);
  if (!roomId || !actorUserId || !targetUserId) return httpError(res, 400, 'roomId/actorUserId/targetUserId required');
  if (actorUserId === targetUserId) return httpError(res, 400, 'Cannot moderate yourself');

  const ctx = await loadRoomContext(roomId, actorUserId);
  ensureGm(ctx);
  const room = await fetchRoomStateRow(roomId);
  if (!room) return httpError(res, 404, 'Room not found');

  const reason = sanitizeText(req.body?.reason, '', 500);
  const totalMinutes = action === 'ban'
    ? Math.max(1, Math.min(24 * 60, Math.trunc(Number(req.body?.totalMinutes) || ((Number(req.body?.hours) || 0) * 60 + (Number(req.body?.minutes) || 0)) || 1)))
    : 0;
  const bannedUntil = action === 'ban' ? new Date(Date.now() + totalMinutes * 60 * 1000).toISOString() : null;
  const removed = removeUserOwnedPlayersFromState(room.state || {}, targetUserId);
  const nextState = removed.state;
  if (!nextState.roomAccess || typeof nextState.roomAccess !== 'object') nextState.roomAccess = {};
  const moderationEvent = {
    id: crypto.randomUUID(),
    type: action,
    targetUserId,
    roomId,
    roomName: String(room.name || 'Комната'),
    reason,
    bannedUntil,
    createdAt: new Date().toISOString(),
    actorUserId,
    actorName: ctx.name || ''
  };
  nextState.roomAccess.moderationEvent = moderationEvent;
  if (action === 'ban') {
    if (!nextState.roomAccess.bannedUsers || typeof nextState.roomAccess.bannedUsers !== 'object') nextState.roomAccess.bannedUsers = {};
    nextState.roomAccess.bannedUsers[targetUserId] = {
      reason,
      bannedUntil,
      bannedByUserId: actorUserId,
      bannedByName: ctx.name || '',
      bannedAt: new Date().toISOString()
    };
  }

  let updatedAt = null;
  await withTransaction(async (client) => {
    if (action === 'ban') {
      await client.query(
        `
          insert into public.room_bans(room_id, user_id, reason, banned_until, banned_by_user_id, banned_by_name, created_at)
          values ($1,$2,$3,$4,$5,$6,now())
          on conflict (room_id, user_id)
          do update set reason = excluded.reason,
                        banned_until = excluded.banned_until,
                        banned_by_user_id = excluded.banned_by_user_id,
                        banned_by_name = excluded.banned_by_name,
                        created_at = now()
        `,
        [roomId, targetUserId, reason, bannedUntil, actorUserId, ctx.name || '']
      );
    }
    const stateUpdate = await client.query(
      `
        update public.room_state
        set state = $1,
            current_actor_id = $2,
            updated_at = now()
        where room_id = $3
        returning updated_at
      `,
      [
        nextState,
        Array.isArray(nextState.turnOrder) ? (nextState.turnOrder[Math.max(0, Number(nextState.currentTurnIndex) || 0)] || null) : null,
        roomId
      ]
    );
    updatedAt = stateUpdate.rows?.[0]?.updated_at || null;
    for (const tokenId of removed.removedIds) {
      await client.query('delete from public.room_tokens where room_id = $1 and token_id = $2', [roomId, tokenId]);
    }
    await client.query('delete from public.room_members where room_id = $1 and user_id = $2', [roomId, targetUserId]);
  });

  rememberRoomStateValue(roomId, nextState, updatedAt, room || {});
  const updatedRow = await fetchRoomStateRow(roomId);
  const statePayload = makeStatePayload(roomId, updatedRow?.state || nextState, updatedRow?.updated_at);
  const publicState = statePayload.state;
  broadcastToRoom(roomId, { type: 'moderationEvent', roomId, event: moderationEvent });
  broadcastToRoom(roomId, statePayload);
  for (const tokenId of removed.removedIds) {
    broadcastToRoom(roomId, { type: 'tokenRowDeleted', roomId, row: { room_id: roomId, token_id: tokenId } });
  }
  await broadcastUsersSnapshot(roomId).catch(() => {});
  return res.json({
    ok: true,
    state: publicState,
    stateUpdatedAt: statePayload.stateUpdatedAt,
    updatedAt: statePayload.updatedAt,
    moderationEvent,
    removedTokenIds: removed.removedIds
  });
}

app.post('/api/rooms/:roomId/kick', async (req, res) => {
  try {
    return await handleModerationApi(req, res, 'kick');
  } catch (error) {
    console.error('[rooms kick] failed:', error);
    const status = statusFromError(error, /required|role|member|banned|yourself/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Kick failed' });
  }
});

app.post('/api/rooms/:roomId/ban', async (req, res) => {
  try {
    return await handleModerationApi(req, res, 'ban');
  } catch (error) {
    console.error('[rooms ban] failed:', error);
    const status = statusFromError(error, /required|role|member|banned|yourself/i);
    return res.status(status).json({ ok: false, error: error?.message || 'Ban failed' });
  }
});

app.get('/api/characters', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const { rows } = await pool.query(
      `
        select id, name, updated_at
        from public.characters
        where user_id = $1
        order by updated_at desc
      `,
      [userId]
    );
    return res.json({
      ok: true,
      list: rows.map((row) => ({
        id: String(row.id || ''),
        name: String(row.name || ''),
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error('[characters list] failed:', error);
    return res.status(statusFromError(error)).json({ ok: false, error: error?.message || 'Characters list failed' });
  }
});

app.post('/api/characters/migrate-legacy', async (req, res) => {
  try {
    if (!ALLOW_LEGACY_CHARACTER_MIGRATION) return httpError(res, 403, 'Legacy character migration is disabled');
    const userId = requireRequestActor(req).userId;
    const legacyUserId = normalizeSafeId(req.body?.legacyUserId || req.body?.legacy_user_id, USER_ID_RE);
    if (!legacyUserId) return httpError(res, 400, 'legacyUserId is required');
    if (legacyUserId === userId) return res.json({ ok: true, migrated: 0 });
    const { rowCount } = await pool.query(
      `
        update public.characters
        set user_id = $1,
            updated_at = now()
        where user_id = $2
      `,
      [userId, legacyUserId]
    );
    return res.json({ ok: true, migrated: Number(rowCount) || 0 });
  } catch (error) {
    console.error('[characters migrate legacy] failed:', error);
    return res.status(statusFromError(error, /required|invalid|disabled/i)).json({ ok: false, error: error?.message || 'Character migration failed' });
  }
});

app.post('/api/characters', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const name = sanitizeText(req.body?.name, 'Character', 160);
    const state = req.body?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return httpError(res, 400, 'state object is required');
    const { rows } = await pool.query(
      `
        insert into public.characters(user_id, name, state, updated_at)
        values ($1,$2,$3,now())
        returning id, name, updated_at
      `,
      [userId, name, state]
    );
    const row = rows[0] || {};
    return res.json({
      ok: true,
      character: {
        id: String(row.id || ''),
        name: String(row.name || ''),
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error('[characters create] failed:', error);
    return res.status(statusFromError(error, /required|invalid|state object/i)).json({ ok: false, error: error?.message || 'Character save failed' });
  }
});

app.get('/api/characters/:characterId', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const characterId = normalizeSafeId(req.params.characterId, ENTITY_ID_RE);
    if (!characterId) return httpError(res, 400, 'characterId is required');
    const { rows } = await pool.query(
      `
        select id, name, state, updated_at
        from public.characters
        where id = $1 and user_id = $2
        limit 1
      `,
      [characterId, userId]
    );
    if (!rows.length) return httpError(res, 404, 'Character not found');
    const row = rows[0];
    return res.json({
      ok: true,
      character: {
        id: String(row.id || ''),
        name: String(row.name || ''),
        state: row.state || null,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error('[characters get] failed:', error);
    return res.status(statusFromError(error, /required|invalid|not found/i)).json({ ok: false, error: error?.message || 'Character load failed' });
  }
});

app.delete('/api/characters/:characterId', async (req, res) => {
  try {
    const userId = requireRequestActor(req).userId;
    const characterId = normalizeSafeId(req.params.characterId, ENTITY_ID_RE);
    if (!characterId) return httpError(res, 400, 'characterId is required');
    await pool.query(
      'delete from public.characters where id = $1 and user_id = $2',
      [characterId, userId]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[characters delete] failed:', error);
    return res.status(statusFromError(error, /required|invalid|not found/i)).json({ ok: false, error: error?.message || 'Character delete failed' });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log(`HTTP + WebSocket server starting on port ${PORT}`);

// roomId -> Set<ws>
const rooms = new Map();
const roomEventSeq = new Map();
const WS_CONTROL_EVENT_TYPES = new Set([
  'error',
  'ping',
  'pong',
  'wsReady',
  'joinedWsRoom'
]);

function getRoom(roomId) {
  const id = String(roomId || '').trim();
  if (!id) return null;
  if (!rooms.has(id)) rooms.set(id, new Set());
  return rooms.get(id);
}

function nextRoomEventSeq(roomId) {
  const id = String(roomId || '').trim();
  if (!id) return 0;
  const next = (Number(roomEventSeq.get(id)) || 0) + 1;
  roomEventSeq.set(id, next);
  return next;
}

function stampRoomEvent(payload, fallbackRoomId = '') {
  if (!payload || typeof payload !== 'object') return payload;
  const type = String(payload.type || '').trim();
  if (!type || WS_CONTROL_EVENT_TYPES.has(type)) return payload;
  const roomId = String(payload.roomId || fallbackRoomId || '').trim();
  if (!roomId) return payload;
  payload.roomId = roomId;
  if (!Number.isFinite(Number(payload.__eventSeq)) || Number(payload.__eventSeq) <= 0) {
    payload.__eventSeq = nextRoomEventSeq(roomId);
  }
  payload.__serverEvent = true;
  payload.__serverTs = Date.now();
  return payload;
}

function send(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const meta = ws.currentInboundMeta || null;
    if (meta && payload && typeof payload === 'object') {
      if (meta.wsNonce && !payload.__replyToWsNonce) payload.__replyToWsNonce = meta.wsNonce;
      if (meta.clientSentAt && !payload.__clientSentAt) payload.__clientSentAt = meta.clientSentAt;
      if (meta.serverReceivedAt && !payload.__serverReceivedAt) payload.__serverReceivedAt = meta.serverReceivedAt;
      if (meta.inboundType && !payload.__inReplyToType) payload.__inReplyToType = meta.inboundType;
    }
  } catch {}
  stampRoomEvent(payload, ws.currentRoomId || '');
  ws.send(JSON.stringify(payload));
}

function invalidateRoomContexts(roomId) {
  const room = rooms.get(String(roomId || ''));
  if (!room) return;
  for (const client of room) {
    try {
      if (client?.roomContext?.roomId === String(roomId || '')) client.roomContext = null;
    } catch {}
  }
}

function broadcastToRoom(roomId, payload, exceptWs = null) {
  const room = rooms.get(String(roomId || ''));
  if (!room) return;
  stampRoomEvent(payload, roomId);
  if (payload?.type === 'state') invalidateRoomContexts(roomId);
  const raw = JSON.stringify(payload);

  for (const client of room) {
    if (client === exceptWs) continue;
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  }
}

function broadcastTokenMoveRollback(roomId, mapId, tokenId, prevRow, exceptWs = null) {
  const rid = String(roomId || '').trim();
  const mid = String(mapId || prevRow?.map_id || '').trim();
  const tid = String(tokenId || prevRow?.token_id || '').trim();
  if (!rid || !tid) return;

  if (prevRow) {
    const row = {
      ...prevRow,
      room_id: String(prevRow.room_id || rid),
      map_id: String(prevRow.map_id || mid),
      token_id: String(prevRow.token_id || tid),
      updated_at: new Date().toISOString()
    };
    const payload = { type: 'tokenRow', roomId: rid, mapId: row.map_id, row, rollback: true };
    send(exceptWs, payload);
    broadcastToRoom(rid, payload, exceptWs);
    return;
  }

  const payload = {
    type: 'tokenRowDeleted',
    roomId: rid,
    mapId: mid,
    row: {
      room_id: rid,
      map_id: mid,
      token_id: tid,
      updated_at: new Date().toISOString()
    },
    rollback: true
  };
  send(exceptWs, payload);
  broadcastToRoom(rid, payload, exceptWs);
}

function attachClientToRoom(ws, roomId) {
  const nextRoomId = String(roomId || '').trim();
  if (!nextRoomId) return;

  if (ws.currentRoomId && ws.currentRoomId !== nextRoomId) {
    const prev = rooms.get(ws.currentRoomId);
    if (prev) {
      prev.delete(ws);
      if (prev.size === 0) rooms.delete(ws.currentRoomId);
    }
  }

  const room = getRoom(nextRoomId);
  if (!room) return;

  room.add(ws);
  ws.currentRoomId = nextRoomId;
}

async function upsertTokenRow({
  roomId,
  mapId,
  tokenId,
  ownerId = null,
  x = null,
  y = null,
  size = 1,
  color = null,
  isPublic = true
}) {
  return upsertTokenRowUsing(pool, {
    roomId,
    mapId,
    tokenId,
    ownerId,
    x,
    y,
    size,
    color,
    isPublic
  });
}

async function upsertTokenRowUsing(db, {
  roomId,
  mapId,
  tokenId,
  ownerId = null,
  x = null,
  y = null,
  size = 1,
  color = null,
  isPublic = true
}) {
  const sql = `
    insert into public.room_tokens (
      room_id, map_id, token_id, owner_id, x, y, size, color, is_public, updated_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
    on conflict (room_id, map_id, token_id)
    do update set
      owner_id   = coalesce(excluded.owner_id, public.room_tokens.owner_id),
      x          = excluded.x,
      y          = excluded.y,
      size       = excluded.size,
      color      = excluded.color,
      is_public  = excluded.is_public,
      updated_at = now()
    returning
      room_id,
      map_id,
      token_id,
      owner_id,
      x,
      y,
      size,
      color,
      is_public,
      updated_at
  `;

  const values = [
    roomId,
    mapId,
    tokenId,
    ownerId,
    x,
    y,
    Math.max(1, Number(size) || 1),
    color,
    !!isPublic
  ];

  const { rows } = await db.query(sql, values);
  return rows[0] || null;
}

async function getTokenRow(roomId, mapId, tokenId) {
  const { rows } = await pool.query(
    `
      select
        room_id, map_id, token_id, owner_id,
        x, y, size, color, is_public, updated_at
      from public.room_tokens
      where room_id = $1 and map_id = $2 and token_id = $3
      limit 1
    `,
    [roomId, mapId, tokenId]
  );
  return rows[0] || null;
}

function resolveTokenPublicForWrite(player, prev = null, fallback = true, options = {}) {
  const preferPlayer = !!options.preferPlayer;
  if (preferPlayer && typeof player?.isPublic === 'boolean') return !!player.isPublic;
  if (typeof prev?.is_public !== 'undefined' && prev?.is_public !== null) return !!prev.is_public;
  if (typeof player?.isPublic === 'boolean') return !!player.isPublic;
  const ownerRole = String(player?.ownerRole || '').trim();
  if (ownerRole === 'GM' && !player?.isAlly) return false;
  return !!fallback;
}

async function moveTokenV2({
  roomId,
  mapId,
  tokenId,
  tokenName,
  actorUserId,
  x,
  y
}) {
  const { rows } = await pool.query(
    `
      select *
      from public.move_token_v2($1,$2,$3,$4,$5,$6,$7)
    `,
    [roomId, mapId, tokenId, tokenName || '', actorUserId || '', x, y]
  );
  return rows[0] || null;
}

async function handleJoinRoom(ws, data) {
  const roomId = normalizeSafeId(data.roomId, ROOM_ID_RE);
  const auth = verifyAuthToken(data.authToken || data.token);
  const userId = auth.userId;
  if (!roomId || !userId) {
    send(ws, { type: 'error', message: 'joinRoom: roomId/auth required' });
    return;
  }

  try {
    const ctx = await loadRoomContext(roomId, userId);
    await touchRoomMember(roomId, userId).catch(() => {});
    ws.userId = ctx.userId;
    ws.userName = ctx.name;
    ws.role = ctx.role;
    ws.roomContext = { ...ctx, cachedAt: Date.now() };
    attachClientToRoom(ws, roomId);
    send(ws, {
      type: 'joinedWsRoom',
      roomId,
      userId: ctx.userId,
      role: ctx.role,
      ownerId: ctx.ownerId
    });
    await broadcastUsersSnapshot(roomId).catch((error) => {
      console.error('[users snapshot] failed:', error);
    });
  } catch (error) {
    send(ws, { type: 'error', message: error?.message || 'joinRoom failed' });
  }
}

async function handleJoinTavern(ws, data) {
  const auth = verifyAuthToken(data.authToken || data.token);
  const userId = auth.userId;
  ws.userId = userId;
  ws.userName = sanitizeText(data.name || data.userName, 'Player', 120);
  ws.role = 'tavern';
  ws.roomContext = null;
  attachClientToRoom(ws, TAVERN_ROOM_LOG_ID);
  send(ws, {
    type: 'joinedWsRoom',
    roomId: TAVERN_ROOM_LOG_ID,
    userId,
    role: 'tavern'
  });
}

async function handleTavernLogRowRelay(ws, data) {
  if (String(ws.currentRoomId || '') !== TAVERN_ROOM_LOG_ID || !ws.userId) {
    throw new Error('joinTavern required');
  }
  const row = data.row && typeof data.row === 'object' ? data.row : {};
  const text = normalizeTavernChatText(row.text || data.text);
  const payload = {
    type: 'tavernLogRow',
    roomId: TAVERN_ROOM_LOG_ID,
    row: {
      id: String(row.id || ''),
      room_id: TAVERN_ROOM_LOG_ID,
      text,
      created_at: row.created_at || new Date().toISOString()
    }
  };
  broadcastToRoom(TAVERN_ROOM_LOG_ID, payload, ws);
}

async function handleMoveToken(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const tokenId = normalizeSafeId(data.tokenId, ENTITY_ID_RE);
  let previewBroadcasted = false;
  let previewMapId = '';
  let prev = null;
  let prevLoaded = false;

  if (!roomId || !tokenId) {
    send(ws, { type: 'error', message: 'moveToken: roomId/mapId/tokenId required' });
    return;
  }

  try {
    const ctx = await loadWsRoomContext(ws, roomId);
    const state = ctx.state || {};
    const player = findPlayerById(state, tokenId);
    if (!player) throw new Error('Token not found in room state');
    ensureCanControlPlayer(ctx, player);

    const mapId = normalizeSafeId(data.mapId || player.mapId || getActiveMapId(state), ENTITY_ID_RE);
    if (!mapId) throw new Error('mapId is required');
    previewMapId = mapId;

    const previewSize = sanitizeTokenSize(player.size || data.size || 1);
    const previewPos = validateBoardPosition(data.x, data.y, previewSize, getStateMapBounds(state, mapId, { relaxed: true }));
    const turnOrder = Array.isArray(state?.turnOrder) ? state.turnOrder : [];
    const currentId = String(turnOrder[Math.max(0, Number(state?.currentTurnIndex) || 0)] || '');
    const needsPrevBeforePreview = (
      ctx.role !== 'GM'
      && String(state?.phase || '') === 'combat'
      && String(player?.id || '') !== currentId
    );

    if (needsPrevBeforePreview) {
      prev = await getTokenRow(roomId, mapId, tokenId);
      prevLoaded = true;
      ensureCanMoveInCombat(ctx, state, player, prev);
    }

    const previewIsPublic = resolveTokenPublicForWrite(player, prev, true, { preferPlayer: true });

    // Live movement preview: make other clients move immediately over WS.
    // The DB write below remains authoritative and will confirm or roll back this preview.
    previewBroadcasted = true;
    broadcastToRoom(roomId, {
      type: 'moveToken',
      roomId,
      mapId,
      tokenId,
      tokenName: String(player.name || data.tokenName || tokenId).trim() || tokenId,
      x: previewPos.x,
      y: previewPos.y,
      size: previewSize,
      isPublic: previewIsPublic,
      updated_at: new Date().toISOString(),
      livePreview: true
    }, ws);

    if (!prevLoaded) {
      prev = await getTokenRow(roomId, mapId, tokenId);
      prevLoaded = true;
    }
    ensureCanMoveInCombat(ctx, state, player, prev);

    const size = sanitizeTokenSize(data.size || prev?.size || player.size || 1);
    const bounds = await getMapBounds(roomId, mapId, state);
    const { x, y } = validateBoardPosition(data.x, data.y, size, bounds);
    const incomingColor = HEX_COLOR_RE.test(String(data.color || '')) ? String(data.color) : null;
    const color = incomingColor || prev?.color || (HEX_COLOR_RE.test(String(player.color || '')) ? String(player.color) : null);
    const isPublic = resolveTokenPublicForWrite(player, prev, true, { preferPlayer: true });

    const row = await withTransaction(async (client) => {
      await ensureTokenAreaFree(client, roomId, mapId, tokenId, x, y, size);
      const updated = await upsertTokenRowUsing(client, {
        roomId,
        mapId,
        tokenId,
        ownerId: String(player.ownerId || ctx.userId || '') || null,
        x,
        y,
        size,
        color,
        isPublic
      });
      const tokenName = String(player.name || data.tokenName || tokenId).trim() || tokenId;
      await client.query(
        'insert into public.room_log(room_id, text) values ($1, $2)',
        [roomId, `${tokenName} переместил токен`]
      ).catch(() => {});
      return updated;
    });

    const payload = {
      type: 'tokenRow',
      roomId,
      mapId,
      row
    };

    send(ws, payload);
    broadcastToRoom(roomId, payload, ws);
  } catch (err) {
    if (previewBroadcasted) {
      try { broadcastTokenMoveRollback(roomId, previewMapId, tokenId, prev, ws); } catch (rollbackErr) {
        console.error('[moveToken rollback] failed:', rollbackErr);
      }
    }
    send(ws, {
      type: 'error',
      message: err?.message || 'moveToken failed'
    });
  }
}

async function handleUpdateTokenColor(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const mapId = normalizeSafeId(data.mapId, ENTITY_ID_RE);
  const tokenId = normalizeSafeId(data.tokenId, ENTITY_ID_RE);
  const color = data.color == null ? null : String(data.color).trim();

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'updateTokenColor: roomId/mapId/tokenId required' });
    return;
  }

  try {
    if (color !== null && !HEX_COLOR_RE.test(color)) throw new Error('Invalid token color');
    const ctx = await loadWsRoomContext(ws, roomId);
    const player = findPlayerById(ctx.state || {}, tokenId);
    if (!player) throw new Error('Token not found in room state');
    ensureCanControlPlayer(ctx, player);
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: String(player.ownerId || prev?.owner_id || ctx.userId || '') || null,
      x: prev?.x ?? null,
      y: prev?.y ?? null,
      size: prev?.size ?? 1,
      color,
      isPublic: resolveTokenPublicForWrite(player, prev, true)
    });

    const payload = {
      type: 'tokenRow',
      roomId,
      mapId,
      row
    };

    send(ws, payload);
    broadcastToRoom(roomId, payload, ws);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err?.message || 'updateTokenColor failed'
    });
  }
}

async function handleUpdateTokenSize(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const mapId = normalizeSafeId(data.mapId, ENTITY_ID_RE);
  const tokenId = normalizeSafeId(data.tokenId, ENTITY_ID_RE);
  const nextSize = sanitizeTokenSize(data.size);

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'updateTokenSize: roomId/mapId/tokenId required' });
    return;
  }

  try {
    const ctx = await loadWsRoomContext(ws, roomId);
    const state = ctx.state || {};
    const player = findPlayerById(state, tokenId);
    if (!player) throw new Error('Token not found in room state');
    ensureCanControlPlayer(ctx, player);
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const bounds = await getMapBounds(roomId, mapId, state);
    const x = prev?.x ?? null;
    const y = prev?.y ?? null;
    if (x !== null && y !== null) validateBoardPosition(x, y, nextSize, bounds);
    const row = await withTransaction(async (client) => {
      await ensureTokenAreaFree(client, roomId, mapId, tokenId, x, y, nextSize);
      return upsertTokenRowUsing(client, {
        roomId,
        mapId,
        tokenId,
        ownerId: String(player.ownerId || prev?.owner_id || ctx.userId || '') || null,
        x,
        y,
        size: nextSize,
        color: prev?.color ?? (HEX_COLOR_RE.test(String(player.color || '')) ? String(player.color) : null),
        isPublic: resolveTokenPublicForWrite(player, prev, true)
      });
    });

    const payload = {
      type: 'tokenRow',
      roomId,
      mapId,
      row
    };

    send(ws, payload);
    broadcastToRoom(roomId, payload, ws);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err?.message || 'updateTokenSize failed'
    });
  }
}

async function handleSetTokenVisibility(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const mapId = normalizeSafeId(data.mapId, ENTITY_ID_RE);
  const tokenId = normalizeSafeId(data.tokenId, ENTITY_ID_RE);
  const isPublic = !!data.isPublic;

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'setTokenVisibility: roomId/mapId/tokenId required' });
    return;
  }

  try {
    const ctx = await loadWsRoomContext(ws, roomId);
    ensureGm(ctx);
    const player = findPlayerById(ctx.state || {}, tokenId);
    if (!player) throw new Error('Token not found in room state');
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: String(player.ownerId || prev?.owner_id || '') || null,
      x: prev?.x ?? null,
      y: prev?.y ?? null,
      size: prev?.size ?? 1,
      color: prev?.color ?? null,
      isPublic
    });

    const payload = {
      type: 'tokenRow',
      roomId,
      mapId,
      row
    };

    send(ws, payload);
    broadcastToRoom(roomId, payload, ws);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err?.message || 'setTokenVisibility failed'
    });
  }
}

async function handleRemoveTokenFromBoard(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const mapId = normalizeSafeId(data.mapId, ENTITY_ID_RE);
  const tokenId = normalizeSafeId(data.tokenId, ENTITY_ID_RE);

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'removeTokenFromBoard: roomId/mapId/tokenId required' });
    return;
  }

  try {
    const ctx = await loadWsRoomContext(ws, roomId);
    const player = findPlayerById(ctx.state || {}, tokenId);
    if (!player) throw new Error('Token not found in room state');
    ensureCanControlPlayer(ctx, player);
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: String(player.ownerId || prev?.owner_id || ctx.userId || '') || null,
      x: null,
      y: null,
      size: prev?.size ?? 1,
      color: prev?.color ?? null,
      isPublic: resolveTokenPublicForWrite(player, prev, true)
    });

    const payload = {
      type: 'tokenRow',
      roomId,
      mapId,
      row
    };

    send(ws, payload);
    broadcastToRoom(roomId, payload, ws);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err?.message || 'removeTokenFromBoard failed'
    });
  }
}

function sanitizeRoomStateForStorage(stateRaw) {
  const nextState = stripRoomSecretsFromState(stateRaw || {});
  if (Array.isArray(nextState.players)) {
    nextState.players.forEach((player) => {
      if (!player || typeof player !== 'object') return;
      player.x = null;
      player.y = null;
    });
  }
  nextState.log = [];
  return nextState;
}

function getDexModServer(player) {
  try {
    const dexObj = player?.sheet?.parsed?.stats?.dex;
    const modCandidate = Number(dexObj?.modifier ?? dexObj?.mod);
    if (Number.isFinite(modCandidate)) return modCandidate;
    const scoreCandidate = Number(dexObj?.score ?? dexObj?.value);
    if (!Number.isFinite(scoreCandidate)) return 0;
    return Math.floor((scoreCandidate - 10) / 2);
  } catch {
    return 0;
  }
}

function rollInitiativeForPlayerServer(player) {
  const modeRaw = String(player?.initiativeMode || 'normal');
  const mode = modeRaw === 'advantage' || modeRaw === 'disadvantage' ? modeRaw : 'normal';
  const r1 = Math.floor(Math.random() * 20) + 1;
  const r2 = Math.floor(Math.random() * 20) + 1;
  const kept = mode === 'advantage' ? Math.max(r1, r2) : mode === 'disadvantage' ? Math.min(r1, r2) : r1;
  return kept + getDexModServer(player);
}

function getActiveMapServer(state) {
  const maps = Array.isArray(state?.maps) ? state.maps : [];
  if (!maps.length) return null;
  const activeId = String(state?.currentMapId || '').trim();
  return maps.find((map) => map && String(map.id || '') === activeId) || maps[0] || null;
}

function syncActiveMapCombatStateServer(state) {
  if (!state || typeof state !== 'object') return state;
  const map = getActiveMapServer(state);
  if (!map || typeof map !== 'object') return state;

  const turnOrder = Array.isArray(state.turnOrder)
    ? state.turnOrder.map((id) => String(id || '')).filter(Boolean)
    : [];
  const turnCount = turnOrder.length;
  const currentTurnIndex = turnCount
    ? Math.max(0, Math.min(turnCount - 1, Math.trunc(Number(state.currentTurnIndex) || 0)))
    : 0;

  map.phase = String(state.phase || map.phase || 'exploration');
  map.phaseEpoch = Math.max(0, Math.trunc(Number(state.phaseEpoch) || Number(map.phaseEpoch) || 0));
  map.combatSelectionEpoch = Math.max(0, Math.trunc(Number(state.combatSelectionEpoch) || Number(map.combatSelectionEpoch) || 0));
  map.turnOrder = turnOrder;
  map.currentTurnIndex = currentTurnIndex;
  map.round = Math.max(1, Math.trunc(Number(state.round) || Number(map.round) || 1));
  map.turnEpoch = Math.max(0, Math.trunc(Number(state.turnEpoch) || Number(map.turnEpoch) || 0));
  map.playerStates = {};

  const players = Array.isArray(state.players) ? state.players : [];
  players.forEach((player) => {
    if (!player || !player.id) return;
    const initiative = (player.initiative === null || typeof player.initiative === 'undefined')
      ? null
      : Number(player.initiative);
    map.playerStates[String(player.id)] = {
      inCombat: !!player.inCombat,
      initiative: Number.isFinite(initiative) ? initiative : null,
      hasRolledInitiative: !!player.hasRolledInitiative,
      pendingInitiativeChoice: !!player.pendingInitiativeChoice,
      willJoinNextRound: !!player.willJoinNextRound
    };
  });

  return state;
}

function normalizeInitiativeModeServer(mode) {
  const value = String(mode || 'normal').trim();
  if (value === 'advantage' || value === 'disadvantage') return value;
  return 'normal';
}

function sanitizeStatePatchFields(fieldsRaw) {
  const raw = (fieldsRaw && typeof fieldsRaw === 'object') ? fieldsRaw : {};
  const out = {};
  if (typeof raw.phase !== 'undefined') {
    const phase = String(raw.phase || '').trim();
    if (['exploration', 'initiative', 'combat', 'placement', 'lobby'].includes(phase)) out.phase = phase;
  }
  for (const key of ['phaseEpoch', 'combatSelectionEpoch', 'initiativeEpoch', 'turnEpoch']) {
    if (typeof raw[key] === 'undefined') continue;
    out[key] = Math.max(0, Math.trunc(Number(raw[key]) || 0));
  }
  if (typeof raw.turnOrder !== 'undefined') {
    out.turnOrder = (Array.isArray(raw.turnOrder) ? raw.turnOrder : [])
      .map((id) => normalizeSafeId(id, ENTITY_ID_RE))
      .filter(Boolean)
      .slice(0, 200);
  }
  if (typeof raw.currentTurnIndex !== 'undefined') {
    out.currentTurnIndex = Math.max(0, Math.trunc(Number(raw.currentTurnIndex) || 0));
  }
  if (typeof raw.round !== 'undefined') {
    out.round = Math.max(1, Math.min(10000, Math.trunc(Number(raw.round) || 1)));
  }
  if (typeof raw.cellFeet !== 'undefined') {
    out.cellFeet = Math.max(1, Math.min(100, Math.trunc(Number(raw.cellFeet) || 10)));
  }
  if (typeof raw.boardWidth !== 'undefined') {
    out.boardWidth = Math.max(5, Math.min(150, Math.trunc(Number(raw.boardWidth) || 10)));
  }
  if (typeof raw.boardHeight !== 'undefined') {
    out.boardHeight = Math.max(5, Math.min(150, Math.trunc(Number(raw.boardHeight) || 10)));
  }
  if (typeof raw.gridAlpha !== 'undefined') {
    out.gridAlpha = clampNumber(raw.gridAlpha, 0, 1, 1);
  }
  if (typeof raw.wallAlpha !== 'undefined') {
    out.wallAlpha = clampNumber(raw.wallAlpha, 0, 1, 1);
  }
  if (typeof raw.currentMapId !== 'undefined') {
    const mapId = normalizeSafeId(raw.currentMapId, ENTITY_ID_RE);
    if (mapId) out.currentMapId = mapId;
  }
  if (Array.isArray(raw.mapSections)) {
    out.mapSections = raw.mapSections
      .slice(0, 100)
      .map((section) => ({
        id: normalizeSafeId(section?.id, ENTITY_ID_RE),
        name: sanitizeText(section?.name, 'Раздел', 120)
      }))
      .filter((section) => section.id && section.name);
  }
  return out;
}

function isCurrentTurnOwner(ctx, state) {
  try {
    if (!ctx || !state || String(state.phase || '') !== 'combat') return false;
    const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
    if (!order.length) return false;
    const index = Math.max(0, Math.min(order.length - 1, Math.trunc(Number(state.currentTurnIndex) || 0)));
    const actor = findPlayerById(state, order[index]);
    return !!actor && String(actor.ownerId || '') === ctx.userId;
  } catch {
    return false;
  }
}

function canPatchTurnFields(ctx, state, fields) {
  if (ctx.role === 'GM') return true;
  if (!isCurrentTurnOwner(ctx, state)) return false;
  const order = Array.isArray(state.turnOrder) ? state.turnOrder.map((id) => String(id || '')).filter(Boolean) : [];
  if (!order.length) return false;
  const currentIndex = Math.max(0, Math.min(order.length - 1, Math.trunc(Number(state.currentTurnIndex) || 0)));
  const expectedNext = (currentIndex + 1) % order.length;
  const requestedIndex = Math.max(0, Math.trunc(Number(fields.currentTurnIndex) || 0));
  const hasTurnOrder = Object.prototype.hasOwnProperty.call(fields, 'turnOrder');
  const hasRound = Object.prototype.hasOwnProperty.call(fields, 'round');
  const hasTurnEpoch = Object.prototype.hasOwnProperty.call(fields, 'turnEpoch');
  const allowedKeys = new Set(['currentTurnIndex', 'round', 'turnEpoch']);
  if (Object.keys(fields).some((key) => !allowedKeys.has(key))) return false;
  if (hasTurnOrder) return false;
  if (requestedIndex !== expectedNext) return false;
  if (hasRound) {
    const wrapped = expectedNext === 0 && currentIndex === order.length - 1;
    const curRound = Math.max(1, Math.trunc(Number(state.round) || 1));
    const reqRound = Math.max(1, Math.trunc(Number(fields.round) || curRound));
    if (wrapped) {
      if (reqRound < curRound || reqRound > curRound + 1) return false;
    } else if (reqRound !== curRound) {
      return false;
    }
  }
  return hasTurnEpoch || Object.prototype.hasOwnProperty.call(fields, 'currentTurnIndex') || hasRound;
}

function applyStatePatchToCurrentState(ctx, rawPatch) {
  ensurePlayerOrGm(ctx);
  const state = cloneJson(ctx.state || {}) || {};
  const patch = (rawPatch && typeof rawPatch === 'object') ? rawPatch : {};
  const acceptedPatch = {};
  const fields = sanitizeStatePatchFields(patch.fields || {});
  const fieldKeys = Object.keys(fields);

  if (fieldKeys.length) {
    const turnOnly = fieldKeys.every((key) => ['currentTurnIndex', 'round', 'turnEpoch'].includes(key));
    if (ctx.role !== 'GM' && !(turnOnly && canPatchTurnFields(ctx, state, fields))) {
      throw new Error('GM role required for this state patch');
    }

    if (typeof fields.phase !== 'undefined') state.phase = fields.phase;
    for (const key of ['phaseEpoch', 'combatSelectionEpoch', 'initiativeEpoch', 'turnEpoch', 'cellFeet']) {
      if (typeof fields[key] !== 'undefined') state[key] = fields[key];
    }
    if (Array.isArray(fields.turnOrder)) {
      const playerIds = new Set(getStatePlayers(state).map((p) => String(p?.id || '')).filter(Boolean));
      state.turnOrder = fields.turnOrder.filter((id) => playerIds.has(String(id)));
      fields.turnOrder = [...state.turnOrder];
    }
    if (typeof fields.currentTurnIndex !== 'undefined') {
      const maxIndex = Math.max(0, (Array.isArray(state.turnOrder) ? state.turnOrder.length : 0) - 1);
      state.currentTurnIndex = Math.min(maxIndex, fields.currentTurnIndex);
      fields.currentTurnIndex = state.currentTurnIndex;
    }
    if (typeof fields.round !== 'undefined') {
      state.round = fields.round;
      fields.round = state.round;
    }
    if (typeof fields.currentMapId !== 'undefined') {
      const mapExists = (Array.isArray(state.maps) ? state.maps : [])
        .some((map) => map && String(map.id || map.map_id || '') === String(fields.currentMapId));
      if (!mapExists) throw new Error('Map not found');
      state.currentMapId = fields.currentMapId;
    }
    if (Array.isArray(fields.mapSections)) {
      if (!fields.mapSections.length) throw new Error('mapSections cannot be empty');
      state.mapSections = cloneJson(fields.mapSections) || fields.mapSections;
    }
    if (
      typeof fields.boardWidth !== 'undefined'
      || typeof fields.boardHeight !== 'undefined'
      || typeof fields.gridAlpha !== 'undefined'
      || typeof fields.wallAlpha !== 'undefined'
    ) {
      const activeMapId = String(state.currentMapId || '').trim();
      const activeMap = (Array.isArray(state.maps) ? state.maps : [])
        .find((map) => map && String(map.id || map.map_id || '') === activeMapId);
      if (typeof fields.boardWidth !== 'undefined') {
        state.boardWidth = fields.boardWidth;
        if (activeMap) activeMap.boardWidth = fields.boardWidth;
      }
      if (typeof fields.boardHeight !== 'undefined') {
        state.boardHeight = fields.boardHeight;
        if (activeMap) activeMap.boardHeight = fields.boardHeight;
      }
      if (typeof fields.gridAlpha !== 'undefined') {
        state.gridAlpha = fields.gridAlpha;
        if (activeMap) activeMap.gridAlpha = fields.gridAlpha;
      }
      if (typeof fields.wallAlpha !== 'undefined') {
        state.wallAlpha = fields.wallAlpha;
        if (activeMap) activeMap.wallAlpha = fields.wallAlpha;
      }
    }
    acceptedPatch.fields = cloneJson(fields) || {};
  }

  const playerPatches = [];
  const playersRaw = Array.isArray(patch.players) ? patch.players.slice(0, 200) : [];
  for (const item of playersRaw) {
    const playerId = normalizeSafeId(item?.id || item?.playerId, ENTITY_ID_RE);
    if (!playerId) continue;
    const player = findPlayerById(state, playerId);
    if (!player) continue;
    const owns = String(player.ownerId || '') === ctx.userId;
    const out = { id: playerId };

    if (Object.prototype.hasOwnProperty.call(item, 'inCombat')) {
      ensureGm(ctx);
      player.inCombat = !!item.inCombat;
      out.inCombat = !!player.inCombat;
      if (!player.inCombat) {
        player.pendingInitiativeChoice = false;
        player.willJoinNextRound = false;
        out.pendingInitiativeChoice = false;
        out.willJoinNextRound = false;
      }
    }

    if (Object.prototype.hasOwnProperty.call(item, 'initiativeMode')) {
      if (ctx.role !== 'GM' && !owns) throw new Error('Cannot edit this player');
      player.initiativeMode = normalizeInitiativeModeServer(item.initiativeMode);
      out.initiativeMode = player.initiativeMode;
    }

    const canPatchOwnInitiative = ctx.role === 'GM' || owns;
    if (Object.prototype.hasOwnProperty.call(item, 'initiative')) {
      if (!canPatchOwnInitiative) throw new Error('Cannot edit this initiative');
      if (item.initiative === null || typeof item.initiative === 'undefined') {
        player.initiative = null;
        out.initiative = null;
      } else {
        const total = Math.max(-1000, Math.min(1000, Math.trunc(Number(item.initiative) || 0)));
        player.initiative = total;
        out.initiative = total;
      }
    }
    for (const key of ['hasRolledInitiative', 'pendingInitiativeChoice', 'willJoinNextRound']) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      if (!canPatchOwnInitiative) throw new Error('Cannot edit this initiative');
      player[key] = !!item[key];
      out[key] = !!player[key];
    }

    if (Object.keys(out).length > 1) playerPatches.push(out);
  }
  if (playerPatches.length) acceptedPatch.players = playerPatches;

  return {
    state: syncActiveMapCombatStateServer(state),
    patch: acceptedPatch
  };
}

function preserveNewerPlayerData(nextState, currentState) {
  const currentById = new Map(getStatePlayers(currentState).map((p) => [String(p.id), p]));
  const sameInitiative = String(nextState.currentMapId || '') === String(currentState.currentMapId || '')
    && Number(nextState.initiativeEpoch || 0) === Number(currentState.initiativeEpoch || 0);
  for (const player of getStatePlayers(nextState)) {
    const current = currentById.get(String(player.id));
    if (!current) continue;
    if (Number(current.sheetUpdatedAt || 0) > Number(player.sheetUpdatedAt || 0)) {
      player.sheet = cloneJson(current.sheet);
      player.sheetUpdatedAt = current.sheetUpdatedAt;
      player.name = current.name;
    }
    if (sameInitiative && player.inCombat && current.hasRolledInitiative && !player.hasRolledInitiative) {
      player.initiative = current.initiative;
      player.hasRolledInitiative = true;
      player.pendingInitiativeChoice = false;
    }
  }
  return syncActiveMapCombatStateServer(nextState);
}

// Every read/modify/write of the room JSON must read under the same row lock.
// Cached snapshots are useful for reads, but cannot be the base of a mutation.
async function mutateRoomState(ctx, mutate) {
  ensurePlayerOrGm(ctx);
  let stored;
  let updatedAt;
  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('d20_room_state'), hashtext($1))", [ctx.roomId]);
    const { rows } = await client.query('select state from public.room_state where room_id = $1 for update', [ctx.roomId]);
    ctx.state = cloneJson(rows[0]?.state || ctx.state || {}) || {};
    stored = sanitizeRoomStateForStorage(await mutate(cloneJson(ctx.state)));
    const result = await writeRoomState(ctx, stored, client);
    updatedAt = result;
  });
  ctx.state = stored;
  rememberRoomStateValue(ctx.roomId, stored, updatedAt, ctx.room || {});
  invalidateRoomContexts(ctx.roomId);
  return stripRoomSecretsFromState(stored);
}

async function persistPatchedState(ctx, nextState) {
  return mutateRoomState(ctx, (current) => preserveNewerPlayerData(cloneJson(nextState), current));
}

async function writeRoomState(ctx, nextState, db) {
  const stored = sanitizeRoomStateForStorage(nextState || {});
  const { rows } = await db.query(
    `
      insert into public.room_state(room_id, phase, current_actor_id, state, updated_at)
      values ($1,$2,$3,$4,now())
      on conflict (room_id)
      do update set phase = excluded.phase,
                    current_actor_id = excluded.current_actor_id,
                    state = excluded.state,
                    updated_at = now()
      returning updated_at
    `,
    [
      ctx.roomId,
      String(stored.phase || 'lobby'),
      Array.isArray(stored.turnOrder) ? (stored.turnOrder[Math.max(0, Number(stored.currentTurnIndex) || 0)] || null) : null,
      stored
    ]
  );
  return rows[0]?.updated_at || new Date().toISOString();
}

function sanitizeNewPlayerForOwner(ctx, incoming, currentState) {
  if (!incoming || typeof incoming !== 'object') return null;
  const existingPlayers = Array.isArray(currentState?.players) ? currentState.players : [];
  const wantsBase = !!incoming.isBase;
  const alreadyHasBase = wantsBase && existingPlayers.some((player) => (
    player
    && player.isBase
    && String(player.ownerId || '') === ctx.userId
  ));
  if (alreadyHasBase) return null;

  const id = normalizeSafeId(incoming.id, ENTITY_ID_RE) || crypto.randomUUID();
  const name = sanitizeText(incoming.name, 'Player', 160);
  const color = HEX_COLOR_RE.test(String(incoming.color || '')) ? String(incoming.color) : '#3b82f6';
  const size = sanitizeTokenSize(incoming.size, 1);
  const sheet = incoming.sheet && typeof incoming.sheet === 'object'
    ? cloneJson(incoming.sheet)
    : { parsed: { name: { value: name } } };
  try {
    if (!sheet.parsed || typeof sheet.parsed !== 'object') sheet.parsed = {};
    if (!sheet.parsed.name) sheet.parsed.name = { value: name };
  } catch {}

  return {
    id,
    name,
    color,
    size,
    x: null,
    y: null,
    initiative: 0,
    hasRolledInitiative: false,
    initiativeMode: 'normal',
    pendingInitiativeChoice: false,
    willJoinNextRound: false,
    inCombat: false,
    isBase: wantsBase,
    isAlly: true,
    isEnemy: false,
    isPublic: true,
    isMonster: false,
    monsterId: null,
    ownerId: ctx.userId,
    ownerRole: ctx.role,
    mapId: null,
    ownerName: ctx.name || '',
    sheet
  };
}

function sanitizeCreatedPlayerForContext(ctx, incoming, currentState) {
  if (!incoming || typeof incoming !== 'object') return null;
  if (ctx.role !== 'GM') return sanitizeNewPlayerForOwner(ctx, incoming, currentState);

  const players = Array.isArray(currentState?.players) ? currentState.players : [];
  const wantsBase = !!incoming.isBase;
  if (wantsBase && players.some((player) => player && player.isBase && String(player.ownerId || '') === ctx.userId)) {
    return null;
  }

  const id = normalizeSafeId(incoming.id, ENTITY_ID_RE) || crypto.randomUUID();
  const name = sanitizeText(incoming.name, 'Player', 160);
  const color = HEX_COLOR_RE.test(String(incoming.color || '')) ? String(incoming.color) : '#3b82f6';
  const size = sanitizeTokenSize(incoming.size, 1);
  const isAlly = !!incoming.isAlly && !incoming.isEnemy;
  const isEnemy = !isAlly || !!incoming.isEnemy;
  const isMonster = !!incoming.isMonster;
  const activeMapId = getActiveMapId(currentState || {});
  const requestedMapId = normalizeSafeId(incoming.mapId || incoming.map_id || '', ENTITY_ID_RE);
  const mapId = (isEnemy && !wantsBase) ? (requestedMapId || activeMapId || null) : null;
  const sheet = incoming.sheet && typeof incoming.sheet === 'object'
    ? (cloneJson(incoming.sheet) || { parsed: { name: { value: name } } })
    : { parsed: { name: { value: name } } };

  try {
    if (!sheet.parsed || typeof sheet.parsed !== 'object') sheet.parsed = {};
    if (!sheet.parsed.name) sheet.parsed.name = { value: name };
  } catch {}

  return {
    id,
    name,
    color,
    size,
    x: null,
    y: null,
    initiative: 0,
    hasRolledInitiative: false,
    initiativeMode: 'normal',
    pendingInitiativeChoice: false,
    willJoinNextRound: false,
    inCombat: false,
    isBase: wantsBase,
    isAlly,
    isEnemy,
    isPublic: typeof incoming.isPublic === 'boolean' ? !!incoming.isPublic : !!isAlly,
    isMonster,
    monsterId: normalizeSafeId(incoming.monsterId || incoming.monster_id || '', ENTITY_ID_RE) || null,
    ownerId: ctx.userId,
    ownerRole: ctx.role,
    mapId,
    ownerName: ctx.name || '',
    sheet,
    sheetUpdatedAt: Math.max(0, Number(incoming.sheetUpdatedAt) || Date.now())
  };
}

function removePlayerFromStateServer(state, playerId) {
  const id = String(playerId || '').trim();
  const next = cloneJson(state || {}) || {};
  const before = Array.isArray(next.players) ? next.players : [];
  next.players = before.filter((player) => String(player?.id || '') !== id);
  next.turnOrder = (Array.isArray(next.turnOrder) ? next.turnOrder : []).filter((item) => String(item || '') !== id);
  if (next.turnOrder.length <= 0) {
    next.currentTurnIndex = 0;
  } else {
    next.currentTurnIndex = Math.min(Math.max(0, Math.trunc(Number(next.currentTurnIndex) || 0)), next.turnOrder.length - 1);
  }
  if (Array.isArray(next.maps)) {
    next.maps.forEach((map) => {
      if (!map || typeof map !== 'object') return;
      if (map.playerStates && typeof map.playerStates === 'object') delete map.playerStates[id];
      if (map.playersPos && typeof map.playersPos === 'object') delete map.playersPos[id];
      if (Array.isArray(map.turnOrder)) map.turnOrder = map.turnOrder.filter((item) => String(item || '') !== id);
      if (Array.isArray(map.turnOrder) && map.turnOrder.length <= 0) map.currentTurnIndex = 0;
      else if (Array.isArray(map.turnOrder)) {
        map.currentTurnIndex = Math.min(Math.max(0, Math.trunc(Number(map.currentTurnIndex) || 0)), map.turnOrder.length - 1);
      }
    });
  }
  return next;
}

function applyPlayerStateUpdate(ctx, requestedState) {
  const current = cloneJson(ctx.state || {}) || {};
  const requested = cloneJson(requestedState || {}) || {};
  const players = Array.isArray(current.players) ? current.players : [];
  const requestedById = new Map(
    (Array.isArray(requested.players) ? requested.players : [])
      .filter((player) => player && player.id)
      .map((player) => [String(player.id), player])
  );

  current.players = players.map((player) => {
    if (!player || typeof player !== 'object') return player;
    if (String(player.ownerId || '') !== ctx.userId) return player;
    const incoming = requestedById.get(String(player.id));
    if (!incoming || typeof incoming !== 'object') return player;
    const next = cloneJson(player) || {};

    const acceptsSheet = incoming.sheet && typeof incoming.sheet === 'object'
      && Number(incoming.sheetUpdatedAt || 0) >= Number(next.sheetUpdatedAt || 0);
    if (acceptsSheet) {
      next.sheet = cloneJson(incoming.sheet);
      const incomingTs = Math.max(0, Number(incoming.sheetUpdatedAt) || Date.now());
      next.sheetUpdatedAt = Math.max(Number(next.sheetUpdatedAt) || 0, incomingTs);
    }
    if ((!incoming.sheet || acceptsSheet) && typeof incoming.name === 'string' && incoming.name.trim()) {
      next.name = sanitizeText(incoming.name, String(next.name || 'Player'), 160);
    }
    const initiativeMode = String(incoming.initiativeMode || next.initiativeMode || 'normal');
    if (['normal', 'advantage', 'disadvantage'].includes(initiativeMode)) next.initiativeMode = initiativeMode;
    if (typeof incoming.willJoinNextRound === 'boolean') next.willJoinNextRound = incoming.willJoinNextRound;

    if (String(current.phase || '') === 'initiative'
      && next.inCombat
      && !next.hasRolledInitiative
      && incoming.hasRolledInitiative) {
      const incomingInitiative = Number(incoming.initiative);
      next.initiative = Number.isFinite(incomingInitiative)
        ? Math.max(-1000, Math.min(1000, incomingInitiative))
        : rollInitiativeForPlayerServer(next);
      next.hasRolledInitiative = true;
      next.pendingInitiativeChoice = false;
    }

    return next;
  });

  const existingIds = new Set(current.players.map((player) => String(player?.id || '')).filter(Boolean));
  for (const incoming of (Array.isArray(requested.players) ? requested.players : [])) {
    const incomingId = String(incoming?.id || '');
    if (incomingId && existingIds.has(incomingId)) continue;
    const created = sanitizeNewPlayerForOwner(ctx, incoming, current);
    if (!created) continue;
    current.players.push(created);
    existingIds.add(String(created.id));
  }

  if (String(current.phase || '') === 'combat' && Array.isArray(current.turnOrder) && current.turnOrder.length) {
    const currentIndex = Math.max(0, Math.min(current.turnOrder.length - 1, Math.trunc(Number(current.currentTurnIndex) || 0)));
    const currentActorId = String(current.turnOrder[currentIndex] || '');
    const currentActor = current.players.find((player) => String(player?.id || '') === currentActorId);
    if (currentActor && String(currentActor.ownerId || '') === ctx.userId) {
      const requestedIndex = Math.trunc(Number(requested.currentTurnIndex));
      const nextIndex = (currentIndex + 1) % current.turnOrder.length;
      const wrapped = currentIndex === current.turnOrder.length - 1 && nextIndex === 0;
      const requestedRound = Math.trunc(Number(requested.round) || Number(current.round) || 1);
      if (requestedIndex === nextIndex) {
        current.currentTurnIndex = nextIndex;
        current.round = wrapped ? Math.max(Number(current.round) || 1, requestedRound, (Number(current.round) || 1) + 1) : (Number(current.round) || 1);
      }
    }
  }

  return syncActiveMapCombatStateServer(current);
}

async function persistStateForContext(ctx, requestedState) {
  if (!requestedState || typeof requestedState !== 'object') throw new Error('state object required');
  return mutateRoomState(ctx, (current) => {
    const next = ctx.role === 'GM' ? cloneJson(requestedState) : applyPlayerStateUpdate(ctx, requestedState);
    return preserveNewerPlayerData(next, current);
  });
}

async function persistStatePatchForContext(ctx, patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch object required');
  return mutateRoomState(ctx, (current) => {
    const applied = applyStatePatchToCurrentState(ctx, patch);
    return preserveNewerPlayerData(applied.state, current);
  });
}

async function handleStateRelay(ws, data) {
  const roomId = normalizeSafeId(data.roomId || ws.currentRoomId, ROOM_ID_RE);
  const ctx = await loadWsRoomContext(ws, roomId);
  if (data.state && typeof data.state === 'object') {
    const committedState = await persistStateForContext(ctx, data.state);
    const payload = {
      ...makeStatePayload(ctx.roomId, committedState, null),
      __fromWsClient: data.__fromWsClient,
      __optimisticApplied: !!data.__optimisticApplied
    };
    send(ws, payload);
    broadcastToRoom(ctx.roomId, payload, ws);
    ws.roomContext = null;
    return;
  }
  const row = await fetchRoomStateRow(ctx.roomId);
  const payload = makeStatePayload(ctx.roomId, row?.state || {}, row?.updated_at);
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleStatePatchRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  const rawPatch = (data.patch && typeof data.patch === 'object') ? data.patch : {};
  let patch;
  await mutateRoomState(ctx, (current) => {
    const applied = applyStatePatchToCurrentState(ctx, rawPatch);
    patch = applied.patch || {};
    if (!Object.keys(patch.fields || {}).length && !Array.isArray(patch.players)) {
      throw new Error('No authorized state patch fields');
    }
    const next = preserveNewerPlayerData(applied.state, current);
    // Broadcast the committed values, including any rolls preserved from a newer snapshot.
    for (const item of (patch.players || [])) {
      const player = findPlayerById(next, item.id);
      if (!player) continue;
      for (const key of Object.keys(item)) if (key !== 'id') item[key] = cloneJson(player[key]);
    }
    return next;
  });
  ws.roomContext = null;
  const payload = {
    type: 'statePatch',
    roomId: ctx.roomId,
    patch,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handlePlayerCreateRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const freshRow = await fetchRoomStateRow(ctx.roomId);
  if (!freshRow) throw new Error('Room not found');
  ctx.state = (freshRow.state && typeof freshRow.state === 'object') ? freshRow.state : {};
  const state = cloneJson(ctx.state || {}) || {};
  if (!Array.isArray(state.players)) state.players = [];
  const incoming = (data.player && typeof data.player === 'object') ? data.player : {};
  const requestedId = normalizeSafeId(incoming.id, ENTITY_ID_RE);
  const existing = requestedId
    ? state.players.find((player) => player && String(player.id || '') === requestedId)
    : null;
  const player = existing || sanitizeCreatedPlayerForContext(ctx, incoming, state);
  if (!player) throw new Error('Invalid player create request');
  if (!existing) state.players.push(player);

  const storedState = syncActiveMapCombatStateServer(state);
  await persistPatchedState(ctx, storedState);
  ws.roomContext = null;
  const payload = {
    type: 'playerCreated',
    roomId: ctx.roomId,
    player: cloneJson(player) || player,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handlePlayerDeleteRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const freshRow = await fetchRoomStateRow(ctx.roomId);
  if (!freshRow) throw new Error('Room not found');
  ctx.state = (freshRow.state && typeof freshRow.state === 'object') ? freshRow.state : {};
  const playerId = normalizeSafeId(data.playerId || data.id || data.row?.player_id || data.row?.token_id, ENTITY_ID_RE);
  if (!playerId) throw new Error('playerId required');
  const state = cloneJson(ctx.state || {}) || {};
  const player = findPlayerById(state, playerId);
  if (!player) {
    const payload = { type: 'playerDeleted', roomId: ctx.roomId, playerId };
    send(ws, payload);
    broadcastToRoom(ctx.roomId, payload, ws);
    return;
  }
  if (ctx.role !== 'GM' && String(player.ownerId || '') !== ctx.userId) {
    throw new Error('You cannot delete this player');
  }
  const nextState = syncActiveMapCombatStateServer(removePlayerFromStateServer(state, playerId));
  await pool.query('delete from public.room_tokens where room_id = $1 and token_id = $2', [ctx.roomId, playerId]).catch((error) => {
    console.warn('[ws playerDelete] token cleanup failed:', error?.message || error);
  });
  await persistPatchedState(ctx, nextState);
  ws.roomContext = null;
  const payload = {
    type: 'playerDeleted',
    roomId: ctx.roomId,
    playerId,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

function cleanMapMetaRow(ctx, raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const mapId = normalizeSafeId(row.map_id || row.mapId || row.id, ENTITY_ID_RE);
  if (!mapId) throw new Error('map_id required');
  return {
    room_id: ctx.roomId,
    map_id: mapId,
    name: String(row.name || 'Карта').trim().slice(0, 120) || 'Карта',
    section_id: normalizeSafeId(row.section_id || row.sectionId || '', ENTITY_ID_RE) || null,
    board_width: Math.max(5, Math.min(150, Math.trunc(Number(row.board_width || row.boardWidth) || 10))),
    board_height: Math.max(5, Math.min(150, Math.trunc(Number(row.board_height || row.boardHeight) || 10))),
    board_bg_url: String(row.board_bg_url || row.boardBgUrl || '').trim().slice(0, 2048) || null,
    board_bg_storage_path: String(row.board_bg_storage_path || row.boardBgStoragePath || '').trim().slice(0, 512) || null,
    board_bg_storage_bucket: String(row.board_bg_storage_bucket || row.boardBgStorageBucket || '').trim().slice(0, 120) || null,
    grid_alpha: clampNumber(row.grid_alpha ?? row.gridAlpha, 0, 1, 1),
    wall_alpha: clampNumber(row.wall_alpha ?? row.wallAlpha, 0, 1, 1)
  };
}

async function handleMapMetaRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const row = cleanMapMetaRow(ctx, data.row || data);
  const { rows } = await pool.query(
    `
      insert into public.room_map_meta (
        room_id, map_id, name, section_id, board_width, board_height,
        board_bg_url, board_bg_storage_path, board_bg_storage_bucket,
        grid_alpha, wall_alpha, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict (room_id, map_id)
      do update set
        name = excluded.name,
        section_id = excluded.section_id,
        board_width = excluded.board_width,
        board_height = excluded.board_height,
        board_bg_url = excluded.board_bg_url,
        board_bg_storage_path = excluded.board_bg_storage_path,
        board_bg_storage_bucket = excluded.board_bg_storage_bucket,
        grid_alpha = excluded.grid_alpha,
        wall_alpha = excluded.wall_alpha,
        updated_at = now()
      returning *
    `,
    [
      row.room_id,
      row.map_id,
      row.name,
      row.section_id,
      row.board_width,
      row.board_height,
      row.board_bg_url,
      row.board_bg_storage_path,
      row.board_bg_storage_bucket,
      row.grid_alpha,
      row.wall_alpha
    ]
  );
  const payload = { type: 'mapMetaRow', roomId: ctx.roomId, row: rows[0] };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleMapMetaDelete(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const mapId = normalizeSafeId(data.row?.map_id || data.mapId || data.map_id, ENTITY_ID_RE);
  if (!mapId) throw new Error('map_id required');
  await Promise.all([
    pool.query('delete from public.room_map_meta where room_id = $1 and map_id = $2', [ctx.roomId, mapId]),
    pool.query('delete from public.room_walls where room_id = $1 and map_id = $2', [ctx.roomId, mapId]),
    pool.query('delete from public.room_marks where room_id = $1 and map_id = $2', [ctx.roomId, mapId]),
    pool.query('delete from public.room_fog where room_id = $1 and map_id = $2', [ctx.roomId, mapId]),
    pool.query('delete from public.room_tokens where room_id = $1 and map_id = $2', [ctx.roomId, mapId])
  ]);
  const payload = { type: 'mapMetaDelete', roomId: ctx.roomId, row: { map_id: mapId } };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

function cleanWallRow(ctx, raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const mapId = normalizeSafeId(row.map_id || row.mapId, ENTITY_ID_RE);
  const dir = String(row.dir || '').trim().toUpperCase();
  const x = Math.trunc(Number(row.x));
  const y = Math.trunc(Number(row.y));
  if (!mapId || !Number.isFinite(x) || !Number.isFinite(y) || !['N', 'E', 'S', 'W'].includes(dir)) {
    throw new Error('Invalid wall row');
  }
  return {
    room_id: ctx.roomId,
    map_id: mapId,
    x,
    y,
    dir,
    wall_type: String(row.wall_type || row.type || 'stone').trim().slice(0, 40) || 'stone',
    thickness: Math.max(1, Math.min(12, Math.trunc(Number(row.thickness) || 4)))
  };
}

async function handleWallRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const row = cleanWallRow(ctx, data.row || data);
  const { rows } = await pool.query(
    `
      insert into public.room_walls(room_id, map_id, x, y, dir, wall_type, thickness, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,now())
      on conflict (room_id, map_id, x, y, dir)
      do update set wall_type = excluded.wall_type, thickness = excluded.thickness, updated_at = now()
      returning *
    `,
    [row.room_id, row.map_id, row.x, row.y, row.dir, row.wall_type, row.thickness]
  );
  const payload = { type: 'wallRow', roomId: ctx.roomId, row: rows[0] };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleWallDelete(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const row = cleanWallRow(ctx, data.row || data);
  await pool.query(
    'delete from public.room_walls where room_id = $1 and map_id = $2 and x = $3 and y = $4 and dir = $5',
    [row.room_id, row.map_id, row.x, row.y, row.dir]
  );
  const payload = { type: 'wallDelete', roomId: ctx.roomId, row };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

function normalizeMarkPayload(raw, ctx, existingOwnerId = '') {
  const mark = cloneJson(raw) || {};
  const id = normalizeSafeId(mark.id || mark.mark_id, ENTITY_ID_RE);
  const mapId = normalizeSafeId(mark.mapId || mark.map_id, ENTITY_ID_RE);
  const kind = String(mark.kind || '').trim().toLowerCase();
  if (!id || !mapId || !['rect', 'circle', 'poly', 'pin'].includes(kind)) throw new Error('Invalid mark');
  mark.id = id;
  mark.mapId = mapId;
  mark.kind = kind;
  mark.ownerId = ctx.role === 'GM'
    ? (normalizeSafeId(mark.ownerId || existingOwnerId || ctx.userId, USER_ID_RE) || ctx.userId)
    : ctx.userId;
  return mark;
}

async function getMarkRow(roomId, mapId, markId) {
  const { rows } = await pool.query(
    `
      select room_id, map_id, mark_id, owner_id, kind, payload
      from public.room_marks
      where room_id = $1 and map_id = $2 and mark_id = $3
      limit 1
    `,
    [roomId, mapId, markId]
  );
  return rows[0] || null;
}

async function handleMarkRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const raw = data.row?.payload || data.row?.mark || data.mark || data.row || data;
  const provisionalMapId = normalizeSafeId(raw?.mapId || raw?.map_id, ENTITY_ID_RE);
  const provisionalId = normalizeSafeId(raw?.id || raw?.mark_id, ENTITY_ID_RE);
  const existing = provisionalMapId && provisionalId ? await getMarkRow(ctx.roomId, provisionalMapId, provisionalId) : null;
  if (existing && ctx.role !== 'GM' && String(existing.owner_id || '') !== ctx.userId) {
    throw new Error('You cannot edit this mark');
  }
  const mark = normalizeMarkPayload(raw, ctx, existing?.owner_id || '');
  const { rows } = await pool.query(
    `
      insert into public.room_marks(room_id, map_id, mark_id, owner_id, kind, payload, updated_at)
      values ($1,$2,$3,$4,$5,$6,now())
      on conflict (room_id, map_id, mark_id)
      do update set owner_id = excluded.owner_id, kind = excluded.kind, payload = excluded.payload, updated_at = now()
      returning *
    `,
    [ctx.roomId, mark.mapId, mark.id, mark.ownerId, mark.kind, mark]
  );
  const payload = { type: 'markRow', roomId: ctx.roomId, row: rows[0] };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleMarkDelete(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const mapId = normalizeSafeId(data.row?.map_id || data.mapId || data.map_id, ENTITY_ID_RE);
  const markId = normalizeSafeId(data.row?.mark_id || data.id || data.markId || data.mark_id, ENTITY_ID_RE);
  if (!mapId || !markId) throw new Error('map_id/mark_id required');
  const existing = await getMarkRow(ctx.roomId, mapId, markId);
  if (!existing) return;
  if (ctx.role !== 'GM' && String(existing.owner_id || '') !== ctx.userId) {
    throw new Error('You cannot delete this mark');
  }
  await pool.query(
    'delete from public.room_marks where room_id = $1 and map_id = $2 and mark_id = $3',
    [ctx.roomId, mapId, markId]
  );
  const payload = { type: 'markDelete', roomId: ctx.roomId, row: { map_id: mapId, mark_id: markId } };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleMarksReplace(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const mapId = normalizeSafeId(data.mapId || data.map_id, ENTITY_ID_RE);
  if (!mapId) throw new Error('mapId required');

  if (ctx.role === 'GM') {
    const rowsIn = Array.isArray(data.rows) ? data.rows.slice(0, 1000) : [];
    await withTransaction(async (client) => {
      await client.query('delete from public.room_marks where room_id = $1 and map_id = $2', [ctx.roomId, mapId]);
      for (const item of rowsIn) {
        const raw = item?.payload || item?.mark || item;
        const mark = normalizeMarkPayload({ ...raw, mapId }, ctx, item?.owner_id || raw?.ownerId || '');
        await client.query(
          `
            insert into public.room_marks(room_id, map_id, mark_id, owner_id, kind, payload, updated_at)
            values ($1,$2,$3,$4,$5,$6,now())
            on conflict (room_id, map_id, mark_id)
            do update set owner_id = excluded.owner_id, kind = excluded.kind, payload = excluded.payload, updated_at = now()
          `,
          [ctx.roomId, mapId, mark.id, mark.ownerId, mark.kind, mark]
        );
      }
    });
  } else {
    await pool.query(
      'delete from public.room_marks where room_id = $1 and map_id = $2 and owner_id = $3',
      [ctx.roomId, mapId, ctx.userId]
    );
  }

  const { rows } = await pool.query(
    `
      select room_id, map_id, mark_id, owner_id, kind, payload, updated_at
      from public.room_marks
      where room_id = $1 and map_id = $2
      order by updated_at asc
    `,
    [ctx.roomId, mapId]
  );
  const payload = { type: 'marksReplace', roomId: ctx.roomId, mapId, rows };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

function cleanFogRow(ctx, raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const mapId = normalizeSafeId(row.map_id || row.mapId, ENTITY_ID_RE);
  if (!mapId) throw new Error('map_id required');
  const settingsRaw = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const settings = {
    enabled: boolFrom(settingsRaw.enabled, false),
    mode: String(settingsRaw.mode || 'manual') === 'dynamic' ? 'dynamic' : 'manual',
    manualBase: String(settingsRaw.manualBase || settingsRaw.manual_base || 'hide') === 'reveal' ? 'reveal' : 'hide',
    visionRadius: clampNumber(settingsRaw.visionRadius ?? settingsRaw.vision_radius, 1, 60, 8),
    useWalls: boolFrom(settingsRaw.useWalls ?? settingsRaw.use_walls, true),
    exploredEnabled: boolFrom(settingsRaw.exploredEnabled ?? settingsRaw.explored_enabled, true),
    gmViewMode: String(settingsRaw.gmViewMode || settingsRaw.gm_view_mode || 'gm') === 'player' ? 'player' : 'gm',
    gmOpen: boolFrom(settingsRaw.gmOpen ?? settingsRaw.gm_open, false),
    moveOnlyExplored: boolFrom(settingsRaw.moveOnlyExplored ?? settingsRaw.move_only_explored, false)
  };
  const manualStamps = Array.isArray(row.manual_stamps) ? cloneJson(row.manual_stamps).slice(-5000) : [];
  return {
    room_id: ctx.roomId,
    map_id: mapId,
    settings,
    manual_stamps: manualStamps,
    explored_packed: String(row.explored_packed || '').slice(0, 250000)
  };
}

function fogJsonParam(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

async function handleFogRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const row = cleanFogRow(ctx, data.row || data);
  const { rows } = await pool.query(
    `
      insert into public.room_fog(room_id, map_id, settings, manual_stamps, explored_packed, updated_at)
      values ($1,$2,$3,$4,$5,now())
      on conflict (room_id, map_id)
      do update set settings = excluded.settings, manual_stamps = excluded.manual_stamps,
                    explored_packed = excluded.explored_packed, updated_at = now()
      returning *
    `,
    [row.room_id, row.map_id, fogJsonParam(row.settings, {}), fogJsonParam(row.manual_stamps, []), row.explored_packed]
  );
  const payload = { type: 'fogRow', roomId: ctx.roomId, row: rows[0] };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleFogDelete(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const mapId = normalizeSafeId(data.row?.map_id || data.mapId || data.map_id, ENTITY_ID_RE);
  if (!mapId) throw new Error('map_id required');
  await pool.query('delete from public.room_fog where room_id = $1 and map_id = $2', [ctx.roomId, mapId]);
  const payload = { type: 'fogDelete', roomId: ctx.roomId, row: { map_id: mapId } };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

function cleanMusicPayload(raw) {
  const incoming = raw && typeof raw === 'object' ? cloneJson(raw) : {};
  const tracks = Array.isArray(incoming.tracks) ? incoming.tracks.slice(0, 10).map((t) => ({
    id: normalizeSafeId(t?.id, ENTITY_ID_RE),
    name: String(t?.name || '').slice(0, 160),
    desc: String(t?.desc || t?.description || '').slice(0, 500),
    description: String(t?.description || t?.desc || '').slice(0, 500),
    url: String(t?.url || '').slice(0, 2048),
    path: String(t?.path || '').slice(0, 512),
    storageKey: String(t?.storageKey || '').slice(0, 512),
    deleteKey: String(t?.deleteKey || '').slice(0, 512),
    source: String(t?.source || '').slice(0, 80),
    fileName: String(t?.fileName || '').slice(0, 180),
    createdAt: String(t?.createdAt || '').slice(0, 80)
  })).filter((t) => t.id && (t.url || t.path)) : [];
  return {
    tracks,
    currentTrackId: incoming.currentTrackId ? normalizeSafeId(incoming.currentTrackId, ENTITY_ID_RE) : null,
    isPlaying: !!incoming.isPlaying,
    startedAt: Math.max(0, Number(incoming.startedAt) || 0),
    pausedAt: Math.max(0, Number(incoming.pausedAt) || 0),
    volume: clampNumber(incoming.volume, 0, 100, 40)
  };
}

async function handleMusicRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const payloadData = data.row?.payload || data.bgMusic || data.payload || {};
  const music = cleanMusicPayload(payloadData);
  const { rows } = await pool.query(
    `
      insert into public.room_music_state(room_id, payload, updated_at)
      values ($1,$2,now())
      on conflict (room_id)
      do update set payload = excluded.payload, updated_at = now()
      returning *
    `,
    [ctx.roomId, music]
  );
  const payload = { type: 'musicRow', roomId: ctx.roomId, row: rows[0] };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleMusicDelete(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  await pool.query('delete from public.room_music_state where room_id = $1', [ctx.roomId]);
  const payload = { type: 'musicDelete', roomId: ctx.roomId };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleUsersRequest(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  await broadcastUsersSnapshot(ctx.roomId);
}

async function handlePresenceTouch(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  await touchRoomMember(ctx.roomId, ctx.userId);
  send(ws, { type: 'presenceTouched', roomId: ctx.roomId, ts: Date.now() });
}

async function handleLeaveRoom(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  await pool.query('delete from public.room_members where room_id = $1 and user_id = $2', [ctx.roomId, ctx.userId]);
  const roomSet = rooms.get(ctx.roomId);
  if (roomSet) {
    roomSet.delete(ws);
    if (roomSet.size === 0) rooms.delete(ctx.roomId);
  }
  ws.currentRoomId = null;
  ws.roomContext = null;
  send(ws, { type: 'leftRoom', roomId: ctx.roomId });
  await broadcastUsersSnapshot(ctx.roomId).catch(() => {});
}

async function handleLogRow(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  const text = String(data.row?.text || data.text || '').trim();
  if (!text) throw new Error('log text required');
  const localNonce = String(data.row?.localNonce || data.row?.nonce || '').trim();
  let rows = [];
  if (!localNonce) {
    const result = await pool.query(
      `
        select id, room_id, text, created_at
        from public.room_log
        where room_id = $1
          and text = $2
          and created_at > now() - interval '20 seconds'
        order by created_at desc
        limit 1
      `,
      [ctx.roomId, text]
    );
    rows = result.rows || [];
  }
  const optimisticRow = {
    id: String(data.row?.id || localNonce).trim() || null,
    room_id: ctx.roomId,
    text,
    created_at: String(data.row?.created_at || new Date().toISOString()),
    localNonce
  };
  const payload = {
    type: 'logRow',
    roomId: ctx.roomId,
    row: rows[0] || optimisticRow,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleDiceEventRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  const event = data.event && typeof data.event === 'object' ? cloneJson(data.event) : null;
  if (!event) throw new Error('dice event required');
  const localNonce = String(event.localNonce || '').trim();
  let rows = [];
  if (!localNonce) {
    const result = await pool.query(
      `
        select id, room_id, created_at, from_id, from_name, kind_text, sides, count, bonus, rolls, total, crit
        from public.room_dice_events
        where room_id = $1
          and created_at > now() - interval '20 seconds'
        order by created_at desc
        limit 25
      `,
      [ctx.roomId]
    );
    rows = result.rows || [];
  }
  const kind = String(event.kindText || '').trim();
  const total = event.total === null || typeof event.total === 'undefined' ? null : Number(event.total);
  let match = rows.find((row) => {
    if (kind && String(row.kind_text || '') !== kind) return false;
    if (total !== null && Number(row.total) !== total) return false;
    return true;
  });
  const incomingRolls = Array.isArray(event.rolls)
    ? event.rolls.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value))
    : [];
  const safeSides = Math.max(2, Math.min(100, Math.trunc(Number(event.sides) || 20)));
  const safeCount = Math.max(1, Math.min(20, Math.trunc(Number(event.count) || incomingRolls.length || 1)));
  const safeBonus = Math.max(-1000, Math.min(1000, Math.trunc(Number(event.bonus) || 0)));
  const safeRolls = incomingRolls.length ? incomingRolls.slice(0, safeCount) : [];
  const safeTotal = Number.isFinite(Number(event.total))
    ? Math.max(-10000, Math.min(10000, Math.trunc(Number(event.total))))
    : safeRolls.reduce((sum, value) => sum + value, 0) + safeBonus;
  const safeCrit = String(event.crit || '').trim();
  if (!match) {
    match = {
      from_id: String(event.fromId || ctx.userId),
      from_name: sanitizeText(event.fromName || ctx.name, 'Player', 120),
      kind_text: sanitizeText(event.kindText, `d${safeSides}`, 200),
      sides: safeSides,
      count: safeCount,
      bonus: safeBonus,
      rolls: safeRolls,
      total: safeTotal,
      crit: (safeCrit === 'crit-success' || safeCrit === 'crit-fail') ? safeCrit : ''
    };
  }
  const payload = {
    type: 'diceEvent',
    roomId: ctx.roomId,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied,
    event: {
      fromId: String(match.from_id || ctx.userId),
      fromName: String(match.from_name || ctx.name || 'Игрок'),
      kindText: String(match.kind_text || ''),
      sides: match.sides,
      count: match.count,
      bonus: match.bonus,
      rolls: Array.isArray(match.rolls) ? match.rolls : [],
      total: match.total,
      crit: String(match.crit || ''),
      localNonce: String(match.localNonce || event.localNonce || '').trim()
    }
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleRoomUpdatedRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  if (ctx.ownerId && ctx.ownerId !== ctx.userId) throw new Error('Only room owner can update room metadata');
  const row = await fetchRoomStateRow(ctx.roomId);
  const payload = {
    type: 'roomUpdated',
    roomId: ctx.roomId,
    room: {
      id: ctx.roomId,
      name: String(row?.name || ''),
      scenario: String(row?.scenario || ''),
      hasPassword: !!(row?.has_password || row?.password_hash),
      ownerId: ctx.ownerId,
      ownerName: getStateRoomMeta(row?.state || {}).ownerName
    }
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleRoomDeletedRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  if (ctx.ownerId && ctx.ownerId !== ctx.userId) throw new Error('Only room owner can delete room');
  const payload = {
    type: 'roomDeleted',
    roomId: ctx.roomId,
    roomName: String(data.roomName || ctx.room?.name || 'Комната').slice(0, 160)
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleModerationEventRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const row = await fetchRoomStateRow(ctx.roomId);
  const event = row?.state?.roomAccess?.moderationEvent || null;
  if (!event) throw new Error('No moderation event in current room state');
  const payload = { type: 'moderationEvent', roomId: ctx.roomId, event };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleTokenRowDeletedRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  const tokenId = normalizeSafeId(data.row?.token_id || data.tokenId || data.token_id, ENTITY_ID_RE);
  const mapId = normalizeSafeId(data.row?.map_id || data.mapId || data.map_id || '', ENTITY_ID_RE);
  if (!tokenId) throw new Error('token_id required');
  const player = findPlayerById(ctx.state || {}, tokenId);
  if (player) ensureCanControlPlayer(ctx, player);
  else ensureGm(ctx);
  if (mapId) {
    await pool.query('delete from public.room_tokens where room_id = $1 and map_id = $2 and token_id = $3', [ctx.roomId, mapId, tokenId]);
  } else {
    await pool.query('delete from public.room_tokens where room_id = $1 and token_id = $2', [ctx.roomId, tokenId]);
  }
  const payload = { type: 'tokenRowDeleted', roomId: ctx.roomId, row: { room_id: ctx.roomId, map_id: mapId || undefined, token_id: tokenId } };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

const INVENTORY_TRANSFER_TABS = new Set([
  'weapons',
  'armor',
  'adventuring_gear',
  'tools',
  'mounts_animals',
  'tack_vehicles',
  'water_vehicles',
  'trade_goods',
  'lifestyle_expenses',
  'other'
]);

function normalizeInventoryTransferTabId(value) {
  const tabId = String(value || 'other').trim();
  if (!INVENTORY_TRANSFER_TABS.has(tabId)) throw new Error('Invalid inventory tab');
  return tabId;
}

function inventoryItemQty(value) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function ensurePlayerInventoryTab(player, tabId) {
  if (!player.sheet || typeof player.sheet !== 'object') player.sheet = { parsed: {} };
  if (!player.sheet.parsed || typeof player.sheet.parsed !== 'object') player.sheet.parsed = {};
  if (!player.sheet.parsed.inventory || typeof player.sheet.parsed.inventory !== 'object') {
    player.sheet.parsed.inventory = { activeTab: tabId };
  }
  if (!Array.isArray(player.sheet.parsed.inventory[tabId])) player.sheet.parsed.inventory[tabId] = [];
  return player.sheet.parsed.inventory[tabId];
}

function rememberAppliedInventoryTransfer(state, offerId) {
  const id = String(offerId || '').trim();
  if (!id) return false;
  const prev = Array.isArray(state.inventoryTransferHistory) ? state.inventoryTransferHistory : [];
  if (prev.some((item) => String(item?.id || '') === id)) return true;
  state.inventoryTransferHistory = prev
    .slice(-49)
    .concat([{ id, at: Date.now() }]);
  return false;
}

function rememberAppliedCoinsTransfer(state, transferId) {
  const id = String(transferId || '').trim();
  if (!id) return false;
  const prev = Array.isArray(state.coinsTransferHistory) ? state.coinsTransferHistory : [];
  if (prev.some((item) => String(item?.id || '') === id)) return true;
  state.coinsTransferHistory = prev
    .slice(-49)
    .concat([{ id, at: Date.now() }]);
  return false;
}

function buildSheetPlayerPatches(state, playerIds) {
  const wanted = new Set((Array.isArray(playerIds) ? playerIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  if (!wanted.size) return [];
  return getStatePlayers(state)
    .filter((player) => player && wanted.has(String(player.id || '')))
    .map((player) => ({
      playerId: String(player.id || ''),
      patch: {
        sheet: cloneJson(player.sheet) || { parsed: {} },
        sheetUpdatedAt: Math.max(0, Number(player.sheetUpdatedAt) || Date.now()),
        name: String(player.name || '')
      }
    }));
}

function ensurePlayerCoins(player) {
  if (!player.sheet || typeof player.sheet !== 'object') player.sheet = { parsed: {} };
  if (!player.sheet.parsed || typeof player.sheet.parsed !== 'object') player.sheet.parsed = {};
  if (!player.sheet.parsed.coins || typeof player.sheet.parsed.coins !== 'object') {
    player.sheet.parsed.coins = { cp: { value: 0 }, sp: { value: 0 }, ep: { value: 0 }, gp: { value: 0 }, pp: { value: 0 } };
  }
  const coins = player.sheet.parsed.coins;
  ['cp', 'sp', 'ep', 'gp', 'pp'].forEach((key) => {
    if (!coins[key] || typeof coins[key] !== 'object') coins[key] = { value: 0 };
    coins[key].value = Math.max(0, Number(coins[key].value) || 0);
  });
  return coins;
}

async function applyAcceptedInventoryTransfer(ctx, body) {
  return withTransaction(async (client) => {
    const hasTransferDetails = !!body
      && typeof body.tabId !== 'undefined'
      && typeof body.itemIdx !== 'undefined'
      && typeof body.qty !== 'undefined';
    if (!hasTransferDetails) throw new Error('Transfer details required');

    const { rows } = await client.query(
      'select state from public.room_state where room_id = $1 for update',
      [ctx.roomId]
    );
    const currentState = cloneJson(rows[0]?.state || {}) || {};
    if (rememberAppliedInventoryTransfer(currentState, body?.id)) {
      const publicState = stripRoomSecretsFromState(sanitizeRoomStateForStorage(syncActiveMapCombatStateServer(currentState)));
      return { state: publicState, playerPatches: [] };
    }

    const fromPlayerId = normalizeSafeId(body?.fromPlayerId, ENTITY_ID_RE);
    const toPlayerId = normalizeSafeId(body?.toPlayerId, ENTITY_ID_RE);
    const tabId = normalizeInventoryTransferTabId(body?.tabId);
    const itemIdx = Math.max(0, Math.trunc(Number(body?.itemIdx) || 0));
    const qty = Math.max(1, Math.trunc(Number(body?.qty) || 1));
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) throw new Error('Invalid transfer players');

    const players = Array.isArray(currentState.players) ? currentState.players : [];
    const fromPlayer = players.find((player) => player && String(player.id || '') === fromPlayerId);
    const toPlayer = players.find((player) => player && String(player.id || '') === toPlayerId);
    if (!fromPlayer || !toPlayer || !toPlayer.isBase) throw new Error('Transfer player not found');
    if (String(toPlayer.ownerId || '') !== ctx.userId) throw new Error('Only the target owner can answer this transfer');

    const fromItems = fromPlayer?.sheet?.parsed?.inventory?.[tabId];
    if (!Array.isArray(fromItems) || itemIdx < 0 || itemIdx >= fromItems.length) {
      throw new Error('Transfer item is no longer available');
    }

    const fromItem = fromItems[itemIdx];
    const currentQty = inventoryItemQty(fromItem?.qty);
    if (qty > currentQty) throw new Error('Not enough item quantity for transfer');

    const expectedItemId = String(body?.itemId || '').trim();
    if (expectedItemId && String(fromItem?.id || '') !== expectedItemId) {
      throw new Error('Transfer item has changed');
    }

    const targetArr = ensurePlayerInventoryTab(toPlayer, tabId);
    const fromItemId = String(fromItem?.id || '').trim();
    const same = fromItemId
      ? targetArr.find((item) => String(item?.id || '') === fromItemId)
      : null;
    if (same) {
      same.qty = Math.max(0, Math.trunc(Number(same?.qty) || 0)) + qty;
    } else {
      const cloned = cloneJson(fromItem) || {};
      cloned.qty = qty;
      targetArr.push(cloned);
    }

    const nextQty = currentQty - qty;
    if (nextQty <= 0) {
      fromItems.splice(itemIdx, 1);
      try {
        if (tabId === 'weapons' && Array.isArray(fromPlayer?.sheet?.parsed?.weaponsList)) {
          const invId = String(fromItem?.id || '').trim();
          if (invId) {
            fromPlayer.sheet.parsed.weaponsList = fromPlayer.sheet.parsed.weaponsList
              .filter((weapon) => String(weapon?.invId || '') !== invId);
          }
        }
      } catch {}
    } else {
      fromItem.qty = nextQty;
    }

    const transferTs = Math.max(
      Date.now(),
      Number(fromPlayer.sheetUpdatedAt) || 0,
      Number(toPlayer.sheetUpdatedAt) || 0,
      Number(body?.createdAt) || 0
    ) + 1;
    fromPlayer.sheetUpdatedAt = transferTs;
    toPlayer.sheetUpdatedAt = transferTs;

    const nextState = sanitizeRoomStateForStorage(syncActiveMapCombatStateServer(currentState));
    const stateUpdate = await client.query(
      `
        insert into public.room_state(room_id, phase, current_actor_id, state, updated_at)
        values ($1,$2,$3,$4,now())
        on conflict (room_id)
        do update set phase = excluded.phase,
                      current_actor_id = excluded.current_actor_id,
                      state = excluded.state,
                      updated_at = now()
        returning updated_at
      `,
      [
        ctx.roomId,
        String(nextState.phase || 'lobby'),
        Array.isArray(nextState.turnOrder) ? (nextState.turnOrder[Math.max(0, Number(nextState.currentTurnIndex) || 0)] || null) : null,
        nextState
      ]
    );
    rememberRoomStateValue(ctx.roomId, nextState, stateUpdate.rows?.[0]?.updated_at || new Date().toISOString(), ctx.room || {});

    const publicState = stripRoomSecretsFromState(nextState);
    return {
      state: publicState,
      playerPatches: buildSheetPlayerPatches(publicState, [fromPlayerId, toPlayerId])
    };
  });
}

async function applyAcceptedCoinsTransfer(ctx, body) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'select state from public.room_state where room_id = $1 for update',
      [ctx.roomId]
    );
    const currentState = cloneJson(rows[0]?.state || {}) || {};

    const fromPlayerId = normalizeSafeId(body?.fromPlayerId, ENTITY_ID_RE);
    const toPlayerId = normalizeSafeId(body?.toPlayerId, ENTITY_ID_RE);
    const coin = String(body?.coin || 'gp').trim().toLowerCase();
    const amount = Math.max(1, Math.min(1000000000, Math.trunc(Number(body?.amount) || 1)));
    const validCoins = new Set(['cp', 'sp', 'ep', 'gp', 'pp']);
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) throw new Error('Invalid transfer players');
    if (!validCoins.has(coin)) throw new Error('Invalid coin type');

    const players = Array.isArray(currentState.players) ? currentState.players : [];
    const fromPlayer = players.find((player) => player && String(player.id || '') === fromPlayerId);
    const toPlayer = players.find((player) => player && String(player.id || '') === toPlayerId);
    if (!fromPlayer || !toPlayer || !toPlayer.isBase) throw new Error('Transfer player not found');
    if (ctx.role !== 'GM' && String(fromPlayer.ownerId || '') !== ctx.userId) throw new Error('You cannot transfer coins from this player');

    const publicCurrentState = () => stripRoomSecretsFromState(sanitizeRoomStateForStorage(syncActiveMapCombatStateServer(currentState)));
    if (rememberAppliedCoinsTransfer(currentState, body?.id)) {
      return {
        accepted: true,
        state: publicCurrentState(),
        playerPatches: []
      };
    }

    const fromCoins = ensurePlayerCoins(fromPlayer);
    const toCoins = ensurePlayerCoins(toPlayer);
    if ((Number(fromCoins?.[coin]?.value) || 0) < amount) {
      return {
        accepted: false,
        state: publicCurrentState(),
        playerPatches: []
      };
    }

    fromCoins[coin].value = Math.max(0, Number(fromCoins[coin].value) - amount);
    toCoins[coin].value = Math.max(0, Number(toCoins[coin].value) + amount);

    const transferTs = Math.max(
      Date.now(),
      Number(fromPlayer.sheetUpdatedAt) || 0,
      Number(toPlayer.sheetUpdatedAt) || 0,
      Number(body?.createdAt) || 0
    ) + 1;
    fromPlayer.sheetUpdatedAt = transferTs;
    toPlayer.sheetUpdatedAt = transferTs;

    const nextState = sanitizeRoomStateForStorage(syncActiveMapCombatStateServer(currentState));
    const stateUpdate = await client.query(
      `
        insert into public.room_state(room_id, phase, current_actor_id, state, updated_at)
        values ($1,$2,$3,$4,now())
        on conflict (room_id)
        do update set phase = excluded.phase,
                      current_actor_id = excluded.current_actor_id,
                      state = excluded.state,
                      updated_at = now()
        returning updated_at
      `,
      [
        ctx.roomId,
        String(nextState.phase || 'lobby'),
        Array.isArray(nextState.turnOrder) ? (nextState.turnOrder[Math.max(0, Number(nextState.currentTurnIndex) || 0)] || null) : null,
        nextState
      ]
    );
    rememberRoomStateValue(ctx.roomId, nextState, stateUpdate.rows?.[0]?.updated_at || new Date().toISOString(), ctx.room || {});

    const publicState = stripRoomSecretsFromState(nextState);
    return {
      accepted: true,
      state: publicState,
      playerPatches: buildSheetPlayerPatches(publicState, [fromPlayerId, toPlayerId])
    };
  });
}

async function handleTransferEventRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const eventType = String(data.type || '');
  const body = data.offer || data.result || data.transfer || {};
  if (!body || typeof body !== 'object') throw new Error('transfer payload required');
  const fromPlayerId = normalizeSafeId(body.fromPlayerId, ENTITY_ID_RE);
  const toPlayerId = normalizeSafeId(body.toPlayerId, ENTITY_ID_RE);
  if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) throw new Error('Invalid transfer players');
  const fromPlayer = findPlayerById(ctx.state || {}, fromPlayerId);
  const toPlayer = findPlayerById(ctx.state || {}, toPlayerId);
  if (!fromPlayer || !toPlayer) throw new Error('Transfer player not found');
  const ownsFrom = String(fromPlayer.ownerId || '') === ctx.userId;
  const ownsTo = String(toPlayer.ownerId || '') === ctx.userId;
  if (eventType === 'inventoryTransferResult') {
    if (!ownsTo) throw new Error('Only the target owner can answer this transfer');
  } else if (eventType === 'coinsTransfer') {
    if (ctx.role !== 'GM' && !ownsFrom) throw new Error('You cannot transfer coins from this player');
  } else if (ctx.role !== 'GM' && !ownsFrom && !ownsTo) {
    throw new Error('You cannot relay this transfer');
  }
  const safeBody = cloneJson(body) || {};
  safeBody.fromPlayerId = fromPlayerId;
  safeBody.toPlayerId = toPlayerId;
  safeBody.fromOwnerId = String(fromPlayer.ownerId || '');
  safeBody.toOwnerId = String(toPlayer.ownerId || '');
  safeBody.fromPlayerName = String(fromPlayer.name || safeBody.fromPlayerName || '').slice(0, 160);
  safeBody.toPlayerName = String(toPlayer.name || safeBody.toPlayerName || '').slice(0, 160);
  if (eventType === 'coinsTransfer') {
    const coin = String(safeBody.coin || 'gp').trim().toLowerCase();
    safeBody.coin = ['cp', 'sp', 'ep', 'gp', 'pp'].includes(coin) ? coin : 'gp';
    safeBody.amount = Math.max(1, Math.min(1000000000, Math.trunc(Number(safeBody.amount) || 1)));
  }
  let appliedTransfer = null;
  if (eventType === 'inventoryTransferResult' && safeBody.accepted) {
    appliedTransfer = await applyAcceptedInventoryTransfer(ctx, safeBody);
    ctx.state = appliedTransfer?.state || ctx.state;
  } else if (eventType === 'coinsTransfer') {
    appliedTransfer = await applyAcceptedCoinsTransfer(ctx, safeBody);
    ctx.state = appliedTransfer?.state || ctx.state;
  }
  const payloadKey = data.offer ? 'offer' : 'result';
  const outgoingType = eventType === 'coinsTransfer' ? 'coinsTransferResult' : eventType;
  if (eventType === 'coinsTransfer') {
    const RU = { cp: 'мм', sp: 'см', ep: 'эм', gp: 'зм', pp: 'пм' };
    safeBody.accepted = !!appliedTransfer?.accepted;
    safeBody.message = safeBody.accepted
      ? `Передано ${Math.max(1, Math.trunc(Number(safeBody.amount) || 1))} ${RU[String(safeBody.coin || 'gp').toLowerCase()] || safeBody.coin || 'зм'} игроку ${safeBody.toPlayerName || 'получатель'}.`
      : 'Передача монет не удалась: недостаточно средств.';
  }
  if (appliedTransfer?.playerPatches?.length) {
    for (const item of appliedTransfer.playerPatches) {
      const patchPayload = {
        type: 'playerPatch',
        roomId: ctx.roomId,
        playerId: item.playerId,
        patch: item.patch
      };
      send(ws, patchPayload);
      broadcastToRoom(ctx.roomId, patchPayload, ws);
    }
  }
  const payload = { type: outgoingType, roomId: ctx.roomId, [payloadKey]: safeBody };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handlePlayerPatchRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensurePlayerOrGm(ctx);
  const playerId = normalizeSafeId(data.playerId || data.id, ENTITY_ID_RE);
  if (!playerId) throw new Error('playerId required');

  let patch;
  await mutateRoomState(ctx, (state) => {
    const players = Array.isArray(state.players) ? state.players : [];
    const player = players.find((item) => item && String(item.id || '') === playerId);
    if (!player) throw new Error('Player not found');

    const incoming = (data.patch && typeof data.patch === 'object') ? data.patch : data;
    patch = {};
    const ownsPlayer = String(player.ownerId || '') === ctx.userId;

    if (incoming.sheet && typeof incoming.sheet === 'object') {
      if (ctx.role !== 'GM' && !ownsPlayer) throw new Error('You cannot edit this sheet');
      const incomingTs = Math.max(0, Number(incoming.sheetUpdatedAt) || Date.now());
      if (incomingTs >= Number(player.sheetUpdatedAt || 0)) {
        player.sheet = cloneJson(incoming.sheet) || { parsed: {} };
        player.sheetUpdatedAt = incomingTs;
      }
      patch.sheet = cloneJson(player.sheet) || { parsed: {} };
      patch.sheetUpdatedAt = player.sheetUpdatedAt;
      try {
        const parsed = patch.sheet?.parsed || {};
        const nextName = parsed?.name?.value ?? parsed?.name;
        if (typeof nextName === 'string' && nextName.trim()) {
          patch.name = sanitizeText(nextName, String(player.name || 'Player'), 160);
          player.name = patch.name;
        }
      } catch {}
    }

    if (typeof incoming.isPublic === 'boolean') {
      ensureGm(ctx);
      const ownerRole = String(player.ownerRole || '').trim();
      if (ownerRole !== 'GM' || player.isAlly) throw new Error('Visibility can be changed only for GM non-ally tokens');
      patch.isPublic = !!incoming.isPublic;
      player.isPublic = patch.isPublic;
    }

    if (!Object.keys(patch).length) throw new Error('Empty player patch');
    return state;
  });

  const payload = {
    type: 'playerPatch',
    roomId: ctx.roomId,
    playerId,
    patch,
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);

  ws.roomContext = null;
}

async function handleInitiativeLiveRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  const eventType = String(data.type || '');
  if (eventType === 'initiativeReset') {
    ensureGm(ctx);
    const epoch = Math.max(0, Math.trunc(Number(data.epoch) || Date.now()));
    await mutateRoomState(ctx, (state) => {
      if (epoch < Number(state.initiativeEpoch || 0)) throw new Error('Stale initiative reset');
      if (epoch === Number(state.initiativeEpoch || 0)) return state;
      state.phase = 'initiative';
      state.phaseEpoch = Math.max(Number(state.phaseEpoch || 0), epoch);
      state.initiativeEpoch = epoch;
      state.turnOrder = [];
      state.currentTurnIndex = 0;
      state.round = 1;
      for (const player of getStatePlayers(state)) {
        player.initiative = null;
        player.hasRolledInitiative = false;
        player.pendingInitiativeChoice = false;
        player.willJoinNextRound = false;
      }
      return syncActiveMapCombatStateServer(state);
    });
    const payload = {
      type: 'initiativeReset',
      roomId: ctx.roomId,
      epoch,
      __fromWsClient: data.__fromWsClient,
      __optimisticApplied: !!data.__optimisticApplied
    };
    send(ws, payload);
    broadcastToRoom(ctx.roomId, payload, ws);
    return;
  }

  ensurePlayerOrGm(ctx);
  const updates = Array.isArray(data.updates) ? data.updates.slice(0, 100) : [];
  const safeUpdates = [];
  await mutateRoomState(ctx, (state) => {
    const epoch = Math.max(0, Number(data.epoch) || 0);
    if (String(state.phase) !== 'initiative' || (epoch && epoch !== Number(state.initiativeEpoch || 0))) {
      throw new Error('Initiative phase has changed');
    }
    for (const item of updates) {
      const playerId = normalizeSafeId(item?.playerId, ENTITY_ID_RE);
      const total = Math.trunc(Number(item?.total));
      if (!playerId || !Number.isFinite(total)) continue;
      const player = findPlayerById(state, playerId);
      if (!player) continue;
      if (ctx.role !== 'GM' && String(player.ownerId || '') !== ctx.userId) continue;
      if (!player.inCombat) continue;
      if (!player.hasRolledInitiative) {
        player.initiative = Math.max(-100, Math.min(200, total));
        player.hasRolledInitiative = true;
        player.pendingInitiativeChoice = false;
      }
      safeUpdates.push({ playerId, total: player.initiative });
    }
    if (!safeUpdates.length) throw new Error('No authorized initiative updates');
    return syncActiveMapCombatStateServer(state);
  });
  ws.roomContext = null;
  const payload = {
    type: 'initiativeApplied',
    roomId: ctx.roomId,
    updates: safeUpdates,
    epoch: Math.max(0, Math.trunc(Number(data.epoch) || 0)),
    __fromWsClient: data.__fromWsClient,
    __optimisticApplied: !!data.__optimisticApplied
  };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleTokensInitRelay(ws, data) {
  const ctx = await loadWsRoomContext(ws, data.roomId || ws.currentRoomId);
  ensureGm(ctx);
  const mapId = normalizeSafeId(data.mapId || data.map_id || getActiveMapId(ctx.state || {}), ENTITY_ID_RE);
  if (!mapId) throw new Error('mapId required');
  const { rows } = await pool.query(
    `
      select room_id, map_id, token_id, owner_id, x, y, size, color, is_public, updated_at
      from public.room_tokens
      where room_id = $1 and map_id = $2
      order by updated_at asc
    `,
    [ctx.roomId, mapId]
  );
  const payload = { type: 'tokensInit', roomId: ctx.roomId, mapId, rows };
  send(ws, payload);
  broadcastToRoom(ctx.roomId, payload, ws);
}

async function handleMessage(ws, rawMessage) {
  let data;
  try {
    data = JSON.parse(rawMessage.toString());
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  const type = String(data?.type || '').trim();
  ws.currentInboundMeta = {
    wsNonce: String(data?.__wsNonce || '').trim(),
    clientSentAt: Math.max(0, Number(data?.__clientSentAt) || 0),
    serverReceivedAt: Date.now(),
    inboundType: type
  };

  try {
    switch (type) {
      case 'joinRoom':
      case 'joinWsRoom':
        await handleJoinRoom(ws, data);
        break;

      case 'joinTavern':
        await handleJoinTavern(ws, data);
        break;

      case 'ping':
        send(ws, {
          type: 'pong',
          roomId: String(ws.currentRoomId || data.roomId || ''),
          ts: Date.now()
        });
        break;

      case 'pong':
        break;

      case 'presenceTouch':
        await handlePresenceTouch(ws, data);
        break;

      case 'leaveRoom':
        await handleLeaveRoom(ws, data);
        break;

      case 'moveToken':
        await handleMoveToken(ws, data);
        break;

      case 'updateTokenColor':
        await handleUpdateTokenColor(ws, data);
        break;

      case 'updateTokenSize':
        await handleUpdateTokenSize(ws, data);
        break;

      case 'setTokenVisibility':
        await handleSetTokenVisibility(ws, data);
        break;

      case 'removeTokenFromBoard':
        await handleRemoveTokenFromBoard(ws, data);
        break;

      case 'state':
        await handleStateRelay(ws, data);
        break;

      case 'statePatch':
        await handleStatePatchRelay(ws, data);
        break;

      case 'playerCreate':
        await handlePlayerCreateRelay(ws, data);
        break;

      case 'playerDelete':
        await handlePlayerDeleteRelay(ws, data);
        break;

      case 'mapMetaRow':
        await handleMapMetaRow(ws, data);
        break;

      case 'mapMetaDelete':
        await handleMapMetaDelete(ws, data);
        break;

      case 'wallRow':
        await handleWallRow(ws, data);
        break;

      case 'wallDelete':
        await handleWallDelete(ws, data);
        break;

      case 'markRow':
        await handleMarkRow(ws, data);
        break;

      case 'markDelete':
        await handleMarkDelete(ws, data);
        break;

      case 'marksReplace':
        await handleMarksReplace(ws, data);
        break;

      case 'fogRow':
        await handleFogRow(ws, data);
        break;

      case 'fogDelete':
        await handleFogDelete(ws, data);
        break;

      case 'musicRow':
        await handleMusicRow(ws, data);
        break;

      case 'musicDelete':
        await handleMusicDelete(ws, data);
        break;

      case 'users':
      case 'usersSnapshot':
        await handleUsersRequest(ws, data);
        break;

      case 'logRow':
        await handleLogRow(ws, data);
        break;

      case 'tavernLogRow':
        await handleTavernLogRowRelay(ws, data);
        break;

      case 'diceEvent':
        await handleDiceEventRelay(ws, data);
        break;

      case 'roomUpdated':
        await handleRoomUpdatedRelay(ws, data);
        break;

      case 'roomDeleted':
        await handleRoomDeletedRelay(ws, data);
        break;

      case 'moderationEvent':
        await handleModerationEventRelay(ws, data);
        break;

      case 'tokenRowDeleted':
        await handleTokenRowDeletedRelay(ws, data);
        break;

      case 'inventoryTransferOffer':
      case 'inventoryTransferResult':
      case 'coinsTransfer':
      case 'coinsTransferResult':
        await handleTransferEventRelay(ws, data);
        break;

      case 'playerPatch':
        await handlePlayerPatchRelay(ws, data);
        break;

      case 'initiativeReset':
      case 'initiativeApplied':
        await handleInitiativeLiveRelay(ws, data);
        break;

      case 'tokensInit':
        await handleTokensInitRelay(ws, data);
        break;

      default: {
        send(ws, { type: 'error', message: `Unsupported WebSocket event type: ${type || '(empty)'}` });
        break;
      }
    }
  } catch (err) {
    send(ws, { type: 'error', message: err?.message || 'Server error' });
  } finally {
    ws.currentInboundMeta = null;
  }
}

wss.on('connection', (ws) => {
  ws.currentRoomId = null;
  ws.userId = '';
  ws.userName = '';
  ws.role = '';
  ws.roomContext = null;
  ws.currentInboundMeta = null;

  ws.on('message', (rawMessage) => {
    handleMessage(ws, rawMessage);
  });

  ws.on('close', () => {
    const roomId = ws.currentRoomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
  });

  ws.on('error', (error) => {
    console.error('WS client error:', error);
  });

  send(ws, { type: 'wsReady' });
});

server.listen(PORT, () => {
  console.log(`HTTP + WebSocket server started on port ${PORT}`);
});
