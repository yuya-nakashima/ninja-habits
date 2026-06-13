import { describe, expect, it } from 'vitest';
import { validateClaims } from './auth.js';

const ISSUER = 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool';
const CLIENT_ID = 'client-abc';
const NOW = 1_700_000_000_000;
const FUTURE = Math.floor(NOW / 1000) + 3600;

const header = { alg: 'RS256', kid: 'kid-1' };
const idClaims = { iss: ISSUER, exp: FUTURE, token_use: 'id', sub: 'u1', aud: CLIENT_ID };
const accessClaims = { iss: ISSUER, exp: FUTURE, token_use: 'access', sub: 'u1', client_id: CLIENT_ID };

const expect_ = { issuer: ISSUER, clientId: CLIENT_ID, now: NOW };

describe('validateClaims', () => {
  it('accepts a valid id token (aud matches clientId)', () => {
    expect(validateClaims(header, idClaims, expect_)).toBe(true);
  });

  it('accepts a valid access token (client_id matches clientId)', () => {
    expect(validateClaims(header, accessClaims, expect_)).toBe(true);
  });

  it('rejects a non-RS256 alg or missing kid', () => {
    expect(validateClaims({ alg: 'HS256', kid: 'k' }, idClaims, expect_)).toBe(false);
    expect(validateClaims({ alg: 'RS256' }, idClaims, expect_)).toBe(false);
  });

  it('rejects a wrong issuer', () => {
    expect(validateClaims(header, { ...idClaims, iss: 'https://evil' }, expect_)).toBe(false);
  });

  it('rejects an expired token', () => {
    expect(validateClaims(header, { ...idClaims, exp: Math.floor(NOW / 1000) - 1 }, expect_)).toBe(false);
  });

  it('rejects an unknown token_use', () => {
    expect(validateClaims(header, { ...idClaims, token_use: 'refresh' }, expect_)).toBe(false);
  });

  it('rejects an id token whose aud is a different client', () => {
    expect(validateClaims(header, { ...idClaims, aud: 'other-client' }, expect_)).toBe(false);
  });

  it('rejects an access token whose client_id is a different client', () => {
    expect(validateClaims(header, { ...accessClaims, client_id: 'other-client' }, expect_)).toBe(false);
  });

  it('rejects an id token that carries client_id but no aud when clientId is enforced', () => {
    expect(validateClaims(header, { ...idClaims, aud: undefined, client_id: CLIENT_ID }, expect_)).toBe(false);
  });

  it('skips audience check when clientId is not configured', () => {
    expect(validateClaims(header, { ...idClaims, aud: 'anything' }, { issuer: ISSUER, clientId: null, now: NOW })).toBe(true);
  });
});
