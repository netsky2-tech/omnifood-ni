import { UnauthorizedException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import { CurrentUserAuthorizationService } from './current-user-authorization.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';

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
  // Issue #556 stage 12d: the authoritative user read is a `users` access
  // under FORCE RLS, so it resolves through the tenant-bound transaction
  // manager. The bound manager's User repository is the ONLY read path;
  // there is no pooled fallback to trip over.
  const repository = { findOne: jest.fn() };
  const setConfigQueries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const manager = {
    query: jest.fn((sql: string, parameters?: unknown[]) => {
      setConfigQueries.push({ sql, parameters });
      return Promise.resolve([]);
    }),
    getRepository: jest.fn<unknown, [unknown]>().mockReturnValue(repository),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      (operation: (transactionManager: EntityManager) => Promise<unknown>) =>
        operation(manager),
    ),
  };
  const service = new CurrentUserAuthorizationService(dataSource as never);

  beforeEach(() => {
    repository.findOne.mockReset();
    (manager.getRepository as unknown as jest.Mock).mockClear();
    setConfigQueries.length = 0;
  });

  it('binds the tenant context before the authoritative read and replaces mutable claims from the current same-tenant user', async () => {
    repository.findOne.mockResolvedValue(currentUser());

    await expect(service.authorize(token)).resolves.toEqual({
      email: 'current@example.test',
      tenant_id: 'tenant-1',
      role: UserRole.MANAGER,
      is_active: true,
      security_version: 1,
    });
    // ONE transaction binding the JWT tenant before the user read.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(setConfigQueries).toEqual([
      { sql: TENANT_CONTEXT_SET_CONFIG_SQL, parameters: ['tenant-1'] },
    ]);
    expect(manager.getRepository).toHaveBeenCalledWith(User);
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
