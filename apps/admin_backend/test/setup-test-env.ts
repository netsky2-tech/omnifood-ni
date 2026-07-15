process.env.NODE_ENV ??= 'test';
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '5432';
process.env.DB_USERNAME ??= 'postgres';
process.env.DB_PASSWORD ??= 'admin';
process.env.DB_DATABASE ??= 'omnifood';
process.env.JWT_SECRET ??=
  'test-only-jwt-secret-with-at-least-thirty-two-bytes';
process.env.JWT_ISSUER ??= 'omnifood-admin';
process.env.JWT_AUDIENCE ??= 'omnifood-pos';
process.env.JWT_ACCESS_TTL_SECONDS ??= '3600';
process.env.JWT_REFRESH_TTL_SECONDS ??= '604800';
process.env.JWT_CLOCK_TOLERANCE_SECONDS ??= '5';
process.env.JWT_ALGORITHM ??= 'HS256';
