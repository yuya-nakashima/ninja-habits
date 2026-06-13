import { createPublicKey, verify } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ApiConfig } from './config.js';

export interface AuthUser {
  cognitoSub: string;
  email: string;
}

interface Jwk {
  alg?: string;
  e: string;
  kid: string;
  kty: string;
  n: string;
  use?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwtClaims {
  aud?: string;
  client_id?: string;
  email?: string;
  exp?: number;
  iss?: string;
  sub?: string;
  token_use?: string;
}

let jwksCache: { issuer: string; keys: Jwk[]; fetchedAt: number } | null = null;

export async function authenticate(req: IncomingMessage, config: ApiConfig): Promise<AuthUser | null> {
  if (config.devAuth) {
    const sub = readHeader(req, 'x-dev-cognito-sub');
    if (sub) {
      return {
        cognitoSub: sub,
        email: readHeader(req, 'x-dev-email') ?? `${sub}@dev.local`,
      };
    }
  }

  const header = readHeader(req, 'authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token || !config.cognitoIssuer) return null;

  const claims = await verifyCognitoJwt(token, {
    issuer: config.cognitoIssuer,
    clientId: config.cognitoClientId,
  });
  if (!claims?.sub) return null;

  return {
    cognitoSub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : `${claims.sub}@unknown.local`,
  };
}

export interface JwtExpectations {
  issuer: string;
  clientId: string | null;
  now?: number;
}

/**
 * 署名以外のクレーム検証（純関数・テスト可能）。
 * - iss 一致 / exp 未来 / token_use は id|access
 * - clientId 指定時: id トークンは aud、access トークンは client_id を照合
 */
export function validateClaims(header: JwtHeader, claims: JwtClaims, expect: JwtExpectations): boolean {
  const now = expect.now ?? Date.now();
  if (header.alg !== 'RS256' || !header.kid) return false;
  if (claims.iss !== expect.issuer) return false;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return false;
  if (claims.token_use !== 'access' && claims.token_use !== 'id') return false;
  if (expect.clientId) {
    const audience = claims.token_use === 'id' ? claims.aud : claims.client_id;
    if (audience !== expect.clientId) return false;
  }
  return true;
}

async function verifyCognitoJwt(token: string, expect: JwtExpectations): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = parseBase64UrlJson<JwtHeader>(parts[0]);
  const claims = parseBase64UrlJson<JwtClaims>(parts[1]);
  if (!header || !claims) return null;
  if (!validateClaims(header, claims, expect)) return null;

  const jwk = await findJwk(expect.issuer, header.kid!);
  if (!jwk) return null;

  const signatureInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = verify('RSA-SHA256', signatureInput, key, signature);
  return ok ? claims : null;
}

async function findJwk(issuer: string, kid: string): Promise<Jwk | null> {
  const now = Date.now();
  if (!jwksCache || jwksCache.issuer !== issuer || now - jwksCache.fetchedAt > 60 * 60 * 1000) {
    const response = await fetch(`${issuer}/.well-known/jwks.json`);
    if (!response.ok) return null;
    const body = await response.json() as { keys?: Jwk[] };
    jwksCache = { issuer, keys: body.keys ?? [], fetchedAt: now };
  }
  return jwksCache.keys.find(key => key.kid === kid) ?? null;
}

function parseBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function readHeader(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  return typeof value === 'string' ? value : null;
}
