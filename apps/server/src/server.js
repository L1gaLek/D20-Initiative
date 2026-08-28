'use strict';

const { loadServerConfig } = require('./config.js');
const { buildApp } = require('./app.js');
const { checkPostgres, createPostgresPool } = require('./persistence/postgres.js');
const { createPostgresRoomRepository } = require('./modules/rooms/postgres-room-repository.js');

async function startServer(env = process.env) {
  const config = loadServerConfig(env);
  const pool = createPostgresPool(config);
  const app = buildApp({
    config,
    logger: true,
    roomRepository: createPostgresRoomRepository(pool),
    isReady: () => checkPostgres(pool)
  });
  app.addHook('onClose', async () => { await pool.end(); });
  await app.listen({ port: config.port, host: config.host });
  return app;
}

if (require.main === module) startServer().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { startServer };
