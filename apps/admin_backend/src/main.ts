import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { Express, Request, Response, NextFunction } from 'express';
import { AppModule } from './core/app/app.module';
import { resolveCorsOrigins } from './core/config/http-security.config';
import { resolveTrustProxyHops } from './core/config/trust-proxy.config';
import { helmetOptions } from './core/config/helmet.config';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter';

async function bootstrap() {
  process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
  });

  // Fail closed on a missing or malformed CORS allowlist before binding.
  const corsOrigins = resolveCorsOrigins({
    nodeEnv: process.env.NODE_ENV,
    raw: process.env.CORS_ALLOWED_ORIGINS,
  });

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Resolve the real client address behind the reverse-proxy chain so per-IP
  // rate limiting and access-log forensics are not keyed on the proxy IP.
  // A malformed hop count aborts startup (fail closed).
  const trustProxyHops = resolveTrustProxyHops({
    raw: process.env.TRUST_PROXY_HOPS,
  });
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', trustProxyHops);

  // Global prefix
  app.setGlobalPrefix('api');

  // Request logging
  const logger = new Logger('HTTP');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // req.ip is the trust-proxy-resolved address — the same one the per-IP
    // rate limiting and audit keys derive from. Logging the socket peer
    // instead logs Railway's internal mesh (a different 100.64.0.x per
    // request), which made production diagnosis misleading (issue #894).
    logger.log(`${req.method} ${req.url} from ${req.ip ?? 'unknown'}`);
    next();
  });

  // Security: relaxed locally, hardened in production (HSTS + deny-by-default
  // CSP - the API serves JSON, not HTML). See core/config/helmet.config.ts.
  app.use(helmet(helmetOptions(process.env.NODE_ENV)));
  app.enableCors({ origin: corsOrigins, credentials: true });
  console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter for debugging
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend listening on 0.0.0.0:${port}`);
}
void bootstrap().catch((error: unknown) => {
  console.error('FATAL: backend failed to start:', error);
  process.exit(1);
});
