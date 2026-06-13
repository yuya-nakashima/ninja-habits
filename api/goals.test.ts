import { describe, expect, it } from 'vitest';
import { parseGoalCreateRequest, parseGoalUpdateRequest, parseReorderRequest } from './goals.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('parseGoalCreateRequest', () => {
  it('accepts content with minimum_goal', () => {
    const result = parseGoalCreateRequest({ content: '瞑想を30分行う', minimum_goal: '1分だけ' });
    expect(result).toEqual({ ok: true, input: { content: '瞑想を30分行う', minimum_goal: '1分だけ' } });
  });

  it('defaults minimum_goal to null', () => {
    const result = parseGoalCreateRequest({ content: 'Run' });
    expect(result).toEqual({ ok: true, input: { content: 'Run', minimum_goal: null } });
  });

  it('rejects missing or blank content', () => {
    for (const content of [undefined, '', '   ', 1, null]) {
      const result = parseGoalCreateRequest({ content });
      expect(result.ok, `content=${String(content)}`).toBe(false);
    }
  });

  it('rejects content over 500 characters', () => {
    const result = parseGoalCreateRequest({ content: 'あ'.repeat(501) });
    expect(result).toMatchObject({ ok: false, fields: { content: expect.stringContaining('500') } });
  });

  it('rejects minimum_goal over 500 characters', () => {
    const result = parseGoalCreateRequest({ content: 'Run', minimum_goal: 'あ'.repeat(501) });
    expect(result).toMatchObject({ ok: false, fields: { minimum_goal: expect.stringContaining('500') } });
  });
});

describe('parseGoalUpdateRequest', () => {
  it('accepts a partial update with version', () => {
    const result = parseGoalUpdateRequest({ content: 'Run more', version: 2 });
    expect(result).toEqual({ ok: true, input: { content: 'Run more', version: 2 } });
  });

  it('accepts minimum_goal null and is_active', () => {
    const result = parseGoalUpdateRequest({ minimum_goal: null, is_active: false, version: 1 });
    expect(result).toEqual({ ok: true, input: { minimum_goal: null, is_active: false, version: 1 } });
  });

  it('requires version', () => {
    const result = parseGoalUpdateRequest({ content: 'Run' });
    expect(result).toMatchObject({ ok: false, fields: { version: expect.any(String) } });
  });

  it('requires at least one updatable field', () => {
    const result = parseGoalUpdateRequest({ version: 1 });
    expect(result).toMatchObject({ ok: false, fields: { body: expect.any(String) } });
  });

  it('rejects non-boolean is_active', () => {
    const result = parseGoalUpdateRequest({ is_active: 'true', version: 1 });
    expect(result).toMatchObject({ ok: false, fields: { is_active: expect.any(String) } });
  });
});

describe('parseReorderRequest', () => {
  it('accepts a list of id/version pairs', () => {
    const result = parseReorderRequest({ items: [{ id: UUID_A, version: 1 }, { id: UUID_B, version: 3 }] });
    expect(result).toEqual({ ok: true, input: { items: [{ id: UUID_A, version: 1 }, { id: UUID_B, version: 3 }] } });
  });

  it('rejects an empty or missing items array', () => {
    expect(parseReorderRequest({ items: [] }).ok).toBe(false);
    expect(parseReorderRequest({}).ok).toBe(false);
  });

  it('rejects malformed ids and duplicate ids', () => {
    expect(parseReorderRequest({ items: [{ id: 'nope', version: 1 }] }).ok).toBe(false);
    expect(parseReorderRequest({ items: [{ id: UUID_A, version: 1 }, { id: UUID_A, version: 1 }] }).ok).toBe(false);
  });

  it('requires a valid version on every item', () => {
    const result = parseReorderRequest({ items: [{ id: UUID_A, version: 1 }, { id: UUID_B }] });
    expect(result).toMatchObject({ ok: false, fields: { 'items[1].version': expect.any(String) } });
  });
});
