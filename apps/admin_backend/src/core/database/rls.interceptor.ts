import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    // In a real RLS setup, this interceptor would set the tenant context 
    // in the DB session. For now, we ensure the tenant_id from JWT
    // is available for services and repositories.
    
    // Logic to set DB session variable would go here if using a 
    // transactional approach or a connection-bound session.
    
    return next.handle();
  }
}
