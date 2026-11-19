/**
 * ENT-03b — wiring contract: the UserService OWNER-account quota.
 *
 * The quota RULES live in `tenant-quota.service.ts` (unit) and
 * `tenant-quota.db.spec.ts` (real database). This spec pins the ENFORCEMENT
 * WIRING: `UserService.create` and the role-change branch of
 * `UserService.update` consult `TenantQuotaService.assertCanAddOwnerAccount`
 * exactly when a new OWNER seat would be consumed — creating an OWNER or
 * promoting an existing user to OWNER — and never for any other role, an
 * OWNER→OWNER no-op, or a deactivation.
 *
 * This file lives next to the quota service it pins because the identity
 * slice of the change owns only `user.service.ts`; the quota and its specs
 * are entitlements-owned surfaces.
 */
import { HttpException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { User, UserRole } from '../identity/entities/user.entity';
import { AuditLog } from '../identity/entities/audit-log.entity';
import { UserService } from '../identity/services/user.service';
import { AuthService } from '../identity/services/auth.service';
import { TenantQuotaService } from './tenant-quota.service';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

interface Harness {
  service: UserService;
  userRepo: { findOne: jest.Mock; save: jest.Mock };
  auditRepo: { findOne: jest.Mock; save: jest.Mock };
  profileRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  manager: { query: jest.Mock; getRepository: jest.Mock };
  quota: { assertCanAddOwnerAccount: jest.Mock };
  revokeRefreshSessionForUser: jest.Mock;
}

function buildHarness(user: Partial<User> | null): Harness {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(user),
    save: jest.fn(async (saved: Partial<User>) => ({
      ...saved,
      id: saved.id ?? '44444444-4444-4444-8444-444444444444',
    })),
  };
  const auditRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const profileRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) =>
      entity === User
        ? userRepo
        : entity === AuditLog
          ? auditRepo
          : profileRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const revokeRefreshSessionForUser = jest.fn().mockResolvedValue(undefined);
  const authService = {
    revokeRefreshSessionForUser,
  } as unknown as AuthService;
  const quota = {
    assertCanAddOwnerAccount: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UserService(
    userRepo as never,
    auditRepo as never,
    profileRepo as never,
    dataSource,
    authService,
    quota as unknown as TenantQuotaService,
  );
  return {
    service,
    userRepo,
    auditRepo,
    profileRepo,
    manager,
    quota,
    revokeRefreshSessionForUser,
  };
}

describe('UserService OWNER-account quota wiring (ENT-03b)', () => {
  it('blocks creating an OWNER at the limit with the quota 409, before any persistence', async () => {
    const h = buildHarness(null);
    h.quota.assertCanAddOwnerAccount.mockRejectedValueOnce(
      new HttpException('owner quota', 409),
    );

    await expect(
      h.service.create(
        { email: 'owner@omnifood.ni', name: 'Owner', role: UserRole.OWNER },
        TENANT_ID,
        ADMIN_ID,
      ),
    ).rejects.toThrow(new HttpException('owner quota', 409));

    expect(h.quota.assertCanAddOwnerAccount).toHaveBeenCalledWith(
      TENANT_ID,
      UserRole.OWNER,
    );
    expect(h.userRepo.save).not.toHaveBeenCalled();
    expect(h.auditRepo.save).not.toHaveBeenCalled();
  });

  it('creating a non-OWNER role never consults the quota and persists normally', async () => {
    const h = buildHarness(null);

    const created = await h.service.create(
      { email: 'cashier@omnifood.ni', name: 'Cashier', role: UserRole.CASHIER },
      TENANT_ID,
      ADMIN_ID,
    );

    expect(h.quota.assertCanAddOwnerAccount).not.toHaveBeenCalled();
    expect(created.role).toBe(UserRole.CASHIER);
    expect(h.userRepo.save).toHaveBeenCalled();
  });

  it('blocks promoting an existing user to OWNER at the limit, before saving', async () => {
    const h = buildHarness({
      id: '55555555-5555-4555-8555-555555555555',
      tenant_id: TENANT_ID,
      role: UserRole.CASHIER,
      security_version: 1,
      name: 'Cashier',
    });
    h.quota.assertCanAddOwnerAccount.mockRejectedValueOnce(
      new HttpException('owner quota', 409),
    );

    await expect(
      h.service.update(
        '55555555-5555-4555-8555-555555555555',
        { role: UserRole.OWNER },
        TENANT_ID,
        ADMIN_ID,
      ),
    ).rejects.toThrow(new HttpException('owner quota', 409));

    expect(h.quota.assertCanAddOwnerAccount).toHaveBeenCalledWith(
      TENANT_ID,
      UserRole.OWNER,
    );
    expect(h.userRepo.save).not.toHaveBeenCalled();
  });

  it('an OWNER→OWNER no-op update never consults the quota', async () => {
    const existing = {
      id: '55555555-5555-4555-8555-555555555555',
      tenant_id: TENANT_ID,
      role: UserRole.OWNER,
      security_version: 1,
      name: 'Owner',
    };
    const h = buildHarness(existing);
    h.userRepo.findOne.mockResolvedValue(existing);

    await h.service.update(
      existing.id,
      { role: UserRole.OWNER },
      TENANT_ID,
      ADMIN_ID,
    );

    expect(h.quota.assertCanAddOwnerAccount).not.toHaveBeenCalled();
    expect(h.userRepo.save).toHaveBeenCalled();
  });

  it('a demotion (OWNER → MANAGER) never consults the quota and still revokes sessions', async () => {
    const existing = {
      id: '55555555-5555-4555-8555-555555555555',
      tenant_id: TENANT_ID,
      role: UserRole.OWNER,
      security_version: 1,
      name: 'Owner',
    };
    const h = buildHarness(existing);
    h.userRepo.findOne.mockResolvedValue(existing);

    await h.service.update(
      existing.id,
      { role: UserRole.MANAGER },
      TENANT_ID,
      ADMIN_ID,
    );

    expect(h.quota.assertCanAddOwnerAccount).not.toHaveBeenCalled();
    expect(h.userRepo.save).toHaveBeenCalled();
    expect(h.revokeRefreshSessionForUser).toHaveBeenCalledWith(
      h.manager as unknown as EntityManager,
      existing.id,
      expect.any(Date),
    );
  });
});
