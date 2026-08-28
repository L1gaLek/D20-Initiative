'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const dir = path.resolve(__dirname, '..', 'infra', 'database', 'migrations');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const client = new Client({ connectionString: databaseUrl, application_name: 'd20-initiative-migrations' });
  await client.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of files) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (exists.rowCount) continue;
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { main };
