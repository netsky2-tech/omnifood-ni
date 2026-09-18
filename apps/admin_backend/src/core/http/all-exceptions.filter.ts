import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContextRequiredError } from '../database/tenant-transaction';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
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
    } else if (exception instanceof TenantContextRequiredError) {
      // WHY: the tenant is credential-derived (request.user / devicePrincipal),
      // never from a request body or header, so a missing tenant means the
      // presented credential did not establish a tenant scope — an
      // authorization failure, not a malformed request. 401 is also what the
      // rest of the codebase already returns for a missing tenant context.
      // The message is deliberately generic: no SQL text, error class name,
      // or stack trace is echoed.
      status = 401;
      message = {
        statusCode: 401,
        message: 'Missing or invalid tenant context',
      };
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
