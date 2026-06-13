// Wish List（カテゴリ・項目）API のバリデーションと CRUD。
//
// 設計メモ（docs/proposals.md 参照）:
// - wish_categories / wish_items は日次ログや streak と無関係なので、削除は物理削除（CASCADE）。
//   goals/habits の論理削除と異なり、保持すべき履歴が無いため is_active を持たない。

import type pg from 'pg';
import { query, withTransaction } from './db.js';
import { ensureUser } from './today.js';
import { isUuid } from './ids.js';
import {
  asObject, isValidVersion, parseRequiredText, parseReorderRequest,
  type Parsed, type ReorderInput,
} from './requests.js';
import type { AuthUser } from './auth.js';

const MAX_NAME_LENGTH = 100;
const MAX_CONTENT_LENGTH = 500;

export interface WishCategoryRecord {
  id: string;
  name: string;
  sort_order: number;
  version: number;
}

export interface WishItemRecord {
  id: string;
  category_id: string;
  content: string;
  sort_order: number;
  version: number;
}

export interface CategoryCreateInput { name: string }
export interface CategoryUpdateInput { name: string; version: number }
export interface ItemCreateInput { content: string }
export interface ItemUpdateInput { content: string; version: number }

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

export function parseCategoryCreateRequest(body: unknown): Parsed<CategoryCreateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const name = parseRequiredText(record.name, 'name', MAX_NAME_LENGTH, fields);
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { name: name as string } };
}

export function parseCategoryUpdateRequest(body: unknown): Parsed<CategoryUpdateInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const name = parseRequiredText(record.name, 'name', MAX_NAME_LENGTH, fields);
  if (!isValidVersion(record.version)) fields.version = '1 以上の整数で指定してください';

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { name: name as string, version: record.version as number } };
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

  const content = parseRequiredText(record.content, 'content', MAX_CONTENT_LENGTH, fields);
  if (!isValidVersion(record.version)) fields.version = '1 以上の整数で指定してください';

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { content: content as string, version: record.version as number } };
}

// ---------------------------------------------------------------------------
// 共通結果型
// ---------------------------------------------------------------------------

export type MutationResult<T> =
  | { kind: 'saved'; record: T }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

export type DeleteResult = 'deleted' | 'not_found';

export type ReorderResult =
  | { kind: 'saved'; items: { id: string; sort_order: number; version: number }[] }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

// ---------------------------------------------------------------------------
// カテゴリ CRUD
// ---------------------------------------------------------------------------

const CATEGORY_COLUMNS = 'id, name, sort_order, version';

export async function listCategories(authUser: AuthUser): Promise<WishCategoryRecord[]> {
  const user = await ensureUser(authUser);
  const result = await query<WishCategoryRecord>(
    `SELECT ${CATEGORY_COLUMNS} FROM wish_categories WHERE user_id = $1 ORDER BY sort_order, created_at`,
    [user.id],
  );
  return result.rows;
}

export async function createCategory(authUser: AuthUser, input: CategoryCreateInput): Promise<WishCategoryRecord> {
  const user = await ensureUser(authUser);
  const result = await query<WishCategoryRecord>(
    `
      INSERT INTO wish_categories (user_id, name, sort_order)
      VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM wish_categories WHERE user_id = $1))
      RETURNING ${CATEGORY_COLUMNS}
    `,
    [user.id, input.name],
  );
  return result.rows[0];
}

export async function updateCategory(authUser: AuthUser, categoryId: string, input: CategoryUpdateInput): Promise<MutationResult<WishCategoryRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(categoryId)) return { kind: 'not_found' };
  const exists = await query('SELECT id FROM wish_categories WHERE id = $1 AND user_id = $2', [categoryId, user.id]);
  if (exists.rows.length === 0) return { kind: 'not_found' };

  const updated = await query<WishCategoryRecord>(
    `UPDATE wish_categories SET name = $4, version = version + 1
      WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING ${CATEGORY_COLUMNS}`,
    [categoryId, user.id, input.version, input.name],
  );
  return updated.rows[0] ? { kind: 'saved', record: updated.rows[0] } : { kind: 'conflict' };
}

/** 物理削除（配下 wish_items は FK CASCADE で消える）。存在しなければ not_found。 */
export async function deleteCategory(authUser: AuthUser, categoryId: string): Promise<DeleteResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(categoryId)) return 'not_found';
  const result = await query('DELETE FROM wish_categories WHERE id = $1 AND user_id = $2', [categoryId, user.id]);
  return result.rowCount && result.rowCount > 0 ? 'deleted' : 'not_found';
}

export async function reorderCategories(authUser: AuthUser, input: ReorderInput): Promise<ReorderResult> {
  const user = await ensureUser(authUser);
  const owned = await query<{ id: string }>(
    'SELECT id FROM wish_categories WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [user.id, input.items.map(item => item.id)],
  );
  if (owned.rows.length !== input.items.length) return { kind: 'not_found' };
  return applyReorder('wish_categories', user.id, input);
}

// ---------------------------------------------------------------------------
// 項目 CRUD
// ---------------------------------------------------------------------------

const ITEM_COLUMNS = 'id, category_id, content, sort_order, version';

export async function createItem(authUser: AuthUser, categoryId: string, input: ItemCreateInput): Promise<MutationResult<WishItemRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(categoryId)) return { kind: 'not_found' };
  const category = await query('SELECT id FROM wish_categories WHERE id = $1 AND user_id = $2', [categoryId, user.id]);
  if (category.rows.length === 0) return { kind: 'not_found' };

  const result = await query<WishItemRecord>(
    `
      INSERT INTO wish_items (user_id, category_id, content, sort_order)
      VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM wish_items WHERE user_id = $1 AND category_id = $2))
      RETURNING ${ITEM_COLUMNS}
    `,
    [user.id, categoryId, input.content],
  );
  return { kind: 'saved', record: result.rows[0] };
}

export async function updateItem(authUser: AuthUser, itemId: string, input: ItemUpdateInput): Promise<MutationResult<WishItemRecord>> {
  const user = await ensureUser(authUser);

  if (!isUuid(itemId)) return { kind: 'not_found' };
  const exists = await query('SELECT id FROM wish_items WHERE id = $1 AND user_id = $2', [itemId, user.id]);
  if (exists.rows.length === 0) return { kind: 'not_found' };

  const updated = await query<WishItemRecord>(
    `UPDATE wish_items SET content = $4, version = version + 1
      WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING ${ITEM_COLUMNS}`,
    [itemId, user.id, input.version, input.content],
  );
  return updated.rows[0] ? { kind: 'saved', record: updated.rows[0] } : { kind: 'conflict' };
}

/** 物理削除。存在しなければ not_found。 */
export async function deleteItem(authUser: AuthUser, itemId: string): Promise<DeleteResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(itemId)) return 'not_found';
  const result = await query('DELETE FROM wish_items WHERE id = $1 AND user_id = $2', [itemId, user.id]);
  return result.rowCount && result.rowCount > 0 ? 'deleted' : 'not_found';
}

export async function reorderItems(authUser: AuthUser, categoryId: string, input: ReorderInput): Promise<ReorderResult> {
  const user = await ensureUser(authUser);

  if (!isUuid(categoryId)) return { kind: 'not_found' };
  const category = await query('SELECT id FROM wish_categories WHERE id = $1 AND user_id = $2', [categoryId, user.id]);
  if (category.rows.length === 0) return { kind: 'not_found' };
  const owned = await query<{ id: string }>(
    'SELECT id FROM wish_items WHERE user_id = $1 AND category_id = $2 AND id = ANY($3::uuid[])',
    [user.id, categoryId, input.items.map(item => item.id)],
  );
  if (owned.rows.length !== input.items.length) return { kind: 'not_found' };
  return applyReorder('wish_items', user.id, input);
}

export { parseReorderRequest };
export type { ReorderInput };

// ---------------------------------------------------------------------------
// 共通 reorder（トランザクションで全件 version 検証）
// ---------------------------------------------------------------------------

class ReorderConflict extends Error {}

async function applyReorder(table: 'wish_categories' | 'wish_items', userId: string, input: ReorderInput): Promise<ReorderResult> {
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
