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

function readCognitoIssuer(): string | null {
  if (process.env.COGNITO_ISSUER) return process.env.COGNITO_ISSUER.replace(/\/+$/, '');

  const region = process.env.AWS_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!region || !userPoolId) return null;

  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}
