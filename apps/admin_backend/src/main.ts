import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './core/app/app.module';

@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let message: unknown = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    }

    this.logger.error(
      `[${request.method}] ${request.url} -> ${status}: ${JSON.stringify(message)}`,
    );

    response.status(status).json(message);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Request logging
  const logger = new Logger('HTTP');
  app.use((req: any, _res: any, next: () => void) => {
    logger.log(`${req.method} ${req.url} from ${req.socket?.remoteAddress}`);
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
  app.enableCors({ origin: true, credentials: true });

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
void bootstrap();
