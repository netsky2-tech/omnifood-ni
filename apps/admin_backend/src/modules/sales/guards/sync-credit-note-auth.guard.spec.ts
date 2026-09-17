import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { UserRole } from '../../identity/entities/user.entity';
import { createDeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { SyncCreditNoteAuthGuard } from './sync-credit-note-auth.guard';

describe('SyncCreditNoteAuthGuard', () => {
  let guard: SyncCreditNoteAuthGuard;
  let authGuard: jest.Mocked<Partial<AuthGuard>>;

  beforeEach(() => {
    authGuard = {
      canActivate: jest.fn().mockResolvedValue(true),
    };
    guard = new SyncCreditNoteAuthGuard(authGuard as unknown as AuthGuard);
  });

  const createMockContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('allows batch without CREDIT_NOTE records without executing auth guard', async () => {
    const ctx = createMockContext({
      body: {
        records: [{ idempotencyKey: 'sale-1', documentType: 'SALE' }],
      },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('fails closed (ForbiddenException) for CREDIT_NOTE batch when request has authenticated devicePrincipal until DSI-6 is implemented', async () => {
    const principal = createDeviceSyncPrincipal({
      credentialId: 'cred-1',
      tenantId: 'tenant-alpha',
      deviceId: 'terminal-1',
      scopes: ['sync:push'],
      credentialVersion: 1,
    });

    const ctx = createMockContext({
      devicePrincipal: principal,
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('executes authGuard and enforces manager/owner when devicePrincipal is absent', async () => {
    const ctx = createMockContext({
      user: {
        tenant_id: 'tenant-alpha',
        sub: 'user-manager',
        email: 'manager@test.local',
        role: UserRole.MANAGER,
        is_active: true,
      },
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authGuard.canActivate).toHaveBeenCalledWith(ctx);
  });

  it('rejects CREDIT_NOTE batch when non-device request has inactive user', async () => {
    const ctx = createMockContext({
      user: {
        tenant_id: 'tenant-alpha',
        sub: 'user-manager',
        email: 'manager@test.local',
        role: UserRole.MANAGER,
        is_active: false,
      },
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects CREDIT_NOTE batch when non-device request has cashier user', async () => {
    const ctx = createMockContext({
      user: {
        tenant_id: 'tenant-alpha',
        sub: 'user-cashier',
        email: 'cashier@test.local',
        role: UserRole.CASHIER,
        is_active: true,
      },
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects CREDIT_NOTE batch when user tenant_id is missing', async () => {
    const ctx = createMockContext({
      user: {
        tenant_id: '',
        sub: 'user-manager',
        role: UserRole.MANAGER,
        is_active: true,
      },
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
