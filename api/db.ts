import pg from 'pg';
import { readConfig } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: readConfig().databaseUrl,
});

pool.on('error', error => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

/** トランザクション内で fn を実行する。fn が throw したら ROLLBACK して再 throw する。 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
