import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { DeviceSyncPrincipal } from '../../modules/identity/security/device-sync-principal';

interface RequestWithPrincipalOrUser extends Request {
  user?: {
    tenant_id: string;
    sub?: string;
    email?: string;
    role?: string;
  };
  devicePrincipal?: DeviceSyncPrincipal;
}

export const GetTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipalOrUser>();
    return request.devicePrincipal?.tenantId ?? request.user?.tenant_id;
  },
);
