import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../entities/user.entity';
import { CurrentUserAuthorizationService } from '../services/current-user-authorization.service';
import { AuthoritativeCurrentUserGuard } from './authoritative-current-user.guard';

const request = {
  user: {
    sub: 'user-1',
    email: 'token@example.test',
    tenant_id: 'tenant-1',
    role: UserRole.MANAGER,
    is_active: true,
    token_type: 'access' as const,
    security_version: 1,
    terminal_id: 'terminal-7',
  },
};

const context = (): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('AuthoritativeCurrentUserGuard', () => {
  const authorize = jest.fn();
  const service = { authorize } as unknown as CurrentUserAuthorizationService;
  const guard = new AuthoritativeCurrentUserGuard(service);

  beforeEach(() => {
    request.user = {
      ...request.user,
      role: UserRole.MANAGER,
      security_version: 1,
    };
    authorize.mockReset();
  });

  it('preserves signed terminal claims while updating mutable identity claims', async () => {
    authorize.mockResolvedValue({
      email: 'current@example.test',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      is_active: true,
      security_version: 1,
    });
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(request.user).toMatchObject({
      role: UserRole.MANAGER,
      terminal_id: 'terminal-7',
    });
  });

  it('rejects a missing authenticated user before the lookup', async () => {
    const original = request.user;
    delete (request as { user?: typeof request.user }).user;

    await expect(guard.canActivate(context())).rejects.toEqual(
      new UnauthorizedException(),
    );
    expect(authorize).not.toHaveBeenCalled();
    request.user = original;
  });

  it('leaves the request untouched when authorization fails', async () => {
    const original = { ...request.user };
    authorize.mockRejectedValue(new UnauthorizedException());

    await expect(guard.canActivate(context())).rejects.toEqual(
      new UnauthorizedException(),
    );
    expect(request.user).toEqual(original);
  });
});
