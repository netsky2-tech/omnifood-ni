import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenant_id;
  },
);
