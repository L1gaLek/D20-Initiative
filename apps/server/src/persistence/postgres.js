'use strict';

const { Pool } = require('pg');

function createPostgresPool(config) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'd20-initiative-server'
  });
}

async function checkPostgres(pool) {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows?.[0]?.ok === 1;
}

module.exports = { checkPostgres, createPostgresPool };
