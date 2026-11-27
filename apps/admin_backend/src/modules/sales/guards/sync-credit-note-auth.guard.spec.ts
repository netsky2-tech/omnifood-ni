import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { User, UserRole } from '../../identity/entities/user.entity';
import { createDeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { SyncCreditNoteAuthGuard } from './sync-credit-note-auth.guard';

const MANAGER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const CASHIER_ID = '33333333-3333-4333-8333-333333333333';
const ORIGIN_INVOICE_ID = '44444444-4444-4444-8444-444444444444';

describe('SyncCreditNoteAuthGuard', () => {
  let guard: SyncCreditNoteAuthGuard;
  let authGuard: jest.Mocked<Partial<AuthGuard>>;
  let mockQuery: jest.Mock;
  let mockFindOne: jest.Mock;
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(() => {
    authGuard = {
      canActivate: jest.fn().mockResolvedValue(true),
    };
    mockQuery = jest.fn().mockResolvedValue([]);
    mockFindOne = jest.fn();
    const mockManager = {
      query: mockQuery,
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === User) {
          return { findOne: mockFindOne };
        }
        throw new Error(`Unexpected entity: ${String(entity)}`);
      }),
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
    };
    guard = new SyncCreditNoteAuthGuard(
      authGuard as unknown as AuthGuard,
      mockDataSource as unknown as DataSource,
    );
  });

  const createMockContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const createDevicePrincipal = (tenantId = 'tenant-alpha') =>
    createDeviceSyncPrincipal({
      credentialId: 'cred-1',
      tenantId,
      deviceId: 'terminal-1',
      scopes: ['sync:push'],
      credentialVersion: 1,
    });

  const createValidCreditNoteRecord = (
    overrides: Record<string, unknown> = {},
  ) => ({
    idempotencyKey: 'cn-1',
    documentType: 'CREDIT_NOTE',
    invoice: {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'creditNote',
      originInvoiceId: ORIGIN_INVOICE_ID,
      refundReasonCode: 'CUSTOMER_RETURN',
      authorizedByUserId: MANAGER_ID,
      authorizedByRole: 'manager',
      ...overrides,
    },
  });

  it('allows batch without CREDIT_NOTE records without executing auth guard or DB check', async () => {
    const ctx = createMockContext({
      body: {
        records: [{ idempotencyKey: 'sale-1', documentType: 'SALE' }],
      },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows CREDIT_NOTE batch under devicePrincipal when DB-verified active same-tenant MANAGER authorizes it', async () => {
    mockFindOne.mockResolvedValue({
      id: MANAGER_ID,
      tenant_id: 'tenant-alpha',
      role: UserRole.MANAGER,
      is_active: true,
    });

    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal('tenant-alpha'),
      body: {
        records: [createValidCreditNoteRecord()],
      },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authGuard.canActivate).not.toHaveBeenCalled();
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('set_config'),
      ['tenant-alpha'],
    );
    expect(mockFindOne).toHaveBeenCalledWith({
      where: {
        id: MANAGER_ID,
        tenant_id: 'tenant-alpha',
        is_active: true,
      },
    });
  });

  it('allows CREDIT_NOTE batch under devicePrincipal with case-insensitive OWNER role', async () => {
    mockFindOne.mockResolvedValue({
      id: OWNER_ID,
      tenant_id: 'tenant-alpha',
      role: UserRole.OWNER,
      is_active: true,
    });

    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal('tenant-alpha'),
      body: {
        records: [
          createValidCreditNoteRecord({
            authorizedByUserId: OWNER_ID,
            authorizedByRole: 'OWNER',
          }),
        ],
      },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('fails closed (ForbiddenException) for device CREDIT_NOTE without supervisor metadata', async () => {
    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [{ idempotencyKey: 'cn-1', documentType: 'CREDIT_NOTE' }],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
    expect(authGuard.canActivate).not.toHaveBeenCalled();
  });

  it('fails closed (ForbiddenException) for device CREDIT_NOTE with non-UUID authorizedByUserId', async () => {
    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [
          createValidCreditNoteRecord({ authorizedByUserId: 'not-a-uuid' }),
        ],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('fails closed (ForbiddenException) for device CREDIT_NOTE missing originInvoiceId or refundReasonCode', async () => {
    const missingOriginCtx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [createValidCreditNoteRecord({ originInvoiceId: '   ' })],
      },
    });
    await expect(guard.canActivate(missingOriginCtx)).rejects.toThrow(
      ForbiddenException,
    );

    const missingReasonCtx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [createValidCreditNoteRecord({ refundReasonCode: '' })],
      },
    });
    await expect(guard.canActivate(missingReasonCtx)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('fails closed (ForbiddenException) for device CREDIT_NOTE with cashier or invalid authorizedByRole', async () => {
    const cashierCtx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [
          createValidCreditNoteRecord({
            authorizedByUserId: CASHIER_ID,
            authorizedByRole: 'cashier',
          }),
        ],
      },
    });
    await expect(guard.canActivate(cashierCtx)).rejects.toThrow(
      ForbiddenException,
    );

    const invalidCtx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [createValidCreditNoteRecord({ authorizedByRole: 'waiter' })],
      },
    });
    await expect(guard.canActivate(invalidCtx)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('fails closed (ForbiddenException) when authorizing user is not found or inactive in DB', async () => {
    mockFindOne.mockResolvedValue(null);

    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal(),
      body: {
        records: [createValidCreditNoteRecord()],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('fails closed (ForbiddenException) when authorizing user belongs to another tenant', async () => {
    mockFindOne.mockResolvedValue({
      id: MANAGER_ID,
      tenant_id: 'tenant-beta',
      role: UserRole.MANAGER,
      is_active: true,
    });

    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal('tenant-alpha'),
      body: {
        records: [createValidCreditNoteRecord()],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('fails closed (ForbiddenException) when client claims manager role for a DB cashier user (forged role)', async () => {
    mockFindOne.mockResolvedValue({
      id: CASHIER_ID,
      tenant_id: 'tenant-alpha',
      role: UserRole.CASHIER,
      is_active: true,
    });

    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal('tenant-alpha'),
      body: {
        records: [
          createValidCreditNoteRecord({
            authorizedByUserId: CASHIER_ID,
            authorizedByRole: 'manager',
          }),
        ],
      },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('fails closed (ForbiddenException) when DataSource is unavailable under devicePrincipal', async () => {
    const guardWithoutDs = new SyncCreditNoteAuthGuard(
      authGuard as unknown as AuthGuard,
    );
    const ctx = createMockContext({
      devicePrincipal: createDevicePrincipal('tenant-alpha'),
      body: {
        records: [createValidCreditNoteRecord()],
      },
    });

    await expect(guardWithoutDs.canActivate(ctx)).rejects.toThrow(
      ForbiddenException,
    );
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
