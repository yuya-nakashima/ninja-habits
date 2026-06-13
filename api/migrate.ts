import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';

const apiDir = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(apiDir, 'migrations');

async function main() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const existing = await query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    if (file === '001_initial_schema.sql' && await initialSchemaAlreadyExists()) {
      console.log(`mark ${file} as already applied`);
      await query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await query(sql);
    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
  }
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async error => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

async function initialSchemaAlreadyExists(): Promise<boolean> {
  const result = await query<{ exists: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS exists");
  return result.rows[0]?.exists === true;
}
