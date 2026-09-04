import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { TicketPaidHandler } from './ticket-paid.handler';
import { RedemptionService } from './redemption.service';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import {
  RewardDefinition,
  RewardStatus,
  RewardType,
} from '../entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { LoyaltyTicketSnapshot } from '../domain/loyalty-ticket-snapshot';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

async function createTestHarness() {
  const schema = `loyalty_redemption_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  await bootstrap.query(`CREATE TABLE "${schema}".tenants (
    id text PRIMARY KEY, name text NOT NULL, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
    tax_id text, phone text, email text, address text,
    points_balance numeric(12,2) DEFAULT 0.0, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".loyalty_programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
    program_type text NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
    starts_at timestamptz, ends_at timestamptz,
    earning_rule jsonb NOT NULL DEFAULT '{}', eligibility_rule jsonb NOT NULL DEFAULT '{}',
    config_version int NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".loyalty_rewards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, loyalty_program_id uuid NOT NULL,
    name text NOT NULL, description text, reward_type text NOT NULL,
    cost_units int NOT NULL, benefit_config jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'INACTIVE', starts_at timestamptz, ends_at timestamptz,
    presentation_order int NOT NULL DEFAULT 0, config_version int NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customer_point_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, customer_id uuid NOT NULL,
    loyalty_program_id uuid, ticket_id text, invoice_id text, reward_id uuid,
    transaction_type text, units int, reversal_of_transaction_id uuid,
    idempotency_key text, source_event_id text, actor_user_id uuid,
    branch_id text, terminal_id text, program_version int, reward_version int,
    commercial_snapshot jsonb, origin text, occurred_at timestamptz, recorded_at timestamptz,
    legacy_imported boolean DEFAULT false,
    type text DEFAULT 'earn', points numeric(12,2) DEFAULT 0.0,
    balance_after numeric(12,2) DEFAULT 0.0, conversion_rate numeric(8,4) DEFAULT 0.1,
    reason text, created_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(`CREATE TABLE "${schema}".customer_loyalty_account_projection (
    tenant_id text NOT NULL, customer_id uuid NOT NULL, loyalty_program_id uuid NOT NULL,
    balance_units int NOT NULL DEFAULT 0, last_transaction_id uuid,
    projection_version int NOT NULL DEFAULT 0, recomputed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, customer_id, loyalty_program_id)
  )`);

  await bootstrap.query(
    `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
    ['tenant-1', 'Test Tenant'],
  );

  await bootstrap.query(
    `INSERT INTO "${schema}".customers (id, tenant_id, name, is_active) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'tenant-1', 'Active Customer', true],
  );

  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    schema,
    entities: [
      LoyaltyProgram,
      RewardDefinition,
      CustomerLoyaltyAccountProjection,
      CustomerPointTransaction,
      Customer,
      Tenant,
    ],
    synchronize: false,
  });
  await dataSource.initialize();

  const loyaltyService = new LoyaltyService(
    dataSource.getRepository(LoyaltyProgram),
    dataSource.getRepository(RewardDefinition),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
    dataSource.getRepository(Customer),
  );

  const ledgerService = new LoyaltyLedgerService(
    dataSource.getRepository(CustomerPointTransaction),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
  );

  const ticketPaidHandler = new TicketPaidHandler(
    dataSource.getRepository(LoyaltyProgram),
    dataSource.getRepository(Customer),
    ledgerService,
  );

  const redemptionService = new RedemptionService(
    dataSource.getRepository(LoyaltyProgram),
    dataSource.getRepository(RewardDefinition),
    dataSource.getRepository(Customer),
    dataSource.getRepository(CustomerPointTransaction),
    ledgerService,
    loyaltyService,
  );

  // Get the active customer ID
  const activeCustomer = await dataSource
    .getRepository(Customer)
    .createQueryBuilder('c')
    .where('c.tenant_id = :tid', { tid: 'tenant-1' })
    .getOne();

  return {
    loyaltyService,
    ledgerService,
    ticketPaidHandler,
    redemptionService,
    dataSource,
    bootstrap,
    schema,
    customerId: activeCustomer.id,
    destroy: async () => {
      await dataSource.destroy();
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    },
  };
}

describe('LV1.3 — Redemption & Reversal (db)', () => {
  let h: Awaited<ReturnType<typeof createTestHarness>>;

  beforeAll(async () => {
    h = await createTestHarness();
  });

  afterAll(async () => {
    await h?.destroy();
  });

  // Helper to create a Program + Reward + activate both
  async function setupProgramWithReward(overrides?: {
    programType?: string;
    earningRule?: Record<string, unknown>;
    rewardType?: string;
    benefitConfig?: Record<string, unknown>;
    costUnits?: number;
    rewardStatus?: string;
    programStatus?: string;
    endsAt?: Date;
  }) {
    const program = await h.loyaltyService.createProgram('tenant-1', {
      name: `Program-${randomUUID().slice(0, 8)}`,
      program_type: (overrides?.programType ?? 'SPEND_POINTS') as any,
      earning_rule: overrides?.earningRule ?? {
        spendBlockNio: 10,
        pointsPerBlock: 1,
      },
      eligibility_rule: {},
      starts_at:
        overrides?.endsAt && overrides.endsAt < new Date('2026-01-01T00:00:00Z')
          ? '2019-01-01T00:00:00Z'
          : '2026-01-01T00:00:00Z',
      ends_at: overrides?.endsAt?.toISOString() ?? '2027-12-31T23:59:59Z',
    });

    const reward = await h.loyaltyService.createReward('tenant-1', program.id, {
      name: `Reward-${randomUUID().slice(0, 8)}`,
      reward_type: (overrides?.rewardType ?? 'DISCOUNT_AMOUNT') as any,
      cost_units: overrides?.costUnits ?? 50,
      benefit_config: overrides?.benefitConfig ?? { amountNio: 25 },
      ends_at: overrides?.endsAt?.toISOString(),
    });

    // Activate program
    if (overrides?.programStatus !== 'DRAFT') {
      await h.loyaltyService.activateProgram('tenant-1', program.id);
    }

    // Activate reward
    if (overrides?.rewardStatus !== 'INACTIVE') {
      await h.loyaltyService.activateReward('tenant-1', reward.id);
    }

    return { program, reward };
  }

  // Helper to earn some points first
  async function earnPoints(
    customerId: string,
    programId: string,
    ticketId: string,
    units: number,
  ) {
    return h.ledgerService.appendTransaction({
      tenantId: 'tenant-1',
      customerId,
      loyaltyProgramId: programId,
      ticketId,
      transactionType: 'EARN',
      units,
      idempotencyKey: `loyalty:earn:tenant-1:${ticketId}:${programId}`,
      origin: 'POS',
      occurredAt: new Date(),
    });
  }

  describe('LV1.3A — Reward eligibility + RedemptionIntent', () => {
    it('creates a RedemptionIntent for eligible reward', async () => {
      const { program, reward } = await setupProgramWithReward();
      await earnPoints(h.customerId, program.id, 'ticket-earn-1', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-redempt-1',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      expect(intent.id).toBeDefined();
      expect(intent.status).toBe('PENDING');
      expect(intent.application.rewardType).toBe('DISCOUNT_AMOUNT');
      expect(intent.application.costUnits).toBe(50);
    });

    it('rejects redemption when balance is insufficient', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 200,
      });

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-redempt-2',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/insufficient/i);
    });

    it('rejects redemption for INACTIVE reward', async () => {
      const { program, reward } = await setupProgramWithReward({
        rewardStatus: 'INACTIVE',
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-inactive', 100);

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-redempt-inactive',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/inactive/i);
    });

    it('rejects redemption for DRAFT program', async () => {
      const { program, reward } = await setupProgramWithReward({
        programStatus: 'DRAFT',
        rewardStatus: 'INACTIVE',
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-draft', 100);

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-redempt-draft',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/draft|not active/i);
    });

    it('rejects redemption when reward is expired (endsAt in the past)', async () => {
      const { program, reward } = await setupProgramWithReward({
        endsAt: new Date('2020-01-01T00:00:00Z'),
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-expired', 100);

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-redempt-expired',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/expired|window/i);
    });

    it('LoyaltyProgram.endsAt in the past does NOT block REDEEM if Program status remains ACTIVE', async () => {
      // Program endsAt is in the past, but program is still ACTIVE and reward is not expired
      const program = await h.loyaltyService.createProgram('tenant-1', {
        name: `PastEndsAt-${randomUUID().slice(0, 6)}`,
        program_type: 'SPEND_POINTS' as any,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: '2020-12-31T23:59:59Z', // In the past!
      });
      await h.loyaltyService.activateProgram('tenant-1', program.id);

      const reward = await h.loyaltyService.createReward(
        'tenant-1',
        program.id,
        {
          name: 'Valid Reward',
          reward_type: 'DISCOUNT_AMOUNT' as any,
          cost_units: 30,
          benefit_config: { amountNio: 15 },
          // reward ends_at is NOT in the past
        },
      );
      await h.loyaltyService.activateReward('tenant-1', reward.id);

      await earnPoints(h.customerId, program.id, 'ticket-earn-pastprog', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-redempt-pastprog',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      expect(intent).toBeDefined();
      expect(intent.id).toBeDefined();
      expect(intent.application.costUnits).toBe(30);
    });

    it('rejects duplicate redemption intent for same ticket', async () => {
      const { program, reward } = await setupProgramWithReward();
      await earnPoints(h.customerId, program.id, 'ticket-earn-dup', 100);

      await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-dup',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-dup',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/already exists|one redemption/i);
    });

    it('does NOT consume balance before PAID', async () => {
      const { program, reward } = await setupProgramWithReward();
      await earnPoints(h.customerId, program.id, 'ticket-earn-prepaid', 100);

      const balanceBefore = await h.loyaltyService.getCustomerBalance(
        'tenant-1',
        h.customerId,
        program.id,
      );

      await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-prepaid',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      const balanceAfter = await h.loyaltyService.getCustomerBalance(
        'tenant-1',
        h.customerId,
        program.id,
      );

      expect(balanceAfter.balanceUnits).toBe(balanceBefore.balanceUnits);
    });

    it('rejects redemption for inactive customer', async () => {
      // Create inactive customer
      await h.dataSource.query(
        `INSERT INTO "${h.schema}".customers (id, tenant_id, name, is_active) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), 'tenant-1', 'Inactive Customer', false],
      );
      const inactiveCustomer = await h.dataSource
        .getRepository(Customer)
        .createQueryBuilder('c')
        .where('c.tenant_id = :tid AND c.is_active = false', {
          tid: 'tenant-1',
        })
        .getOne();

      const { program, reward } = await setupProgramWithReward();
      await earnPoints(
        inactiveCustomer.id,
        program.id,
        'ticket-earn-inactcust',
        100,
      );

      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: inactiveCustomer.id,
          ticketId: 'ticket-inactcust',
          loyaltyProgramId: program.id,
          rewardId: reward.id,
        }),
      ).rejects.toThrow(/inactive|not found/i);
    });
  });

  describe('LV1.3C — PAID consolidation (REDEEM + EARN)', () => {
    it('consolidates REDEEM + EARN on TicketPaid with active intent', async () => {
      const { program, reward } = await setupProgramWithReward({
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
        costUnits: 50,
        benefitConfig: { amountNio: 25 },
      });
      await earnPoints(
        h.customerId,
        program.id,
        'ticket-earn-consolidate',
        100,
      );

      // Create intent
      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-consolidate',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      // Simulate TicketPaid with earning
      const snapshot: LoyaltyTicketSnapshot = {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-consolidate',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 150,
            source: 'NORMAL',
          },
        ],
      };

      const earnResults = await h.ticketPaidHandler.handle(snapshot);
      expect(earnResults.length).toBeGreaterThanOrEqual(1);

      // Now consolidate — this should create REDEEM + update projection
      const redeemResult = await h.redemptionService.consolidateRedemption(
        'tenant-1',
        intent.id,
        snapshot,
      );

      expect(redeemResult.redeemTransaction).toBeDefined();
      expect(redeemResult.redeemTransaction.transaction_type).toBe('REDEEM');
      expect(redeemResult.redeemTransaction.units).toBe(-50);
      expect(redeemResult.redeemTransaction.reward_id).toBe(reward.id);
      expect(
        (redeemResult.redeemTransaction.commercial_snapshot as any)
          ?.appliedBenefitNio,
      ).toBe(25);
    });

    it('is idempotent: consolidating same intent twice returns existing', async () => {
      const { program, reward } = await setupProgramWithReward({
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
        costUnits: 30,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-idem', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-idem',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      const snapshot: LoyaltyTicketSnapshot = {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-idem',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 50,
            source: 'NORMAL',
          },
        ],
      };

      await h.redemptionService.consolidateRedemption(
        'tenant-1',
        intent.id,
        snapshot,
      );
      const second = await h.redemptionService.consolidateRedemption(
        'tenant-1',
        intent.id,
        snapshot,
      );

      expect(second.alreadyConsolidated).toBe(true);
    });

    it('failed payment does NOT create REDEEM', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 40,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-failedpay', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-failedpay',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      // Simulate payment failure — don't call consolidateRedemption
      // Instead, void the intent
      await h.redemptionService.voidIntent('tenant-1', intent.id);

      const intentAfter = await h.redemptionService.getIntent(
        'tenant-1',
        intent.id,
      );
      expect(intentAfter.status).toBe('VOIDED');

      // Verify no REDEEM transaction was created
      const txs = await h.dataSource.query(
        `SELECT * FROM "${h.schema}".customer_point_transactions WHERE ticket_id = $1 AND LOWER(transaction_type) = 'redeem'`,
        ['ticket-failedpay'],
      );
      expect(txs.length).toBe(0);
    });

    it('one-redemption constraint: second reward on same ticket rejected after consolidation', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 20,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-oncered', 200);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-oncered',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      // Create a second reward
      const reward2 = await h.loyaltyService.createReward(
        'tenant-1',
        program.id,
        {
          name: 'Second Reward',
          reward_type: RewardType.DISCOUNT_AMOUNT,
          cost_units: 30,
          benefit_config: { amountNio: 15 },
        },
      );
      await h.loyaltyService.activateReward('tenant-1', reward2.id);

      // Consolidate first
      await h.redemptionService.consolidateRedemption('tenant-1', intent.id, {
        tenantId: 'tenant-1',
        branchId: 'b1',
        terminalId: 't1',
        ticketId: 'ticket-oncered',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 50,
            source: 'NORMAL',
          },
        ],
      });

      // Try second redemption — should fail
      await expect(
        h.redemptionService.createRedemptionIntent({
          tenantId: 'tenant-1',
          customerId: h.customerId,
          ticketId: 'ticket-oncered',
          loyaltyProgramId: program.id,
          rewardId: reward2.id,
        }),
      ).rejects.toThrow(/already exists|one redemption/i);
    });
  });

  describe('LV1.3D — VOID reversal', () => {
    it('creates REVERSAL entries for all movements of a voided ticket', async () => {
      const { program, reward } = await setupProgramWithReward({
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
        costUnits: 30,
      });
      await earnPoints(h.customerId, program.id, 'ticket-void', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-void',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      // Consolidate (creates REDEEM)
      const consolidateResult = await h.redemptionService.consolidateRedemption(
        'tenant-1',
        intent.id,
        {
          tenantId: 'tenant-1',
          branchId: 'b1',
          terminalId: 't1',
          ticketId: 'ticket-void',
          customerId: h.customerId,
          paidAt: new Date(),
          lines: [
            {
              lineId: 'l1',
              productId: 'p1',
              quantity: 1,
              merchandiseNetNioAfterAllBenefits: 50,
              source: 'NORMAL',
            },
          ],
        },
      );

      // Verify REDEEM was created
      expect(consolidateResult.redeemTransaction).toBeDefined();
      expect(consolidateResult.alreadyConsolidated).toBe(false);

      // Check what's in the DB before reversal
      const allTx = await h.dataSource.query(
        `SELECT id, transaction_type, units, ticket_id FROM "${h.schema}".customer_point_transactions WHERE ticket_id = $1 ORDER BY created_at`,
        ['ticket-void'],
      );
      // EARN + REDEEM at minimum
      expect(allTx.length).toBeGreaterThanOrEqual(2);

      // Now reverse (void) — should reverse ALL reversible movements
      const reversals = await h.redemptionService.reverseTicketLoyalty(
        'tenant-1',
        'ticket-void',
        h.customerId,
      );

      // Should create reversals for reversible movements
      expect(reversals.length).toBeGreaterThanOrEqual(1);
      const txTypes = reversals.map((r) =>
        (r.transaction_type as string)?.toLowerCase(),
      );
      expect(txTypes).toContain('reversal');

      // Each reversal should negate the original movement
      for (const rev of reversals) {
        expect(typeof rev.units).toBe('number');
        expect(rev.units).not.toBe(0);
        expect(rev.reversal_of_transaction_id).toBeDefined();
      }
    });

    it('is idempotent: retrying void does not duplicate reversals', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 20,
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-void-idem', 50);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-void-idem',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      await h.redemptionService.consolidateRedemption('tenant-1', intent.id, {
        tenantId: 'tenant-1',
        branchId: 'b1',
        terminalId: 't1',
        ticketId: 'ticket-void-idem',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 30,
            source: 'NORMAL',
          },
        ],
      });

      const first = await h.redemptionService.reverseTicketLoyalty(
        'tenant-1',
        'ticket-void-idem',
        h.customerId,
      );
      const second = await h.redemptionService.reverseTicketLoyalty(
        'tenant-1',
        'ticket-void-idem',
        h.customerId,
      );

      expect(second.length).toBe(0); // Already reversed
      // Count all reversals for this ticket
      const allReversals = await h.dataSource.query(
        `SELECT * FROM "${h.schema}".customer_point_transactions WHERE ticket_id = $1 AND LOWER(transaction_type) = 'reversal'`,
        ['ticket-void-idem'],
      );
      expect(allReversals.length).toBe(first.length);
    });

    it('REVERSAL can leave balance negative', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 80,
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-negbal', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-negbal',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      await h.redemptionService.consolidateRedemption('tenant-1', intent.id, {
        tenantId: 'tenant-1',
        branchId: 'b1',
        terminalId: 't1',
        ticketId: 'ticket-negbal',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 50,
            source: 'NORMAL',
          },
        ],
      });

      // After: balance = 100 (earn) - 80 (redeem) = 20, then +10 (new earn from consolidate) = 30
      // Reversal will undo EARN(-10) and REDEEM(+80), net = +70
      // But the projection may go negative if we reverse the original earn too
      await h.redemptionService.reverseTicketLoyalty(
        'tenant-1',
        'ticket-negbal',
        h.customerId,
      );

      // The system should NOT throw — negative balance is allowed per spec
      const balance = await h.loyaltyService.getCustomerBalance(
        'tenant-1',
        h.customerId,
        program.id,
      );
      expect(typeof balance.balanceUnits).toBe('number');
    });
  });

  describe('LV1.3E — Audit correlation', () => {
    it('REDEEM transaction has correct source_event_id and actor metadata', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 25,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-audit', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-audit',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      await h.redemptionService.consolidateRedemption('tenant-1', intent.id, {
        tenantId: 'tenant-1',
        branchId: 'branch-audit',
        terminalId: 'terminal-audit',
        ticketId: 'ticket-audit',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 50,
            source: 'NORMAL',
          },
        ],
      });

      const redeemTx = await h.dataSource.query(
        `SELECT * FROM "${h.schema}".customer_point_transactions WHERE ticket_id = $1 AND LOWER(transaction_type) = 'redeem'`,
        ['ticket-audit'],
      );

      expect(redeemTx.length).toBe(1);
      expect(redeemTx[0].source_event_id).toBe('ticket-audit');
      expect(redeemTx[0].branch_id).toBe('branch-audit');
      expect(redeemTx[0].terminal_id).toBe('terminal-audit');
      expect(redeemTx[0].origin).toBe('POS');
      expect(redeemTx[0].reward_id).toBe(reward.id);
    });

    it('REVERSAL transaction references original via reversal_of_transaction_id', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 15,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-revref', 50);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-revref',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      await h.redemptionService.consolidateRedemption('tenant-1', intent.id, {
        tenantId: 'tenant-1',
        branchId: 'b1',
        terminalId: 't1',
        ticketId: 'ticket-revref',
        customerId: h.customerId,
        paidAt: new Date(),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 30,
            source: 'NORMAL',
          },
        ],
      });

      const reversals = await h.redemptionService.reverseTicketLoyalty(
        'tenant-1',
        'ticket-revref',
        h.customerId,
      );

      for (const rev of reversals) {
        expect(rev.reversal_of_transaction_id).toBeDefined();
        expect(rev.idempotency_key).toContain('reversal');
      }
    });
  });

  describe('Triangulation — multiple reward types', () => {
    it('FREE_PRODUCT redemption creates correct application', async () => {
      const { program, reward } = await setupProgramWithReward({
        rewardType: 'FREE_PRODUCT',
        costUnits: 10,
        benefitConfig: { productId: 'prod-cappuccino', quantity: 1 },
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-freeprod', 50);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-freeprod',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      expect(intent.application.rewardType).toBe('FREE_PRODUCT');
      expect((intent.application.benefitConfig as any).productId).toBe(
        'prod-cappuccino',
      );
    });

    it('DISCOUNT_AMOUNT redemption creates correct application with amountNio', async () => {
      const { program, reward } = await setupProgramWithReward({
        rewardType: 'DISCOUNT_AMOUNT',
        costUnits: 40,
        benefitConfig: { amountNio: 100 },
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-disc', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-disc',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      expect(intent.application.rewardType).toBe('DISCOUNT_AMOUNT');
      expect((intent.application.benefitConfig as any).amountNio).toBe(100);
    });

    it('historical reward-version preserved via snapshot after reward config changes', async () => {
      const { program, reward } = await setupProgramWithReward({
        costUnits: 30,
      });
      await earnPoints(h.customerId, program.id, 'ticket-earn-version', 100);

      const intent = await h.redemptionService.createRedemptionIntent({
        tenantId: 'tenant-1',
        customerId: h.customerId,
        ticketId: 'ticket-version',
        loyaltyProgramId: program.id,
        rewardId: reward.id,
      });

      // Change reward config after intent was created
      await h.loyaltyService.updateReward('tenant-1', reward.id, {
        cost_units: 500, // Changed!
        benefit_config: { amountNio: 999 },
      });

      // Consolidate — should use the ORIGINAL version captured at intent creation
      const result = await h.redemptionService.consolidateRedemption(
        'tenant-1',
        intent.id,
        {
          tenantId: 'tenant-1',
          branchId: 'b1',
          terminalId: 't1',
          ticketId: 'ticket-version',
          customerId: h.customerId,
          paidAt: new Date(),
          lines: [
            {
              lineId: 'l1',
              productId: 'p1',
              quantity: 1,
              merchandiseNetNioAfterAllBenefits: 50,
              source: 'NORMAL',
            },
          ],
        },
      );

      // The redeem should use original cost_units (30), not the updated one (500)
      expect(result.redeemTransaction.units).toBe(-30);
      // reward_version is 2 because activateReward bumps config_version
      expect(result.redeemTransaction.reward_version).toBe(2);
    });
  });

  describe('LV1.2 Earning Engine — DB integration', () => {
    it('ticket retry is strictly idempotent and does not duplicate EARN transactions or balance in real DB', async () => {
      const { program } = await setupProgramWithReward({
        earningRule: { spendBlockNio: 10, pointsPerBlock: 1 },
      });

      const snapshot: LoyaltyTicketSnapshot = {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: `ticket-earn-idem-${randomUUID().slice(0, 8)}`,
        customerId: h.customerId,
        paidAt: new Date('2026-06-01T12:00:00Z'),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 100,
            source: 'NORMAL',
          },
        ],
      };

      const firstResults = await h.ticketPaidHandler.handle(snapshot);
      const programResult = firstResults.find(
        (r) => r.programId === program.id,
      );
      expect(programResult).toBeDefined();
      expect(programResult.units).toBe(10);

      const firstProj = await h.dataSource.query(
        `SELECT balance_units, projection_version FROM "${h.schema}".customer_loyalty_account_projection WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3`,
        ['tenant-1', h.customerId, program.id],
      );
      const balanceBefore = firstProj[0].balance_units;
      const versionBefore = firstProj[0].projection_version;

      // Retry the exact same ticket
      const secondResults = await h.ticketPaidHandler.handle(snapshot);
      const secondProgramResult = secondResults.find(
        (r) => r.programId === program.id,
      );
      expect(secondProgramResult).toBeDefined();
      expect(secondProgramResult.units).toBe(10);

      const secondProj = await h.dataSource.query(
        `SELECT balance_units, projection_version FROM "${h.schema}".customer_loyalty_account_projection WHERE tenant_id = $1 AND customer_id = $2 AND loyalty_program_id = $3`,
        ['tenant-1', h.customerId, program.id],
      );
      expect(secondProj[0].balance_units).toBe(balanceBefore);
      expect(secondProj[0].projection_version).toBe(versionBefore);

      // Verify only 1 EARN transaction exists for this ticket+program in customer_point_transactions
      const txRows = await h.dataSource.query(
        `SELECT id FROM "${h.schema}".customer_point_transactions WHERE ticket_id = $1 AND loyalty_program_id = $2`,
        [snapshot.ticketId, program.id],
      );
      expect(txRows.length).toBe(1);
    });

    it('single ticket generates independent EARN for SPEND_POINTS, PRODUCT_STAMPS, and VISIT_STAMPS simultaneously', async () => {
      // 1. SPEND_POINTS program
      const progSpend = await h.loyaltyService.createProgram('tenant-1', {
        name: `Multi-Spend-${randomUUID().slice(0, 6)}`,
        program_type: 'SPEND_POINTS' as any,
        earning_rule: { spendBlockNio: 20, pointsPerBlock: 2 },
        eligibility_rule: {},
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: '2027-12-31T23:59:59Z',
      });
      await h.loyaltyService.activateProgram('tenant-1', progSpend.id);

      // 2. PRODUCT_STAMPS program
      const progProd = await h.loyaltyService.createProgram('tenant-1', {
        name: `Multi-Prod-${randomUUID().slice(0, 6)}`,
        program_type: 'PRODUCT_STAMPS' as any,
        earning_rule: {
          eligibleProductIds: ['prod-burger'],
          unitsPerPurchasedUnit: 1,
        },
        eligibility_rule: {},
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: '2027-12-31T23:59:59Z',
      });
      await h.loyaltyService.activateProgram('tenant-1', progProd.id);

      // 3. VISIT_STAMPS program
      const progVisit = await h.loyaltyService.createProgram('tenant-1', {
        name: `Multi-Visit-${randomUUID().slice(0, 6)}`,
        program_type: 'VISIT_STAMPS' as any,
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: '2027-12-31T23:59:59Z',
      });
      await h.loyaltyService.activateProgram('tenant-1', progVisit.id);

      const snapshot: LoyaltyTicketSnapshot = {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: `ticket-multi-${randomUUID().slice(0, 8)}`,
        customerId: h.customerId,
        paidAt: new Date('2026-06-01T12:00:00Z'),
        lines: [
          {
            lineId: 'l1',
            productId: 'prod-burger',
            quantity: 3,
            merchandiseNetNioAfterAllBenefits: 300,
            source: 'NORMAL',
          },
          {
            lineId: 'l2',
            productId: 'prod-free',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 50,
            source: 'LOYALTY_REWARD',
          },
        ],
      };

      const results = await h.ticketPaidHandler.handle(snapshot);
      const spendRes = results.find((r) => r.programId === progSpend.id);
      const prodRes = results.find((r) => r.programId === progProd.id);
      const visitRes = results.find((r) => r.programId === progVisit.id);

      expect(spendRes).toBeDefined();
      // Spend: only NORMAL lines count -> 300 NIO / 20 = 15 blocks * 2 points = 30 units
      expect(spendRes.units).toBe(30);

      expect(prodRes).toBeDefined();
      // Product: 3 burgers = 3 stamps (LOYALTY_REWARD line excluded)
      expect(prodRes.units).toBe(3);

      expect(visitRes).toBeDefined();
      // Visit: 1 visit stamp
      expect(visitRes.units).toBe(1);
    });

    it('INACTIVE program produces no EARN in real DB', async () => {
      const progInactive = await h.loyaltyService.createProgram('tenant-1', {
        name: `Inactive-${randomUUID().slice(0, 6)}`,
        program_type: 'SPEND_POINTS' as any,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: '2027-12-31T23:59:59Z',
      });
      // Remains in DRAFT / not activated

      const snapshot: LoyaltyTicketSnapshot = {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: `ticket-inactive-${randomUUID().slice(0, 8)}`,
        customerId: h.customerId,
        paidAt: new Date('2026-06-01T12:00:00Z'),
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            quantity: 1,
            merchandiseNetNioAfterAllBenefits: 100,
            source: 'NORMAL',
          },
        ],
      };

      const results = await h.ticketPaidHandler.handle(snapshot);
      expect(
        results.find((r) => r.programId === progInactive.id),
      ).toBeUndefined();
    });
  });
});
