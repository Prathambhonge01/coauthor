const prod = process.env.NODE_ENV === 'production';

if (prod && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/coauthor',
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN || '',
  persistDebounceMs: Number(process.env.PERSIST_DEBOUNCE_MS || 1500),
  autoVersionMs: Number(process.env.AUTO_VERSION_MS || 10 * 60 * 1000),
  prod,
};
