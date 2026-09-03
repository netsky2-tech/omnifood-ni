import { TicketPaidHandler } from './ticket-paid.handler';
import { LoyaltyLedgerService, AppendLoyaltyTxDto } from './loyalty-ledger.service';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../entities/loyalty-program.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { LoyaltyTicketSnapshot } from '../domain/loyalty-ticket-snapshot';

describe('TicketPaidHandler', () => {
  let handler: TicketPaidHandler;
  let mockProgramRepo: { find: jest.Mock };
  let mockCustomerRepo: { findOne: jest.Mock };
  let mockLedgerService: { appendTransaction: jest.Mock };

  beforeEach(() => {
    mockProgramRepo = { find: jest.fn().mockResolvedValue([]) };
    mockCustomerRepo = { findOne: jest.fn() };
    mockLedgerService = { appendTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }) };

    handler = new TicketPaidHandler(
      mockProgramRepo as any,
      mockCustomerRepo as any,
      mockLedgerService as any,
    );
  });

  function makeSnapshot(overrides?: Partial<LoyaltyTicketSnapshot>): LoyaltyTicketSnapshot {
    return {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      terminalId: 'terminal-1',
      ticketId: 'ticket-1',
      customerId: 'cust-1',
      paidAt: new Date('2026-09-01T12:00:00Z'),
      lines: [
        { lineId: 'l1', productId: 'p1', quantity: 1, merchandiseNetNioAfterAllBenefits: 100, source: 'NORMAL' },
      ],
      ...overrides,
    };
  }

  function makeProgram(overrides?: Partial<LoyaltyProgram>): LoyaltyProgram {
    return {
      id: 'prog-1',
      tenant_id: 'tenant-1',
      name: 'Puntos NIO',
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
      earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
      eligibility_rule: {},
      config_version: 1,
      starts_at: null,
      ends_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    } as LoyaltyProgram;
  }

  it('returns empty if no customerId', async () => {
    const result = await handler.handle(makeSnapshot({ customerId: undefined }));
    expect(result).toEqual([]);
  });

  it('returns empty if customer not found', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const result = await handler.handle(makeSnapshot());
    expect(result).toEqual([]);
  });

  it('returns empty if customer is inactive', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: false } as Customer);
    const result = await handler.handle(makeSnapshot());
    expect(result).toEqual([]);
  });

  it('returns empty if no active programs', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([]);
    const result = await handler.handle(makeSnapshot());
    expect(result).toEqual([]);
  });

  it('generates EARN for one active SPEND program', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([makeProgram()]);

    const result = await handler.handle(makeSnapshot());

    expect(result).toHaveLength(1);
    expect(result[0].programId).toBe('prog-1');
    expect(result[0].units).toBe(10);
    expect(result[0].strategy).toBe('SPEND_POINTS');
    expect(mockLedgerService.appendTransaction).toHaveBeenCalledTimes(1);
  });

  it('generates EARN for multiple programs', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([
      makeProgram({ id: 'prog-1', program_type: LoyaltyProgramType.SPEND_POINTS }),
      makeProgram({ id: 'prog-2', program_type: LoyaltyProgramType.VISIT_STAMPS, earning_rule: { unitsPerVisit: 1 } }),
    ]);

    const result = await handler.handle(makeSnapshot());

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.programId)).toEqual(['prog-1', 'prog-2']);
  });

  it('skips INACTIVE programs even if returned', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([
      makeProgram({ id: 'prog-inactive', status: LoyaltyProgramStatus.INACTIVE }),
    ]);

    const result = await handler.handle(makeSnapshot());
    expect(result).toEqual([]);
  });

  it('skips programs outside earning window (before starts_at)', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([
      makeProgram({ starts_at: new Date('2026-10-01T00:00:00Z') }),
    ]);

    const result = await handler.handle(makeSnapshot({ paidAt: new Date('2026-09-01T12:00:00Z') }));
    expect(result).toEqual([]);
  });

  it('skips programs outside earning window (after ends_at)', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([
      makeProgram({ ends_at: new Date('2026-08-01T00:00:00Z') }),
    ]);

    const result = await handler.handle(makeSnapshot({ paidAt: new Date('2026-09-01T12:00:00Z') }));
    expect(result).toEqual([]);
  });

  it('sends idempotency key with correct format', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([makeProgram()]);

    await handler.handle(makeSnapshot({ ticketId: 'ticket-42' }));

    const call = mockLedgerService.appendTransaction.mock.calls[0][0] as AppendLoyaltyTxDto;
    expect(call.idempotencyKey).toBe('loyalty:earn:tenant-1:ticket-42:prog-1');
  });

  it('is idempotent: calling twice with same ticket does not duplicate', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({ id: 'cust-1', is_active: true } as Customer);
    mockProgramRepo.find.mockResolvedValue([makeProgram()]);

    await handler.handle(makeSnapshot({ ticketId: 'ticket-idem' }));
    await handler.handle(makeSnapshot({ ticketId: 'ticket-idem' }));

    expect(mockLedgerService.appendTransaction).toHaveBeenCalledTimes(2);
    const calls = mockLedgerService.appendTransaction.mock.calls;
    expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey);
  });
});
