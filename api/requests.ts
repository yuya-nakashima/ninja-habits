// マスタ系 API のリクエスト検証で共有するヘルパー。

import { isUuid } from './ids.js';

export type Parsed<T> =
  | { ok: true; input: T }
  | { ok: false; fields: Record<string, string> };

export function asObject(body: unknown, fields: Record<string, string>): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    fields.body = 'JSON オブジェクトで指定してください';
    return null;
  }
  return body as Record<string, unknown>;
}

export function isValidVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/** 1 文字以上（空白のみは不可）・最大 maxLength のテキスト。不正なら fields に記録して undefined。 */
export function parseRequiredText(
  value: unknown,
  field: string,
  maxLength: number,
  fields: Record<string, string>,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fields[field] = '1 文字以上で指定してください';
    return undefined;
  }
  if (value.length > maxLength) {
    fields[field] = `最大 ${maxLength} 文字です`;
    return undefined;
  }
  return value;
}

/** nullable テキスト。不正なら fields に記録して undefined。 */
export function parseNullableText(
  value: unknown,
  field: string,
  maxLength: number,
  fields: Record<string, string>,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') {
    fields[field] = '文字列か null で指定してください';
    return undefined;
  }
  if (value.length > maxLength) {
    fields[field] = `最大 ${maxLength} 文字です`;
    return undefined;
  }
  return value;
}

export interface ReorderInput {
  items: { id: string; version: number }[];
}

export function parseReorderRequest(body: unknown): Parsed<ReorderInput> {
  const fields: Record<string, string> = {};
  const record = asObject(body, fields);
  if (!record) return { ok: false, fields };

  const items = record.items;
  if (!Array.isArray(items) || items.length === 0) {
    fields.items = '1 件以上の配列で指定してください';
    return { ok: false, fields };
  }

  const parsed: ReorderInput['items'] = [];
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fields[`items[${index}]`] = 'オブジェクトで指定してください';
      continue;
    }
    const { id, version } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !isUuid(id)) {
      fields[`items[${index}].id`] = 'ID の形式が不正です';
      continue;
    }
    if (seen.has(id)) {
      fields[`items[${index}].id`] = 'ID が重複しています';
      continue;
    }
    if (!isValidVersion(version)) {
      fields[`items[${index}].version`] = '1 以上の整数で指定してください';
      continue;
    }
    seen.add(id);
    parsed.push({ id, version });
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { items: parsed } };
}
