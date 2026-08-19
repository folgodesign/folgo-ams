import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  accessTokenTtlMin: Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 15),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  bootstrapSecret: process.env.BOOTSTRAP_SECRET ?? 'folgo-bootstrap',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
  consentVersion: '2026-08-19',
};
