import { describe, expect, it } from 'vitest';
import {
  parseGroupCreateRequest, parseGroupUpdateRequest,
  parseItemCreateRequest, parseItemUpdateRequest, parseNotificationRequest,
} from './habits.js';

describe('parseGroupCreateRequest', () => {
  it('accepts a name', () => {
    expect(parseGroupCreateRequest({ name: '朝の習慣' }))
      .toEqual({ ok: true, input: { name: '朝の習慣' } });
  });

  it('rejects missing, blank, or too long names', () => {
    for (const name of [undefined, '', '  ', 1, 'あ'.repeat(101)]) {
      expect(parseGroupCreateRequest({ name }).ok, `name=${String(name)}`).toBe(false);
    }
  });
});

describe('parseGroupUpdateRequest', () => {
  it('accepts name and woop fields with version', () => {
    const result = parseGroupUpdateRequest({
      name: '朝のルーティン', woop_wish: '気持ちを整える', woop_plan: null, version: 2,
    });
    expect(result).toEqual({
      ok: true,
      input: { name: '朝のルーティン', woop_wish: '気持ちを整える', woop_plan: null, version: 2 },
    });
  });

  it('accepts is_active only', () => {
    expect(parseGroupUpdateRequest({ is_active: true, version: 1 }).ok).toBe(true);
  });

  it('requires version and at least one field', () => {
    expect(parseGroupUpdateRequest({ name: 'x' })).toMatchObject({ ok: false, fields: { version: expect.any(String) } });
    expect(parseGroupUpdateRequest({ version: 1 })).toMatchObject({ ok: false, fields: { body: expect.any(String) } });
  });

  it('rejects woop fields over 1000 characters', () => {
    const result = parseGroupUpdateRequest({ woop_wish: 'あ'.repeat(1001), version: 1 });
    expect(result).toMatchObject({ ok: false, fields: { woop_wish: expect.stringContaining('1000') } });
  });
});

describe('parseItemCreateRequest / parseItemUpdateRequest', () => {
  it('accepts content', () => {
    expect(parseItemCreateRequest({ content: '水を200ml飲む' }))
      .toEqual({ ok: true, input: { content: '水を200ml飲む' } });
  });

  it('rejects blank or too long content', () => {
    expect(parseItemCreateRequest({ content: ' ' }).ok).toBe(false);
    expect(parseItemCreateRequest({ content: 'あ'.repeat(501) }).ok).toBe(false);
  });

  it('update requires version and at least one field', () => {
    expect(parseItemUpdateRequest({ content: 'x' }).ok).toBe(false);
    expect(parseItemUpdateRequest({ version: 1 })).toMatchObject({ ok: false, fields: { body: expect.any(String) } });
    expect(parseItemUpdateRequest({ content: 'x', version: 1 }).ok).toBe(true);
    expect(parseItemUpdateRequest({ is_active: false, version: 2 }).ok).toBe(true);
  });
});

describe('parseNotificationRequest', () => {
  const valid = {
    on: true,
    times: ['07:00', '22:30'],
    days: [true, true, true, true, true, false, false],
  };

  it('accepts a new notification without version', () => {
    expect(parseNotificationRequest(valid)).toEqual({
      ok: true,
      input: { ...valid, version: undefined },
    });
  });

  it('accepts an update with version', () => {
    const result = parseNotificationRequest({ ...valid, version: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.version).toBe(3);
  });

  it('requires on as boolean', () => {
    expect(parseNotificationRequest({ ...valid, on: 'true' })).toMatchObject({ ok: false, fields: { on: expect.any(String) } });
  });

  it('rejects invalid times', () => {
    for (const times of [undefined, [], ['7:00'], ['24:00'], ['07:60'], ['0700'], [700]]) {
      const result = parseNotificationRequest({ ...valid, times });
      expect(result.ok, `times=${JSON.stringify(times)}`).toBe(false);
    }
  });

  it('accepts boundary times', () => {
    expect(parseNotificationRequest({ ...valid, times: ['00:00', '23:59'] }).ok).toBe(true);
  });

  it('rejects invalid days', () => {
    for (const days of [undefined, [], [true, true, true], Array(7).fill('true'), Array(8).fill(true)]) {
      const result = parseNotificationRequest({ ...valid, days });
      expect(result.ok, `days=${JSON.stringify(days)}`).toBe(false);
    }
  });

  it('rejects invalid versions', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      expect(parseNotificationRequest({ ...valid, version }).ok, `version=${String(version)}`).toBe(false);
    }
  });
});
