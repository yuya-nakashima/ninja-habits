import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafeConfig } from './config.js';
import type { ApiConfig } from './config.js';

const base: ApiConfig = {
  allowedOrigin: 'http://localhost:5173',
  databaseUrl: 'postgresql://x',
  devAuth: false,
  port: 8080,
  cognitoIssuer: null,
  cognitoClientId: null,
};

const ISSUER = 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool';

afterEach(() => { vi.unstubAllEnvs(); });

describe('assertSafeConfig', () => {
  it('allows local dev auth without a Cognito issuer', () => {
    expect(() => assertSafeConfig({ ...base, devAuth: true })).not.toThrow();
  });

  it('allows real Cognito mode with issuer + client id', () => {
    expect(() => assertSafeConfig({ ...base, cognitoIssuer: ISSUER, cognitoClientId: 'c1' })).not.toThrow();
  });

  it('rejects dev auth under NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertSafeConfig({ ...base, devAuth: true })).toThrow(/API_DEV_AUTH/);
  });

  it('rejects dev auth combined with a Cognito issuer', () => {
    expect(() => assertSafeConfig({ ...base, devAuth: true, cognitoIssuer: ISSUER, cognitoClientId: 'c1' }))
      .toThrow(/API_DEV_AUTH/);
  });

  it('requires COGNITO_CLIENT_ID when an issuer is configured', () => {
    expect(() => assertSafeConfig({ ...base, cognitoIssuer: ISSUER, cognitoClientId: null }))
      .toThrow(/COGNITO_CLIENT_ID/);
  });
});
