// 習慣グループ・習慣項目・通知設定 API のバリデーションと CRUD。
//
// 仕様で未定義だった点の方針（docs/proposals.md 参照）:
// - グループ/項目の DELETE は論理削除（is_active=false、migration 002 でグループに追加）。
//   グループ削除時に配下項目は触らない（ログ・streak を保持し、復活時は項目ごと戻る）
// - 通知設定の PUT は upsert。GET /v1/today の notif.version は行が無ければ null

import type pg from 'pg';
import { query, withTransaction } from './db.js';
import { ensureUser } from './today.js';
import { isUuid } from './ids.js';
import {
  asObject, isValidVersion, parseNullableText, parseRequiredText,
  type Parsed, type ReorderInput,
} from './requests.js';
import type { AuthUser } from './auth.js';

const MAX_NAME_LENGTH = 100;
const MAX_CONTENT_LENGTH = 500;
const MAX_WOOP_LENGTH = 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WOOP_FIELDS = ['woop_wish', 'woop_outcome', 'woop_obstacle', 'woop_plan'] as const;

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface GroupRecord {
  id: string;
  name: string;
  woop_wish: string | null;
  woop_outcome: string | null;
  woop_obstacle: string | null;
  woop_plan: string | null;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface GroupCreateInput {
  name: string;
}

export interface GroupUpdateInput {
  name?: string;
  woop_wish?: string | null;
  woop_outcome?: string | null;
  woop_obstacle?: string | null;
  woop_plan?: string | null;
  is_active?: boolean;
  version: number;
}

export interface ItemRecord {
  id: string;
  group_id: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface ItemCreateInput {
  content: string;
}

export interface ItemUpdateInput {
  content?: string;
  is_active?: boolean;
  version: number;
}

export interface NotificationInput {
  on: boolean;
  times: string[];
  days: boolean[];
  version?: number;
}

export interface NotificationRecord {
  on: boolean;
  times: string[];
  days: boolean[];
  version: number;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

export function parseGroupCreateRequest(body: unknown): Parsed<GroupCreateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const name = parseRequiredText(record.name, 'name', MAX_NAME_LENGTH, fields);

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { name: name as string } };
}

export function parseGroupUpdateRequest(body: unknown): Parsed<GroupUpdateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const input: GroupUpdateInput = { version: 0 };

  if (record.name !== undefined) {
    const name = parseRequiredText(record.name, 'name', MAX_NAME_LENGTH, fields);
    if (name !== undefined) input.name = name;
  }
  for (const key of WOOP_FIELDS) {
    if (record[key] === undefined) continue;
    const value = parseNullableText(record[key], key, MAX_WOOP_LENGTH, fields);
    if (value !== undefined) input[key] = value;
  }
  if (record.is_active !== undefined) {
    if (typeof record.is_active !== 'boolean') fields.is_active = 'true か false で指定してください';
    else input.is_active = record.is_active;
  }

  if (!isValidVersion(record.version)) fields.version = '1 以上の整数で指定してください';
  else input.version = record.version;

  const hasField = input.name !== undefined || input.is_active !== undefined
    || WOOP_FIELDS.some(key => input[key] !== undefined);
  if (!hasField && Object.keys(fields).length === 0) {
    fields.body = '更新するフィールドを 1 つ以上指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input };
}

export function parseItemCreateRequest(body: unknown): Parsed<ItemCreateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const content = parseRequiredText(record.content, 'content', MAX_CONTENT_LENGTH, fields);

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { content: content as string } };
}

export function parseItemUpdateRequest(body: unknown): Parsed<ItemUpdateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const input: ItemUpdateInput = { version: 0 };

  if (record.content !== undefined) {
    const content = parseRequiredText(record.content, 'content', MAX_CONTENT_LENGTH, fields);
    if (content !== undefined) input.content = content;
  }
  if (record.is_active !== undefined) {
    if (typeof record.is_active !== 'boolean') fields.is_active = 'true か false で指定してください';
    else input.is_active = record.is_active;
  }

  if (!isValidVersion(record.version)) fields.version = '1 以上の整数で指定してください';
  else input.version = record.version;

  if (input.content === undefined && input.is_active === undefined && Object.keys(fields).length === 0) {
    fields.body = '更新するフィールドを 1 つ以上指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input };
}

export function parseNotificationRequest(body: unknown): Parsed<NotificationInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  if (typeof record.on !== 'boolean') {
    fields.on = 'true か false で指定してください';
  }

  const times = record.times;
  if (!Array.isArray(times) || times.length === 0) {
    fields.times = 'HH:mm の配列を 1 件以上指定してください';
  } else if (!times.every(t => typeof t === 'string' && TIME_PATTERN.test(t))) {
    fields.times = 'HH:mm 形式で指定してください';
  }

  const days = record.days;
  if (!Array.isArray(days) || days.length !== 7 || !days.every(d => typeof d === 'boolean')) {
    fields.days = 'boolean 7 要素（Mon=0）で指定してください';
  }

  const version = record.version;
  if (version !== undefined && !isValidVersion(version)) {
    fields.version = '1 以上の整数で指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    input: {
      on: record.on as boolean,
      times: times as string[],
      days: days as boolean[],
      version: version as number | undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// 習慣グループ CRUD
// ---------------------------------------------------------------------------

const GROUP_COLUMNS = 'id, name, woop_wish, woop_outcome, woop_obstacle, woop_plan, is_active, sort_order, version';

export type MutationResult<T> =
  | { kind: 'saved'; record: T }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export type DeleteResult = 'deleted' | 'not_found';

export type ReorderResult =
  | { kind: 'saved'; items: { id: string; sort_order: number; version: number }[] }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export async function listGroups(authUser: AuthUser): Promise<GroupRecord[]> {
  const user = await ensureUser(authUser);
  // 削除済み（is_active=false）は通常一覧から隠す
  const result = await query<GroupRecord>(
    `SELECT ${GROUP_COLUMNS} FROM habit_groups WHERE user_id = $1 AND is_active = true ORDER BY sort_order, created_at`,
    [user.id],
  );
  return result.rows;
}

/**
 * item の所有確認。親グループが is_active=true であることも要求する
 * （削除済みグループ内の item を直接操作させない）。
 * requireItemActive=true なら item 自身の is_active=true も要求する。
 */
export async function ownsItemUnderActiveGroup(userId: string, itemId: string, requireItemActive: boolean): Promise<boolean> {
  const result = await query(
    `
      SELECT hi.id FROM habit_items hi
      JOIN habit_groups hg ON hg.id = hi.group_id AND hg.user_id = hi.user_id
      WHERE hi.id = $1 AND hi.user_id = $2 AND hg.is_active = true
        ${requireItemActive ? 'AND hi.is_active = true' : ''}
    `,
    [itemId, userId],
  );
  return result.rows.length > 0;
}

export async function createGroup(authUser: AuthUser, input: GroupCreateInput): Promise<GroupRecord> {
  const user = await ensureUser(authUser);
  const result = await query<GroupRecord>(
    `
      INSERT INTO habit_groups (user_id, name, sort_order)
      VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habit_groups WHERE user_id = $1))
      RETURNING ${GROUP_COLUMNS}
    `,
    [user.id, input.name],
  );
  return result.rows[0];
}

export async function updateGroup(authUser: AuthUser, groupId: string, input: GroupUpdateInput): Promise<MutationResult<GroupRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(groupId)) return { kind: 'not_found' };
  const exists = await query('SELECT id FROM habit_groups WHERE id = $1 AND user_id = $2', [groupId, user.id]);
  if (exists.rows.length === 0) return { kind: 'not_found' };

  const sets: string[] = ['version = version + 1'];
  const params: unknown[] = [groupId, user.id, input.version];
  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (input.name !== undefined) push('name', input.name);
  for (const key of WOOP_FIELDS) {
    if (input[key] !== undefined) push(key, input[key]);
  }
  if (input.is_active !== undefined) push('is_active', input.is_active);

  const updated = await query<GroupRecord>(
    `UPDATE habit_groups SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING ${GROUP_COLUMNS}`,
    params,
  );
  return updated.rows[0] ? { kind: 'saved', record: updated.rows[0] } : { kind: 'conflict' };
}

/** 論理削除。配下の項目・ログは保持する。冪等。 */
export async function deleteGroup(authUser: AuthUser, groupId: string): Promise<DeleteResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(groupId)) return 'not_found';
  const exists = await query('SELECT id FROM habit_groups WHERE id = $1 AND user_id = $2', [groupId, user.id]);
  if (exists.rows.length === 0) return 'not_found';

  await query(
    'UPDATE habit_groups SET is_active = false, version = version + 1 WHERE id = $1 AND user_id = $2 AND is_active = true',
    [groupId, user.id],
  );
  return 'deleted';
}

export async function reorderGroups(authUser: AuthUser, input: ReorderInput): Promise<ReorderResult> {
  const user = await ensureUser(authUser);
  // 表示中（active）の全件を渡す前提なので、対象も active のみ
  const owned = await query<{ id: string }>(
    'SELECT id FROM habit_groups WHERE user_id = $1 AND is_active = true AND id = ANY($2::uuid[])',
    [user.id, input.items.map(item => item.id)],
  );
  if (owned.rows.length !== input.items.length) return { kind: 'not_found' };
  return applyReorder('habit_groups', user.id, input);
}

// ---------------------------------------------------------------------------
// 習慣項目 CRUD
// ---------------------------------------------------------------------------

const ITEM_COLUMNS = 'id, group_id, content, is_active, sort_order, version';

export async function createItem(authUser: AuthUser, groupId: string, input: ItemCreateInput): Promise<MutationResult<ItemRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(groupId)) return { kind: 'not_found' };
  const group = await query(
    'SELECT id FROM habit_groups WHERE id = $1 AND user_id = $2 AND is_active = true',
    [groupId, user.id],
  );
  if (group.rows.length === 0) return { kind: 'not_found' };

  const result = await query<ItemRecord>(
    `
      INSERT INTO habit_items (user_id, group_id, content, sort_order)
      VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habit_items WHERE user_id = $1 AND group_id = $2))
      RETURNING ${ITEM_COLUMNS}
    `,
    [user.id, groupId, input.content],
  );
  return { kind: 'saved', record: result.rows[0] };
}

export async function updateItem(authUser: AuthUser, itemId: string, input: ItemUpdateInput): Promise<MutationResult<ItemRecord>> {
  const user = await ensureUser(authUser);

  // 親グループが active であることも要求する。item 自身の is_active は問わない（復活 PATCH を許す）
  if (!isUuid(itemId)) return { kind: 'not_found' };
  if (!await ownsItemUnderActiveGroup(user.id, itemId, false)) return { kind: 'not_found' };

  const sets: string[] = ['version = version + 1'];
  const params: unknown[] = [itemId, user.id, input.version];
  if (input.content !== undefined) {
    params.push(input.content);
    sets.push(`content = $${params.length}`);
  }
  if (input.is_active !== undefined) {
    params.push(input.is_active);
    sets.push(`is_active = $${params.length}`);
  }

  const updated = await query<ItemRecord>(
    `UPDATE habit_items SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING ${ITEM_COLUMNS}`,
    params,
  );
  return updated.rows[0] ? { kind: 'saved', record: updated.rows[0] } : { kind: 'conflict' };
}

/** 論理削除。habit_item_logs は保持する。冪等。 */
export async function deleteItem(authUser: AuthUser, itemId: string): Promise<DeleteResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(itemId)) return 'not_found';
  if (!await ownsItemUnderActiveGroup(user.id, itemId, false)) return 'not_found';

  await query(
    'UPDATE habit_items SET is_active = false, version = version + 1 WHERE id = $1 AND user_id = $2 AND is_active = true',
    [itemId, user.id],
  );
  return 'deleted';
}

export async function reorderItems(authUser: AuthUser, groupId: string, input: ReorderInput): Promise<ReorderResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(groupId)) return { kind: 'not_found' };
  const group = await query(
    'SELECT id FROM habit_groups WHERE id = $1 AND user_id = $2 AND is_active = true',
    [groupId, user.id],
  );
  if (group.rows.length === 0) return { kind: 'not_found' };
  // 表示中（active）の全件を渡す前提なので、対象も active のみ
  const owned = await query<{ id: string }>(
    'SELECT id FROM habit_items WHERE user_id = $1 AND group_id = $2 AND is_active = true AND id = ANY($3::uuid[])',
    [user.id, groupId, input.items.map(item => item.id)],
  );
  if (owned.rows.length !== input.items.length) return { kind: 'not_found' };
  return applyReorder('habit_items', user.id, input);
}

// ---------------------------------------------------------------------------
// 通知設定（upsert）
// ---------------------------------------------------------------------------

const NOTIFICATION_COLUMNS = 'enabled AS "on", times, days, version';

export async function putNotification(authUser: AuthUser, itemId: string, input: NotificationInput): Promise<MutationResult<NotificationRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(itemId)) return { kind: 'not_found' };
  if (!await ownsItemUnderActiveGroup(user.id, itemId, true)) return { kind: 'not_found' };

  const timesJson = JSON.stringify(input.times);
  const daysJson = JSON.stringify(input.days);

  if (input.version === undefined) {
    const inserted = await query<NotificationRecord>(
      `
        INSERT INTO habit_item_notifications (user_id, habit_item_id, enabled, times, days)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        ON CONFLICT (user_id, habit_item_id) DO NOTHING
        RETURNING ${NOTIFICATION_COLUMNS}
      `,
      [user.id, itemId, input.on, timesJson, daysJson],
    );
    return inserted.rows[0] ? { kind: 'saved', record: inserted.rows[0] } : { kind: 'conflict' };
  }

  const updated = await query<NotificationRecord>(
    `
      UPDATE habit_item_notifications
      SET enabled = $3, times = $4::jsonb, days = $5::jsonb, version = version + 1
      WHERE user_id = $1 AND habit_item_id = $2 AND version = $6
      RETURNING ${NOTIFICATION_COLUMNS}
    `,
    [user.id, itemId, input.on, timesJson, daysJson, input.version],
  );
  return updated.rows[0] ? { kind: 'saved', record: updated.rows[0] } : { kind: 'conflict' };
}

// ---------------------------------------------------------------------------
// 共通 reorder（トランザクションで全件 version 検証）
// ---------------------------------------------------------------------------

class ReorderConflict extends Error {}

async function applyReorder(table: 'habit_groups' | 'habit_items', userId: string, input: ReorderInput): Promise<ReorderResult> {
  try {
    const items = await withTransaction(async client => {
      const results: { id: string; sort_order: number; version: number }[] = [];
      for (const [index, item] of input.items.entries()) {
        const updated: pg.QueryResult<{ id: string; sort_order: number; version: number }> = await client.query(
          `
            UPDATE ${table} SET sort_order = $4, version = version + 1
            WHERE id = $1 AND user_id = $2 AND version = $3
            RETURNING id, sort_order, version
          `,
          [item.id, userId, item.version, index + 1],
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
