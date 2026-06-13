// PUT /v1/daily-logs/{date}/goals/{goalId} と
// PUT /v1/daily-logs/{date}/habit-items/{habitItemId} のバリデーションと upsert。

import { query } from './db.js';
import { ensureUser } from './today.js';
import { validateAppDate } from './dates.js';
import { ownsItemUnderActiveGroup } from './habits.js';
import { isUuid } from './ids.js';
import type { AuthUser } from './auth.js';

export type DailyLogKind = 'goal' | 'habit';

export interface DailyLogInput {
  done: boolean;
  count: number;
  minimum_done: boolean;
  version?: number;
}

export interface DailyLogRecord {
  date: string;
  done: boolean;
  count: number;
  minimum_done?: boolean;
  version: number;
}

export type DailyLogRequestResult =
  | { ok: true; input: DailyLogInput }
  | { ok: false; fields: Record<string, string> };

export function parseDailyLogRequest(kind: DailyLogKind, date: string, body: unknown, today: string): DailyLogRequestResult {
  const fields: Record<string, string> = {};

  const dateError = validateAppDate(date, today);
  if (dateError) fields.date = dateError;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    fields.body = 'JSON オブジェクトで指定してください';
    return { ok: false, fields };
  }

  const record = body as Record<string, unknown>;

  const done = record.done;
  if (typeof done !== 'boolean') {
    fields.done = 'true か false で指定してください';
  }

  const count = record.count === undefined ? 0 : record.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    fields.count = '0 以上の整数で指定してください';
  }

  const minimumDone = record.minimum_done;
  if (kind === 'habit' && minimumDone !== undefined) {
    fields.minimum_done = '目標ログだけで指定できます';
  } else if (minimumDone !== undefined && typeof minimumDone !== 'boolean') {
    fields.minimum_done = 'true か false で指定してください';
  }

  const version = record.version;
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 1)) {
    fields.version = '1 以上の整数で指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    input: {
      done: done as boolean,
      // done=false のログは count=0 にする（DB の CHECK 制約とも整合）
      count: done === true ? (count as number) : 0,
      minimum_done: (minimumDone as boolean | undefined) ?? false,
      version: version as number | undefined,
    },
  };
}

export type UpsertDailyLogResult =
  | { kind: 'saved'; log: DailyLogRecord }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export async function upsertGoalLog(authUser: AuthUser, date: string, goalId: string, input: DailyLogInput): Promise<UpsertDailyLogResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(goalId)) return { kind: 'not_found' };
  const owned = await query(
    'SELECT id FROM goals WHERE id = $1 AND user_id = $2 AND is_active = true',
    [goalId, user.id],
  );
  if (owned.rows.length === 0) return { kind: 'not_found' };

  if (input.version === undefined) {
    const inserted = await query<DailyLogRecord>(
      `
        INSERT INTO goal_logs (user_id, goal_id, log_date, done, count, minimum_done)
        VALUES ($1, $2, $3::date, $4, $5, $6)
        ON CONFLICT (user_id, log_date, goal_id) DO NOTHING
        RETURNING log_date::text AS date, done, count, minimum_done, version
      `,
      [user.id, goalId, date, input.done, input.count, input.minimum_done],
    );
    return inserted.rows[0] ? { kind: 'saved', log: inserted.rows[0] } : { kind: 'conflict' };
  }

  const updated = await query<DailyLogRecord>(
    `
      UPDATE goal_logs
      SET done = $4, count = $5, minimum_done = $6, version = version + 1
      WHERE user_id = $1 AND goal_id = $2 AND log_date = $3::date AND version = $7
      RETURNING log_date::text AS date, done, count, minimum_done, version
    `,
    [user.id, goalId, date, input.done, input.count, input.minimum_done, input.version],
  );
  return updated.rows[0] ? { kind: 'saved', log: updated.rows[0] } : { kind: 'conflict' };
}

export async function upsertHabitItemLog(authUser: AuthUser, date: string, habitItemId: string, input: DailyLogInput): Promise<UpsertDailyLogResult> {
  const user = await ensureUser(authUser);

  // 親グループが active な item のみ。削除済みグループ配下の item にログを付けさせない
  if (!isUuid(habitItemId)) return { kind: 'not_found' };
  if (!await ownsItemUnderActiveGroup(user.id, habitItemId, true)) return { kind: 'not_found' };

  if (input.version === undefined) {
    const inserted = await query<DailyLogRecord>(
      `
        INSERT INTO habit_item_logs (user_id, habit_item_id, log_date, done, count)
        VALUES ($1, $2, $3::date, $4, $5)
        ON CONFLICT (user_id, log_date, habit_item_id) DO NOTHING
        RETURNING log_date::text AS date, done, count, version
      `,
      [user.id, habitItemId, date, input.done, input.count],
    );
    return inserted.rows[0] ? { kind: 'saved', log: inserted.rows[0] } : { kind: 'conflict' };
  }

  const updated = await query<DailyLogRecord>(
    `
      UPDATE habit_item_logs
      SET done = $4, count = $5, version = version + 1
      WHERE user_id = $1 AND habit_item_id = $2 AND log_date = $3::date AND version = $6
      RETURNING log_date::text AS date, done, count, version
    `,
    [user.id, habitItemId, date, input.done, input.count, input.version],
  );
  return updated.rows[0] ? { kind: 'saved', log: updated.rows[0] } : { kind: 'conflict' };
}
