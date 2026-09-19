import { ConflictException } from '@nestjs/common';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { PointTransactionType } from '../../customers/entities/customer-point-transaction.entity';

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

  const service = new LoyaltyLedgerService(
    txRepo as never,
    projectionRepo as never,
  );

  return { service, saved, txRepo, projectionRepo };
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
});
