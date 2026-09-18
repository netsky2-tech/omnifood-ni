import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './core/app/app.module';
import { resolveCorsOrigins } from './core/config/http-security.config';

@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let message: unknown = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof Error) {
      this.logger.error(
        `[${request.method}] ${request.url} unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    this.logger.error(
      `[${request.method}] ${request.url} -> ${status}: ${JSON.stringify(message)}`,
    );

    response.status(status).json(message);
  }
}

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

  // Global prefix
  app.setGlobalPrefix('api');

  // Request logging
  const logger = new Logger('HTTP');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.log(
      `${req.method} ${req.url} from ${req.socket.remoteAddress ?? 'unknown'}`,
    );
    next();
  });

  // Security - relaxed for local dev
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: false,
    }),
  );
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
