import { UnauthorizedException } from '@nestjs/common';
import { User, UserRole } from '../entities/user.entity';
import { CurrentUserAuthorizationService } from './current-user-authorization.service';

const token = {
  sub: 'user-1',
  email: 'token@example.test',
  tenant_id: 'tenant-1',
  role: UserRole.MANAGER,
  is_active: true,
  token_type: 'access' as const,
  security_version: 1,
  terminal_id: 'terminal-7',
};

const currentUser = (overrides: Partial<User> = {}) =>
  Object.assign(new User(), {
    id: token.sub,
    email: 'current@example.test',
    tenant_id: token.tenant_id,
    role: token.role,
    is_active: true,
    security_version: token.security_version,
    ...overrides,
  });

describe('CurrentUserAuthorizationService', () => {
  const repository = { findOne: jest.fn() };
  const service = new CurrentUserAuthorizationService(repository);

  beforeEach(() => repository.findOne.mockReset());

  it('replaces mutable claims from the current same-tenant user', async () => {
    repository.findOne.mockResolvedValue(currentUser());

    await expect(service.authorize(token)).resolves.toEqual({
      email: 'current@example.test',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      is_active: true,
      security_version: 1,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1', tenant_id: 'tenant-1' },
      select: [
        'id',
        'email',
        'tenant_id',
        'role',
        'is_active',
        'security_version',
      ],
    });
  });

  it.each([
    ['missing user', null],
    ['inactive user', currentUser({ is_active: false })],
    ['tenant mismatch', currentUser({ tenant_id: 'tenant-2' })],
    ['role mismatch', currentUser({ role: UserRole.OWNER })],
    ['security version mismatch', currentUser({ security_version: 2 })],
  ])('fails closed for %s without leaking state', async (_scenario, user) => {
    repository.findOne.mockResolvedValue(user);

    await expect(service.authorize(token)).rejects.toEqual(
      new UnauthorizedException(),
    );
  });

  it('fails closed when the authoritative lookup errors', async () => {
    repository.findOne.mockRejectedValue(new Error('database unavailable'));

    await expect(service.authorize(token)).rejects.toEqual(
      new UnauthorizedException(),
    );
  });
});
