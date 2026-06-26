export interface AuthSession {
  accessToken: string;
  devSub?: string;
  email: string | null;
  expiresAt: number;
  idToken: string;
  refreshToken: string | null;
}

export interface AuthConfig {
  clientId: string;
  domain: string;
  logoutUri: string;
  redirectUri: string;
}

const SESSION_KEY = 'ninja-habits-auth-session';
const PKCE_VERIFIER_KEY = 'ninja-habits-pkce-verifier';
const OAUTH_STATE_KEY = 'ninja-habits-oauth-state';

export function getAuthConfig(): AuthConfig | null {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI ?? window.location.origin + '/';
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI ?? redirectUri;

  if (!clientId || !domain) return null;
  return {
    clientId,
    domain: domain.replace(/\/+$/, ''),
    logoutUri,
    redirectUri,
  };
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.idToken || !parsed.accessToken || parsed.expiresAt <= Date.now()) {
      clearAuthSession();
      return null;
    }
    return parsed;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function isDevAuthEnabled(): boolean {
  return import.meta.env.VITE_DEV_AUTH === 'true';
}

export function startDevLogin(): AuthSession {
  const sub = import.meta.env.VITE_DEV_AUTH_SUB ?? 'local-user';
  const email = import.meta.env.VITE_DEV_AUTH_EMAIL ?? 'local@example.com';
  const session: AuthSession = {
    accessToken: 'dev-access-token',
    devSub: sub,
    email,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    idToken: 'dev-id-token',
    refreshToken: null,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

export async function startHostedUiLogin(config: AuthConfig) {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = createCodeVerifier();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });

  window.location.assign(`${config.domain}/oauth2/authorize?${params.toString()}`);
}

export function startHostedUiLogout(config: AuthConfig) {
  clearAuthSession();
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  window.location.assign(`${config.domain}/logout?${params.toString()}`);
}

// 単発の認可コードを「1回だけ」交換するための in-flight ガード。
// dev の React StrictMode はコールバック effect を二重実行するため、共有しないと
// 同じ code を2回 /oauth2/token へ送り、2回目が 400（invalid_grant）になる。
// 冪等性は auth.ts に閉じ込め、App.tsx は完了処理を呼ぶだけにする。
let inflightCallback: Promise<AuthSession | null> | null = null;

export function completeHostedUiCallback(config: AuthConfig, url: URL): Promise<AuthSession | null> {
  // 進行中の交換があれば同じ Promise を共有する（二重実行でも交換は1回、成功 session を共有）。
  if (inflightCallback) return inflightCallback;

  const code = url.searchParams.get('code');
  if (!code) return Promise.resolve(loadAuthSession());

  inflightCallback = exchangeAuthorizationCode(config, url, code)
    .finally(() => { inflightCallback = null; });
  return inflightCallback;
}

async function exchangeAuthorizationCode(
  config: AuthConfig,
  url: URL,
  code: string,
): Promise<AuthSession | null> {
  // OAuth state を照合して CSRF / 意図しない callback 混入を弾く
  const returnedState = url.searchParams.get('state');
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!savedState || returnedState !== savedState) {
    clearAuthSession();
    throw new Error('OAuth state mismatch.');
  }

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) throw new Error('Missing PKCE verifier.');

  // 交換前に URL から code を除去（リロード/再マウントでの再交換も防ぐ）。
  window.history.replaceState({}, document.title, window.location.pathname);

  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange Cognito authorization code.');
  }

  const token = await response.json() as {
    access_token: string;
    expires_in: number;
    id_token: string;
    refresh_token?: string;
  };

  const session: AuthSession = {
    accessToken: token.access_token,
    email: readJwtEmail(token.id_token),
    expiresAt: Date.now() + token.expires_in * 1000,
    idToken: token.id_token,
    refreshToken: token.refresh_token ?? null,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  return session;
}

function createCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readJwtEmail(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(normalized)));
    const claims = JSON.parse(json) as { email?: unknown };
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}
