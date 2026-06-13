import { describe, expect, it } from 'vitest';
import { parseReflectionRequest, parseReflectionsQuery } from './reflections.js';

const TODAY = '2026-06-11';

function validBody() {
  return {
    free_text: '朝の時間が取れた。',
    want_to_do: null,
    unconscious_desire: null,
  };
}

describe('parseReflectionRequest', () => {
  it('accepts a valid new reflection without version', () => {
    const result = parseReflectionRequest(TODAY, validBody(), TODAY);
    expect(result).toEqual({
      ok: true,
      input: {
        free_text: '朝の時間が取れた。',
        want_to_do: null,
        unconscious_desire: null,
        version: undefined,
      },
    });
  });

  it('accepts an update with version', () => {
    const result = parseReflectionRequest(TODAY, { ...validBody(), version: 3 }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.version).toBe(3);
  });

  it('treats missing text fields as null', () => {
    const result = parseReflectionRequest(TODAY, {}, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.free_text).toBeNull();
      expect(result.input.want_to_do).toBeNull();
      expect(result.input.unconscious_desire).toBeNull();
    }
  });

  it('accepts a date 30 days ago', () => {
    expect(parseReflectionRequest('2026-05-12', validBody(), TODAY).ok).toBe(true);
  });

  it('rejects a date 31 days ago', () => {
    const result = parseReflectionRequest('2026-05-11', validBody(), TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: expect.stringContaining('30日') } });
  });

  it('rejects a future date', () => {
    const result = parseReflectionRequest('2026-06-12', validBody(), TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: expect.any(String) } });
  });

  it('rejects a malformed date', () => {
    const result = parseReflectionRequest('not-a-date', validBody(), TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: 'YYYY-MM-DD で指定してください' } });
  });

  it('rejects an impossible date', () => {
    const result = parseReflectionRequest('2026-02-31', validBody(), TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: 'YYYY-MM-DD で指定してください' } });
  });

  it('rejects a non-object body', () => {
    const result = parseReflectionRequest(TODAY, ['a'], TODAY);
    expect(result).toMatchObject({ ok: false, fields: { body: expect.any(String) } });
  });

  it('rejects non-string text fields', () => {
    const result = parseReflectionRequest(TODAY, { ...validBody(), free_text: 1 }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { free_text: expect.any(String) } });
  });

  it('rejects text over 5000 characters', () => {
    const result = parseReflectionRequest(TODAY, { ...validBody(), free_text: 'あ'.repeat(5001) }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { free_text: expect.stringContaining('5000') } });
  });

  it('rejects invalid versions', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      const result = parseReflectionRequest(TODAY, { ...validBody(), version }, TODAY);
      expect(result.ok, `version=${String(version)}`).toBe(false);
    }
  });

  it('collects date and field errors together', () => {
    const result = parseReflectionRequest('bad', { free_text: 1 }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: expect.any(String), free_text: expect.any(String) } });
  });
});

describe('parseReflectionsQuery', () => {
  it('defaults to the last 30 days when both omitted', () => {
    const result = parseReflectionsQuery(null, null, TODAY);
    expect(result).toEqual({ ok: true, query: { from: '2026-05-13', to: TODAY } });
  });

  it('defaults from to 29 days before an explicit to', () => {
    const result = parseReflectionsQuery(null, '2026-06-01', TODAY);
    expect(result).toEqual({ ok: true, query: { from: '2026-05-03', to: '2026-06-01' } });
  });

  it('defaults to to today when only from is given', () => {
    const result = parseReflectionsQuery('2026-06-01', null, TODAY);
    expect(result).toEqual({ ok: true, query: { from: '2026-06-01', to: TODAY } });
  });

  it('accepts an explicit range', () => {
    const result = parseReflectionsQuery('2026-05-01', '2026-06-06', TODAY);
    expect(result).toEqual({ ok: true, query: { from: '2026-05-01', to: '2026-06-06' } });
  });

  it('accepts exactly a 90-day span', () => {
    // 2026-03-09 .. 2026-06-06 inclusive = 90 days
    expect(parseReflectionsQuery('2026-03-09', '2026-06-06', TODAY).ok).toBe(true);
  });

  it('rejects a span over 90 days', () => {
    const result = parseReflectionsQuery('2026-03-08', '2026-06-06', TODAY);
    expect(result).toMatchObject({ ok: false, fields: { range: expect.stringContaining('90') } });
  });

  it('rejects from after to', () => {
    const result = parseReflectionsQuery('2026-06-07', '2026-06-06', TODAY);
    expect(result).toMatchObject({ ok: false, fields: { range: expect.any(String) } });
  });

  it('rejects malformed from / to', () => {
    expect(parseReflectionsQuery('nope', null, TODAY)).toMatchObject({ ok: false, fields: { from: expect.any(String) } });
    expect(parseReflectionsQuery(null, '2026-13-40', TODAY)).toMatchObject({ ok: false, fields: { to: expect.any(String) } });
  });
});
