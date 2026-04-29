import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    tenant_id: string;
    sub: string;
    email: string;
    role: string;
  };
}

export const GetTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user?.tenant_id;
  },
);
