import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  sub: string;
  email: string;
  tenant_id: string;
  role: string;
}

interface RequestWithPotentialUser {
  readonly user?: unknown;
}

export const isCurrentUserPayload = (
  value: unknown,
): value is CurrentUserPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.tenant_id === 'string' &&
    typeof candidate.role === 'string'
  );
};

export const extractCurrentUser = (
  data: keyof CurrentUserPayload | undefined,
  ctx: ExecutionContext,
):
  | CurrentUserPayload
  | CurrentUserPayload[keyof CurrentUserPayload]
  | undefined => {
  const request = ctx.switchToHttp().getRequest<RequestWithPotentialUser>();
  const rawUser = request?.user;
  if (!isCurrentUserPayload(rawUser)) {
    return undefined;
  }
  return data ? rawUser[data] : rawUser;
};

export const CurrentUser = createParamDecorator(extractCurrentUser);
