import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

interface RequestWithTenantUser extends Request {
  user?: {
    tenant_id?: string;
  };
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithTenantUser>();
    if (!request.user?.tenant_id?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }

    // Services that access RLS-protected tables must bind this tenant to a
    // transaction-scoped PostgreSQL session variable before querying.
    // CatalogService does this with set_config('app.tenant_id', $1, true).

    return next.handle();
  }
}
