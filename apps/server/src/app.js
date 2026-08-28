'use strict';
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const { createIdentityService } = require('./modules/identity/service.js');
const { createMemoryRoomRepository } = require('./modules/rooms/memory-room-repository.js');
const { createRoomsService } = require('./modules/rooms/service.js');
function buildApp(options) {
  const config = options.config;
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024 });
  const identity = options.identity || createIdentityService({ sessionSecret: config.sessionSecret });
  const rooms = options.rooms || createRoomsService({ repository: options.roomRepository || createMemoryRoomRepository() });
  app.register(cors, { origin(origin, callback) { if (!origin || config.allowedOrigins.includes(origin)) callback(null, true); else callback(new Error('Origin is not allowed'), false); } });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.setErrorHandler((error, request, reply) => { const status = Number(error.statusCode) >= 400 ? Number(error.statusCode) : 500; request.log.warn({ err: error, status }, 'request failed'); reply.code(status).send({ ok: false, error: status >= 500 ? 'Internal server error' : error.message }); });
  app.addHook('onSend', async (request, reply, payload) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Referrer-Policy', 'no-referrer'); return payload; });
  async function requireActor(request, reply) { const actor = identity.authenticate(request.headers.authorization); if (!actor) return reply.code(401).send({ ok: false, error: 'Unauthorized' }); request.actor = actor; }
  app.get('/health', async () => ({ ok: true, service: 'd20-initiative-server' }));
  app.get('/ready', async (request, reply) => { const ready = options.isReady ? await options.isReady() : true; return reply.code(ready ? 200 : 503).send({ ok: !!ready, service: 'd20-initiative-server' }); });
  app.post('/api/session', async (request) => ({ ok: true, ...identity.openSession({ authorization: request.headers.authorization, userName: request.body?.userName }) }));
  app.get('/api/rooms', { preHandler: requireActor }, async (request) => ({ ok: true, rooms: await rooms.list(request.actor) }));
  app.post('/api/rooms', { preHandler: requireActor }, async (request, reply) => reply.code(201).send({ ok: true, room: await rooms.create(request.actor, request.body) }));
  app.post('/api/rooms/:roomId/join', { preHandler: requireActor }, async (request) => ({ ok: true, ...await rooms.join(request.actor, request.params.roomId, request.body) }));
  return app;
}
module.exports = { buildApp };
