// PUT /v1/reflections/{date} のバリデーションと upsert。
// 振り返り本文は私的な内容のため、この層でもログに出さない。

import { query } from './db.js';
import { ensureUser } from './today.js';
import { addDays, isIsoDate, validateAppDate } from './dates.js';
import type { AuthUser } from './auth.js';

const TEXT_FIELDS = ['free_text', 'want_to_do', 'unconscious_desire'] as const;
const MAX_TEXT_LENGTH = 5000;
const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;

export interface ReflectionRecord {
  date: string;
  free_text: string | null;
  want_to_do: string | null;
  unconscious_desire: string | null;
  version: number;
}

export interface ReflectionInput {
  free_text: string | null;
  want_to_do: string | null;
  unconscious_desire: string | null;
  version?: number;
}

export type ReflectionRequestResult =
  | { ok: true; input: ReflectionInput }
  | { ok: false; fields: Record<string, string> };

export function parseReflectionRequest(date: string, body: unknown, today: string): ReflectionRequestResult {
  const fields: Record<string, string> = {};

  const dateError = validateAppDate(date, today);
  if (dateError) fields.date = dateError;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    fields.body = 'JSON オブジェクトで指定してください';
    return { ok: false, fields };
  }

  const record = body as Record<string, unknown>;

  for (const key of TEXT_FIELDS) {
    const value = record[key] ?? null;
    if (value !== null && typeof value !== 'string') {
      fields[key] = '文字列か null で指定してください';
    } else if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
      fields[key] = `最大 ${MAX_TEXT_LENGTH} 文字です`;
    }
  }

  const version = record.version;
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 1)) {
    fields.version = '1 以上の整数で指定してください';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    input: {
      free_text: (record.free_text ?? null) as string | null,
      want_to_do: (record.want_to_do ?? null) as string | null,
      unconscious_desire: (record.unconscious_desire ?? null) as string | null,
      version: version as number | undefined,
    },
  };
}

export interface ReflectionsQuery {
  from: string;
  to: string;
}

export type ReflectionsQueryResult =
  | { ok: true; query: ReflectionsQuery }
  | { ok: false; fields: Record<string, string> };

/**
 * GET /v1/reflections の from/to を検証する。
 * - 省略時は直近30日（to=今日, from=今日-29）
 * - 形式不正・to<from・範囲90日超は 422
 */
export function parseReflectionsQuery(from: string | null, to: string | null, today: string): ReflectionsQueryResult {
  const fields: Record<string, string> = {};

  if (from !== null && !isIsoDate(from)) fields.from = 'YYYY-MM-DD で指定してください';
  if (to !== null && !isIsoDate(to)) fields.to = 'YYYY-MM-DD で指定してください';
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const resolvedTo = to ?? today;
  const resolvedFrom = from ?? addDays(resolvedTo, -(DEFAULT_RANGE_DAYS - 1));

  if (resolvedFrom > resolvedTo) {
    fields.range = 'from は to 以前の日付で指定してください';
    return { ok: false, fields };
  }
  const spanDays = Math.round(
    (Date.parse(`${resolvedTo}T00:00:00Z`) - Date.parse(`${resolvedFrom}T00:00:00Z`)) / 86400000,
  ) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    fields.range = `範囲は最大 ${MAX_RANGE_DAYS} 日です`;
    return { ok: false, fields };
  }

  return { ok: true, query: { from: resolvedFrom, to: resolvedTo } };
}

export async function listReflections(authUser: AuthUser, range: ReflectionsQuery): Promise<ReflectionRecord[]> {
  const user = await ensureUser(authUser);
  const result = await query<ReflectionRecord>(
    `
      SELECT reflection_date::text AS date, free_text, want_to_do, unconscious_desire, version
      FROM reflections
      WHERE user_id = $1 AND reflection_date BETWEEN $2::date AND $3::date
      ORDER BY reflection_date DESC
    `,
    [user.id, range.from, range.to],
  );
  return result.rows;
}

export type UpsertReflectionResult =
  | { kind: 'saved'; reflection: ReflectionRecord }
  | { kind: 'conflict' };

export async function upsertReflection(authUser: AuthUser, date: string, input: ReflectionInput): Promise<UpsertReflectionResult> {
  const user = await ensureUser(authUser);

  // version 省略 = クライアントは対象日を新規とみなしている。
  // 既に存在する場合は ON CONFLICT で行が返らず、状態が古いので conflict。
  if (input.version === undefined) {
    const inserted = await query<ReflectionRecord>(
      `
        INSERT INTO reflections (user_id, reflection_date, free_text, want_to_do, unconscious_desire)
        VALUES ($1, $2::date, $3, $4, $5)
        ON CONFLICT (user_id, reflection_date) DO NOTHING
        RETURNING reflection_date::text AS date, free_text, want_to_do, unconscious_desire, version
      `,
      [user.id, date, input.free_text, input.want_to_do, input.unconscious_desire],
    );
    return inserted.rows[0] ? { kind: 'saved', reflection: inserted.rows[0] } : { kind: 'conflict' };
  }

  const updated = await query<ReflectionRecord>(
    `
      UPDATE reflections
      SET free_text = $3, want_to_do = $4, unconscious_desire = $5, version = version + 1
      WHERE user_id = $1 AND reflection_date = $2::date AND version = $6
      RETURNING reflection_date::text AS date, free_text, want_to_do, unconscious_desire, version
    `,
    [user.id, date, input.free_text, input.want_to_do, input.unconscious_desire, input.version],
  );
  return updated.rows[0] ? { kind: 'saved', reflection: updated.rows[0] } : { kind: 'conflict' };
}
