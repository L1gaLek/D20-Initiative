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

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
  throw new Error('S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required');
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
app.use(express.json({ limit: '2mb' }));

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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
      const roomId = sanitizeRoomId(getRequestValue(req, 'roomId', 'room_id'));
      const trackId = getRequestValue(req, 'trackId', 'track_id') || crypto.randomUUID();
      const file = resolveUploadedFile(req);

      if (!roomId) {
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
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Upload failed'
      });
    }
  });
});

app.delete('/api/uploads/room-audio', async (req, res) => {
  try {
    const deleteKey = getRequestValue(
      req,
      'deleteKey',
      'storageKey',
      'path'
    );

    if (!deleteKey) {
      return res.status(400).json({ ok: false, error: 'deleteKey is required' });
    }

    await s3.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: deleteKey
    }));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[room-audio delete] failed:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Delete failed'
    });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log(`HTTP + WebSocket server starting on port ${PORT}`);

// roomId -> Set<ws>
const rooms = new Map();

function getRoom(roomId) {
  const id = String(roomId || '').trim();
  if (!id) return null;
  if (!rooms.has(id)) rooms.set(id, new Set());
  return rooms.get(id);
}

function send(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcastToRoom(roomId, payload, exceptWs = null) {
  const room = rooms.get(String(roomId || ''));
  if (!room) return;
  const raw = JSON.stringify(payload);

  for (const client of room) {
    if (client === exceptWs) continue;
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  }
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

  const { rows } = await pool.query(sql, values);
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
  const roomId = String(data.roomId || '').trim();
  if (!roomId) {
    send(ws, { type: 'error', message: 'roomId required' });
    return;
  }

  attachClientToRoom(ws, roomId);
  send(ws, { type: 'joinedWsRoom', roomId });
}

async function handleMoveToken(ws, data) {
  const roomId = String(data.roomId || ws.currentRoomId || '').trim();
  const mapId = String(data.mapId || '').trim();
  const tokenId = String(data.tokenId || '').trim();

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'moveToken: roomId/mapId/tokenId required' });
    return;
  }

  attachClientToRoom(ws, roomId);

  const x = Number(data.x);
  const y = Number(data.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    send(ws, { type: 'error', message: 'moveToken: x/y must be numbers' });
    return;
  }

  try {
    const row = await moveTokenV2({
      roomId,
      mapId,
      tokenId,
      tokenName: String(data.tokenName || ''),
      actorUserId: String(data.actorUserId || ''),
      x: Math.trunc(x),
      y: Math.trunc(y)
    });

    if (!row) {
      send(ws, { type: 'error', message: 'moveToken failed' });
      return;
    }

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
      message: err?.message || 'moveToken failed'
    });
  }
}

async function handleUpdateTokenColor(ws, data) {
  const roomId = String(data.roomId || ws.currentRoomId || '').trim();
  const mapId = String(data.mapId || '').trim();
  const tokenId = String(data.tokenId || '').trim();
  const color = data.color == null ? null : String(data.color);

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'updateTokenColor: roomId/mapId/tokenId required' });
    return;
  }

  attachClientToRoom(ws, roomId);

  try {
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: prev?.owner_id || null,
      x: prev?.x ?? null,
      y: prev?.y ?? null,
      size: prev?.size ?? 1,
      color,
      isPublic: prev?.is_public ?? true
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
  const roomId = String(data.roomId || ws.currentRoomId || '').trim();
  const mapId = String(data.mapId || '').trim();
  const tokenId = String(data.tokenId || '').trim();
  const nextSize = Math.max(1, Math.trunc(Number(data.size) || 1));

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'updateTokenSize: roomId/mapId/tokenId required' });
    return;
  }

  attachClientToRoom(ws, roomId);

  try {
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: prev?.owner_id || null,
      x: prev?.x ?? null,
      y: prev?.y ?? null,
      size: nextSize,
      color: prev?.color ?? null,
      isPublic: prev?.is_public ?? true
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
  const roomId = String(data.roomId || ws.currentRoomId || '').trim();
  const mapId = String(data.mapId || '').trim();
  const tokenId = String(data.tokenId || '').trim();
  const isPublic = !!data.isPublic;

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'setTokenVisibility: roomId/mapId/tokenId required' });
    return;
  }

  attachClientToRoom(ws, roomId);

  try {
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: prev?.owner_id || null,
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
  const roomId = String(data.roomId || ws.currentRoomId || '').trim();
  const mapId = String(data.mapId || '').trim();
  const tokenId = String(data.tokenId || '').trim();

  if (!roomId || !mapId || !tokenId) {
    send(ws, { type: 'error', message: 'removeTokenFromBoard: roomId/mapId/tokenId required' });
    return;
  }

  attachClientToRoom(ws, roomId);

  try {
    const prev = await getTokenRow(roomId, mapId, tokenId);
    const row = await upsertTokenRow({
      roomId,
      mapId,
      tokenId,
      ownerId: prev?.owner_id || null,
      x: null,
      y: null,
      size: prev?.size ?? 1,
      color: prev?.color ?? null,
      isPublic: prev?.is_public ?? true
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

async function handleMessage(ws, rawMessage) {
  let data;
  try {
    data = JSON.parse(rawMessage.toString());
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  const type = String(data?.type || '').trim();

  try {
    switch (type) {
      case 'joinRoom':
      case 'joinWsRoom':
        await handleJoinRoom(ws, data);
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

      default: {
        const roomId = String(data.roomId || ws.currentRoomId || '').trim();
        if (!roomId) return;
        attachClientToRoom(ws, roomId);
        broadcastToRoom(roomId, data, ws);
        break;
      }
    }
  } catch (err) {
    send(ws, { type: 'error', message: err?.message || 'Server error' });
  }
}

wss.on('connection', (ws) => {
  ws.currentRoomId = null;

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
