// PUT /v1/reflections/{date} のバリデーションと upsert。
// 振り返り本文は私的な内容のため、この層でもログに出さない。

import { query } from './db.js';
import { ensureUser } from './today.js';
import { validateAppDate } from './dates.js';
import type { AuthUser } from './auth.js';

const TEXT_FIELDS = ['free_text', 'want_to_do', 'unconscious_desire'] as const;
const MAX_TEXT_LENGTH = 5000;

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
