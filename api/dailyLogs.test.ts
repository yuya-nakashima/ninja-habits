import { describe, expect, it } from 'vitest';
import { parseDailyLogRequest } from './dailyLogs.js';

const TODAY = '2026-06-11';

describe('parseDailyLogRequest', () => {
  it('accepts a new goal log without version', () => {
    const result = parseDailyLogRequest('goal', TODAY, { done: true, count: 1, minimum_done: true }, TODAY);
    expect(result).toEqual({
      ok: true,
      input: { done: true, count: 1, minimum_done: true, version: undefined },
    });
  });

  it('accepts an update with version', () => {
    const result = parseDailyLogRequest('goal', TODAY, { done: true, count: 2, version: 3 }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.version).toBe(3);
  });

  it('defaults count to 0 and minimum_done to false', () => {
    const result = parseDailyLogRequest('goal', TODAY, { done: true }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.count).toBe(0);
      expect(result.input.minimum_done).toBe(false);
    }
  });

  it('normalizes count to 0 when done=false', () => {
    const result = parseDailyLogRequest('goal', TODAY, { done: false, count: 5 }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.count).toBe(0);
  });

  it('requires done as boolean', () => {
    for (const done of [undefined, null, 'true', 1]) {
      const result = parseDailyLogRequest('goal', TODAY, { done, count: 1 }, TODAY);
      expect(result, `done=${String(done)}`).toMatchObject({ ok: false, fields: { done: expect.any(String) } });
    }
  });

  it('rejects invalid counts', () => {
    for (const count of [-1, 1.5, '1', null]) {
      const result = parseDailyLogRequest('goal', TODAY, { done: true, count }, TODAY);
      expect(result.ok, `count=${String(count)}`).toBe(false);
    }
  });

  it('rejects minimum_done for habit logs', () => {
    const result = parseDailyLogRequest('habit', TODAY, { done: true, count: 1, minimum_done: true }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { minimum_done: '目標ログだけで指定できます' } });
  });

  it('rejects non-boolean minimum_done for goal logs', () => {
    const result = parseDailyLogRequest('goal', TODAY, { done: true, count: 1, minimum_done: 'yes' }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { minimum_done: expect.any(String) } });
  });

  it('rejects invalid versions', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      const result = parseDailyLogRequest('goal', TODAY, { done: true, count: 1, version }, TODAY);
      expect(result.ok, `version=${String(version)}`).toBe(false);
    }
  });

  it('rejects a future date', () => {
    const result = parseDailyLogRequest('goal', '2026-06-12', { done: true, count: 1 }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: expect.any(String) } });
  });

  it('rejects a date 31 days ago and accepts 30 days ago', () => {
    expect(parseDailyLogRequest('goal', '2026-05-11', { done: true, count: 1 }, TODAY).ok).toBe(false);
    expect(parseDailyLogRequest('goal', '2026-05-12', { done: true, count: 1 }, TODAY).ok).toBe(true);
  });

  it('rejects a malformed date', () => {
    const result = parseDailyLogRequest('habit', 'not-a-date', { done: true, count: 1 }, TODAY);
    expect(result).toMatchObject({ ok: false, fields: { date: 'YYYY-MM-DD で指定してください' } });
  });

  it('rejects a non-object body', () => {
    const result = parseDailyLogRequest('goal', TODAY, 'done', TODAY);
    expect(result).toMatchObject({ ok: false, fields: { body: expect.any(String) } });
  });
});
