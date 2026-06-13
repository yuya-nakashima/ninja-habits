// 目標マスタ API（/v1/goals）のバリデーションと CRUD。
//
// 仕様で未定義だった点の方針（docs/proposals.md 参照）:
// - DELETE は論理削除（is_active=false）。goal_logs を残して streak 履歴を守る
// - reorder は受け取った items を渡された順に sort_order 1..n へ並べ直す

import type pg from 'pg';
import { query, withTransaction } from './db.js';
import { ensureUser } from './today.js';
import { isUuid } from './ids.js';
import {
  asObject, isValidVersion, parseNullableText, parseRequiredText, parseReorderRequest,
  type Parsed, type ReorderInput,
} from './requests.js';
import type { AuthUser } from './auth.js';

export { parseReorderRequest };
export type { ReorderInput };

const MAX_CONTENT_LENGTH = 500;
const MAX_MINIMUM_GOAL_LENGTH = 500;

export interface GoalRecord {
  id: string;
  content: string;
  minimum_goal: string | null;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface GoalCreateInput {
  content: string;
  minimum_goal: string | null;
}

export interface GoalUpdateInput {
  content?: string;
  minimum_goal?: string | null;
  is_active?: boolean;
  version: number;
}

export function parseGoalCreateRequest(body: unknown): Parsed<GoalCreateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const content = parseRequiredText(record.content, 'content', MAX_CONTENT_LENGTH, fields);
  const minimumGoal = record.minimum_goal === undefined ? null
    : parseNullableText(record.minimum_goal, 'minimum_goal', MAX_MINIMUM_GOAL_LENGTH, fields);

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { content: content as string, minimum_goal: minimumGoal as string | null } };
}

export function parseGoalUpdateRequest(body: unknown): Parsed<GoalUpdateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const input: GoalUpdateInput = { version: 0 };

  if (record.content !== undefined) {
    const content = parseRequiredText(record.content, 'content', MAX_CONTENT_LENGTH, fields);
    if (content !== undefined) input.content = content;
  }
  if (record.minimum_goal !== undefined) {
    const minimumGoal = parseNullableText(record.minimum_goal, 'minimum_goal', MAX_MINIMUM_GOAL_LENGTH, fields);
    if (minimumGoal !== undefined) input.minimum_goal = minimumGoal;
  }
  if (record.is_active !== undefined) {
    if (typeof record.is_active !== 'boolean') fields.is_active = 'true か false で指定してください';
    else input.is_active = record.is_active;
  }

  // PATCH は upsert ではないので version は常に必須（欠落は validation_error）
  if (!isValidVersion(record.version)) fields.version = '1 以上の整数で指定してください';
  else input.version = record.version;

  if (input.content === undefined && input.minimum_goal === undefined && input.is_active === undefined && Object.keys(fields).length === 0) {
    fields.body = '更新するフィールドを 1 つ以上指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input };
}

const GOAL_COLUMNS = 'id, content, minimum_goal, is_active, sort_order, version';

export async function listGoals(authUser: AuthUser): Promise<GoalRecord[]> {
  const user = await ensureUser(authUser);
  const result = await query<GoalRecord>(
    `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = $1 ORDER BY sort_order, created_at`,
    [user.id],
  );
  return result.rows;
}

export async function createGoal(authUser: AuthUser, input: GoalCreateInput): Promise<GoalRecord> {
  const user = await ensureUser(authUser);
  const result = await query<GoalRecord>(
    `
      INSERT INTO goals (user_id, content, minimum_goal, sort_order)
      VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM goals WHERE user_id = $1))
      RETURNING ${GOAL_COLUMNS}
    `,
    [user.id, input.content, input.minimum_goal],
  );
  return result.rows[0];
}

export type GoalMutationResult =
  | { kind: 'saved'; goal: GoalRecord }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export async function updateGoal(authUser: AuthUser, goalId: string, input: GoalUpdateInput): Promise<GoalMutationResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(goalId)) return { kind: 'not_found' };
  const exists = await query('SELECT id FROM goals WHERE id = $1 AND user_id = $2', [goalId, user.id]);
  if (exists.rows.length === 0) return { kind: 'not_found' };

  const sets: string[] = ['version = version + 1'];
  const params: unknown[] = [goalId, user.id, input.version];
  if (input.content !== undefined) {
    params.push(input.content);
    sets.push(`content = $${params.length}`);
  }
  if (input.minimum_goal !== undefined) {
    params.push(input.minimum_goal);
    sets.push(`minimum_goal = $${params.length}`);
  }
  if (input.is_active !== undefined) {
    params.push(input.is_active);
    sets.push(`is_active = $${params.length}`);
  }

  const updated = await query<GoalRecord>(
    `UPDATE goals SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING ${GOAL_COLUMNS}`,
    params,
  );
  return updated.rows[0] ? { kind: 'saved', goal: updated.rows[0] } : { kind: 'conflict' };
}

export type GoalDeleteResult = 'deleted' | 'not_found';

/** 論理削除。すでに非アクティブでも 'deleted' を返す（冪等）。 */
export async function deleteGoal(authUser: AuthUser, goalId: string): Promise<GoalDeleteResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(goalId)) return 'not_found';
  const exists = await query('SELECT id FROM goals WHERE id = $1 AND user_id = $2', [goalId, user.id]);
  if (exists.rows.length === 0) return 'not_found';

  await query(
    'UPDATE goals SET is_active = false, version = version + 1 WHERE id = $1 AND user_id = $2 AND is_active = true',
    [goalId, user.id],
  );
  return 'deleted';
}

export type ReorderResult =
  | { kind: 'saved'; items: { id: string; sort_order: number; version: number }[] }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export async function reorderGoals(authUser: AuthUser, input: ReorderInput): Promise<ReorderResult> {
  const user = await ensureUser(authUser);

  const ids = input.items.map(item => item.id);
  const owned = await query<{ id: string }>(
    'SELECT id FROM goals WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [user.id, ids],
  );
  if (owned.rows.length !== ids.length) return { kind: 'not_found' };

  try {
    const items = await withTransaction(async client => {
      const results: { id: string; sort_order: number; version: number }[] = [];
      for (const [index, item] of input.items.entries()) {
        const updated: pg.QueryResult<{ id: string; sort_order: number; version: number }> = await client.query(
          `
            UPDATE goals SET sort_order = $4, version = version + 1
            WHERE id = $1 AND user_id = $2 AND version = $3
            RETURNING id, sort_order, version
          `,
          [item.id, user.id, item.version, index + 1],
        );
        if (!updated.rows[0]) throw new ReorderConflict();
        results.push(updated.rows[0]);
      }
      return results;
    });
    return { kind: 'saved', items };
  } catch (error) {
    if (error instanceof ReorderConflict) return { kind: 'conflict' };
    throw error;
  }
}

class ReorderConflict extends Error {}
