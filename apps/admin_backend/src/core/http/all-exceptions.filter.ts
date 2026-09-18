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
      // WHY: a blank tenant id is a caller error, not a server fault. Without
      // this branch the RLS tenant-binding guard would surface to the client
      // as an opaque 500 instead of a clean 400. The message is deliberately
      // generic: no SQL text, error class name, or stack trace is echoed.
      status = 400;
      message = {
        statusCode: 400,
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
