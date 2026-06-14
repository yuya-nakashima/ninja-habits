export interface ApiConfig {
  allowedOrigin: string;
  databaseUrl: string;
  devAuth: boolean;
  port: number;
  cognitoIssuer: string | null;
  cognitoClientId: string | null;
}

export function readConfig(): ApiConfig {
  return {
    allowedOrigin: process.env.API_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5173',
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://ninja:ninja@127.0.0.1:15432/ninja_habits',
    devAuth: process.env.API_DEV_AUTH === 'true',
    port: Number(process.env.PORT ?? '8080'),
    cognitoIssuer: readCognitoIssuer(),
    cognitoClientId: process.env.COGNITO_CLIENT_ID ?? null,
  };
}

/**
 * 危険な設定を起動時に弾く（誤設定での認証バイパス・検証スキップ防止）。
 * readConfig とは分離し、migration など他経路には影響させない。
 */
export function assertSafeConfig(config: ApiConfig): void {
  if (config.devAuth) {
    // dev ヘッダ認証は任意ユーザーになりすませる。本番/実 Cognito と併用しない。
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API_DEV_AUTH must be disabled when NODE_ENV=production.');
    }
    if (config.cognitoIssuer) {
      throw new Error('API_DEV_AUTH must not be combined with a Cognito issuer. Disable API_DEV_AUTH for real auth.');
    }
  }
  // 実 Cognito モードでは aud 検証を必須にする（同一 User Pool の別クライアント発行トークンを弾く）。
  if (config.cognitoIssuer && !config.cognitoClientId) {
    throw new Error('COGNITO_CLIENT_ID is required when COGNITO_ISSUER / COGNITO_USER_POOL_ID is set.');
  }
}

function readCognitoIssuer(): string | null {
  if (process.env.COGNITO_ISSUER) return process.env.COGNITO_ISSUER.replace(/\/+$/, '');

  const region = process.env.AWS_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!region || !userPoolId) return null;

  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}
