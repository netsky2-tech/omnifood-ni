import { ConflictException } from '@nestjs/common';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { PointTransactionType } from '../../customers/entities/customer-point-transaction.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';

/**
 * Unit harness for the writer contract: `transaction_type` must go through the
 * same legacy mapping as the sibling `type` column, because the physical column
 * is (since migration 1809180000000) a PostgreSQL enum whose members are
 * lowercase while the API DTOs spell the transaction types uppercase.
 */
const makeService = () => {
  const saved: Record<string, unknown>[] = [];

  const txQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
  };

  const txRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      const stored = { id: 'tx-1', ...value };
      saved.push(stored);
      return stored;
    }),
    createQueryBuilder: jest.fn(() => txQueryBuilder),
  };

  const projectionRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn(async (value: Record<string, unknown>) => value),
  };

  // Issue #512 slice 4: pooled-repo sentinels — the binding guard proves the
  // service never touches them for the protected access.
  const pooledTxRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const pooledProjectionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const managerGetRepository = jest.fn((entity: unknown) => {
    if (entity === CustomerPointTransaction) return txRepo;
    if (entity === CustomerLoyaltyAccountProjection) return projectionRepo;
    return null;
  });
  const manager = {
    getRepository: managerGetRepository,
    query: jest.fn(),
    transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
      cb({ getRepository: managerGetRepository, query: manager.query }),
    ),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    getRepository: jest.fn(),
  };

  const service = new LoyaltyLedgerService(
    txRepo as never,
    projectionRepo as never,
    dataSource as never,
  );

  return {
    service,
    saved,
    txRepo,
    projectionRepo,
    pooledTxRepo,
    pooledProjectionRepo,
    manager,
    managerGetRepository,
    dataSource,
  };
};

const baseDto = {
  tenantId: 'tenant-1',
  customerId: 'c-1',
  loyaltyProgramId: 'p-1',
  units: 10,
};

describe('LoyaltyLedgerService.appendTransaction: transaction_type writer mapping', () => {
  it('maps an uppercase DTO type to the lowercase enum member on both columns', async () => {
    const { service, saved } = makeService();

    await service.appendTransaction({
      ...baseDto,
      transactionType: 'REDEEM',
    });

    expect(saved[0].transaction_type).toBe(PointTransactionType.REDEEM);
    expect(saved[0].type).toBe(PointTransactionType.REDEEM);
  });

  it('maps EARN the same way instead of persisting the raw DTO value', async () => {
    const { service, saved } = makeService();

    await service.appendTransaction({ ...baseDto, transactionType: 'EARN' });

    expect(saved[0].transaction_type).toBe(PointTransactionType.EARN);
    expect(saved[0].type).toBe(PointTransactionType.EARN);
  });

  it('keeps the idempotency conflict check case-insensitive', async () => {
    const { service, txRepo } = makeService();

    const existing = {
      id: 'existing',
      tenant_id: 'tenant-1',
      customer_id: 'c-1',
      loyalty_program_id: 'p-1',
      units: 10,
      transaction_type: 'earn',
      type: 'earn',
    };

    txRepo.findOne.mockResolvedValue(existing);

    await expect(
      service.appendTransaction({
        ...baseDto,
        transactionType: 'EARN',
        idempotencyKey: 'key-1',
      }),
    ).resolves.toMatchObject({ id: 'existing' });

    await expect(
      service.appendTransaction({
        ...baseDto,
        transactionType: 'REDEEM',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('binds the appendTransaction access through the tenant transaction (issue #512 slice 4)', async () => {
    const { service, dataSource, manager, managerGetRepository, pooledTxRepo } =
      makeService();

    await service.appendTransaction({ ...baseDto, transactionType: 'EARN' });

    // A tenant transaction must be opened for the access...
    expect(dataSource.transaction).toHaveBeenCalled();
    // ...with the transaction-local binding SQL issued on the unit manager
    // with the trimmed tenant id before any protected access.
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-1',
    ]);
    // The protected access must resolve its repository from the bound manager.
    expect(managerGetRepository).toHaveBeenCalledWith(CustomerPointTransaction);
    // The pooled repository properties must not be used.
    expect(pooledTxRepo.findOne).not.toHaveBeenCalled();
    expect(pooledTxRepo.save).not.toHaveBeenCalled();
    expect(pooledTxRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
