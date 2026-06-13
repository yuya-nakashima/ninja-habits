import { describe, expect, it } from 'vitest';
import {
  parseCategoryCreateRequest, parseCategoryUpdateRequest,
  parseItemCreateRequest, parseItemUpdateRequest,
} from './wishes.js';

describe('parseCategoryCreateRequest', () => {
  it('accepts a name', () => {
    expect(parseCategoryCreateRequest({ name: '読みたい本' })).toEqual({ ok: true, input: { name: '読みたい本' } });
  });

  it('rejects blank, missing, or too long names', () => {
    for (const name of [undefined, '', '  ', 1, null, 'あ'.repeat(101)]) {
      expect(parseCategoryCreateRequest({ name }).ok, `name=${String(name)}`).toBe(false);
    }
  });
});

describe('parseCategoryUpdateRequest', () => {
  it('accepts name + version', () => {
    expect(parseCategoryUpdateRequest({ name: '読んだ本', version: 2 }))
      .toEqual({ ok: true, input: { name: '読んだ本', version: 2 } });
  });

  it('requires version', () => {
    expect(parseCategoryUpdateRequest({ name: 'x' })).toMatchObject({ ok: false, fields: { version: expect.any(String) } });
  });

  it('rejects invalid versions', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      expect(parseCategoryUpdateRequest({ name: 'x', version }).ok, `version=${String(version)}`).toBe(false);
    }
  });

  it('requires name', () => {
    expect(parseCategoryUpdateRequest({ version: 1 })).toMatchObject({ ok: false, fields: { name: expect.any(String) } });
  });
});

describe('parseItemCreateRequest / parseItemUpdateRequest', () => {
  it('accepts content', () => {
    expect(parseItemCreateRequest({ content: 'アトミック・ハビット' }))
      .toEqual({ ok: true, input: { content: 'アトミック・ハビット' } });
  });

  it('rejects blank or too long content', () => {
    expect(parseItemCreateRequest({ content: ' ' }).ok).toBe(false);
    expect(parseItemCreateRequest({ content: 'あ'.repeat(501) }).ok).toBe(false);
  });

  it('update requires content + version', () => {
    expect(parseItemUpdateRequest({ content: 'x' })).toMatchObject({ ok: false, fields: { version: expect.any(String) } });
    expect(parseItemUpdateRequest({ version: 1 })).toMatchObject({ ok: false, fields: { content: expect.any(String) } });
    expect(parseItemUpdateRequest({ content: 'x', version: 1 })).toEqual({ ok: true, input: { content: 'x', version: 1 } });
  });
});
