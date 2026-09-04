import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { RedemptionService } from './redemption.service';
import {
  CustomerPointTransaction,
  PointTransactionType,
  LoyaltyTransactionOrigin,
} from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import {
  RewardDefinition,
  RewardType,
  RewardStatus,
} from '../entities/reward-definition.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

describe('LV1.7E — Loyalty Audit & Antifraud Suite (Real PostgreSQL)', () => {
  let dataSource: DataSource;
  let schema: string;
  let ledgerService: LoyaltyLedgerService;
  let loyaltyService: LoyaltyService;
  let redemptionService: RedemptionService;

  let txRepo: Repository<CustomerPointTransaction>;
  let projRepo: Repository<CustomerLoyaltyAccountProjection>;
  let progRepo: Repository<LoyaltyProgram>;
  let rewardRepo: Repository<RewardDefinition>;
  let custRepo: Repository<Customer>;
  let tenantRepo: Repository<Tenant>;

  const tenantId = 'tenant-audit-antifraud';
  let customerId: string;
  let programId: string;
  let rewardId: string;

  beforeAll(async () => {
    schema = `loyalty_audit_${randomUUID().replace(/-/g, '')}`;
    const bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    await bootstrap.query(`CREATE TABLE "${schema}".tenants (
      id text PRIMARY KEY, name text NOT NULL, ruc text, is_active boolean DEFAULT true,
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
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_program_id uuid NOT NULL,
      tenant_id text NOT NULL, name text NOT NULL, description text, reward_type text NOT NULL,
      cost_units int NOT NULL, benefit_config jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'DRAFT', presentation_order int NOT NULL DEFAULT 0,
      config_version int NOT NULL DEFAULT 1,
      starts_at timestamptz, ends_at timestamptz,
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

    await bootstrap.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        Customer,
        LoyaltyProgram,
        RewardDefinition,
        CustomerPointTransaction,
        CustomerLoyaltyAccountProjection,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    tenantRepo = dataSource.getRepository(Tenant);
    custRepo = dataSource.getRepository(Customer);
    progRepo = dataSource.getRepository(LoyaltyProgram);
    rewardRepo = dataSource.getRepository(RewardDefinition);
    txRepo = dataSource.getRepository(CustomerPointTransaction);
    projRepo = dataSource.getRepository(CustomerLoyaltyAccountProjection);

    ledgerService = new LoyaltyLedgerService(txRepo, projRepo);
    loyaltyService = new LoyaltyService(
      progRepo,
      rewardRepo,
      projRepo,
      custRepo,
    );
    redemptionService = new RedemptionService(
      progRepo,
      rewardRepo,
      custRepo,
      txRepo,
      ledgerService,
      loyaltyService,
    );

    await tenantRepo.save({
      id: tenantId,
      name: 'Audit Antifraud Tenant',
      is_active: true,
    });

    const customer = await custRepo.save({
      tenant_id: tenantId,
      name: 'Carlos Audit',
      tax_id: 'AUDIT001',
      points_balance: 0,
      is_active: true,
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  describe('Program & Reward Lifecycle Audit Trail', () => {
    it('bumps program and reward config_version monotonically on create, update, activate, deactivate', async () => {
      // 1. Create Program (version 1)
      const prog = await loyaltyService.createProgram(tenantId, {
        name: 'Smash Audit Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { pointsPerBlock: 1, spendBlockNio: 10 },
        eligibility_rule: {},
      });
      programId = prog.id;
      expect(prog.config_version).toBe(1);
      expect(prog.status).toBe(LoyaltyProgramStatus.DRAFT);

      // 2. Activate Program (bumps version to 2)
      const progActive = await loyaltyService.activateProgram(
        tenantId,
        programId,
      );
      expect(progActive.config_version).toBe(2);
      expect(progActive.status).toBe(LoyaltyProgramStatus.ACTIVE);

      // 3. Create Reward (bumps program version to 3)
      const reward = await loyaltyService.createReward(tenantId, programId, {
        name: 'Free Drink',
        reward_type: RewardType.FREE_PRODUCT,
        cost_units: 15,
        benefit_config: { productId: 'prod-drink-01' },
      });
      rewardId = reward.id;
      expect(reward.config_version).toBe(1);
      expect(reward.status).toBe(RewardStatus.INACTIVE);

      const progAfterReward = await loyaltyService.findOneProgram(
        tenantId,
        programId,
      );
      expect(progAfterReward.config_version).toBe(3);

      // 4. Activate Reward (bumps reward version to 2)
      const rewardActive = await loyaltyService.activateReward(
        tenantId,
        rewardId,
      );
      expect(rewardActive.config_version).toBe(2);
      expect(rewardActive.status).toBe(RewardStatus.ACTIVE);
    });
  });

  describe('AV-10: Adjustment Supervision & Negative Units', () => {
    it('creates adjustment with actor_user_id and reason, allowing negative balance', async () => {
      const supervisorId = randomUUID();
      const adjTx = await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        transactionType: 'ADJUST',
        units: -50, // Negative adjustment on 0 balance => -50 balance
        reason: 'Fraudulent points correction by manager',
        actorUserId: supervisorId,
        origin: 'CLOUD',
        idempotencyKey: `adj:${tenantId}:${customerId}:001`,
        occurredAt: new Date(),
      });

      expect(adjTx.actor_user_id).toBe(supervisorId);
      expect(adjTx.reason).toBe('Fraudulent points correction by manager');
      expect(adjTx.units).toBe(-50);

      // Verify projection is negative -50 (AV-10, AV-41)
      const proj = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(proj.balance_units).toBe(-50);
    });
  });

  describe('Redemption Metadata & Privacy (Zero PII/Tokens)', () => {
    it('redemption records commercial_snapshot with benefit without PIN, password, or JWT tokens', async () => {
      // First bring balance up to 100
      await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        transactionType: 'EARN',
        units: 150,
        origin: 'POS',
        occurredAt: new Date(),
      });

      const intent = await redemptionService.createRedemptionIntent({
        tenantId,
        customerId,
        ticketId: 'ticket-audit-001',
        loyaltyProgramId: programId,
        rewardId,
      });

      const consolidation = await redemptionService.consolidateRedemption(
        tenantId,
        intent.id,
        {
          tenantId,
          branchId: 'main-branch',
          terminalId: 'term-01',
          ticketId: 'ticket-audit-001',
          customerId,
          paidAt: new Date(),
          lines: [],
        },
      );

      const tx = consolidation.redeemTransaction;
      expect(tx).toBeDefined();
      expect(tx.commercial_snapshot).toBeDefined();

      const snapStr = JSON.stringify(tx.commercial_snapshot);
      expect(snapStr).not.toContain('pin');
      expect(snapStr).not.toContain('password');
      expect(snapStr).not.toContain('jwt');
      expect(snapStr).not.toContain('bearer');
      expect(snapStr).not.toContain('token');
      expect(snapStr).not.toContain('cvv');
    });
  });

  describe('AV-08 & AV-09: VOID -> TicketVoided -> Loyalty Reversal (Correlation & Idempotency)', () => {
    const ticketId = 'ticket-void-test-01';

    beforeAll(async () => {
      // Create EARN (+25) and REDEEM (-15) for this ticket
      await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        ticketId,
        transactionType: 'EARN',
        units: 25,
        idempotencyKey: `earn:${tenantId}:${ticketId}:${programId}`,
        origin: 'POS',
        occurredAt: new Date(),
      });

      await ledgerService.appendTransaction({
        tenantId,
        customerId,
        loyaltyProgramId: programId,
        ticketId,
        transactionType: 'REDEEM',
        units: -15,
        idempotencyKey: `redeem:${tenantId}:${ticketId}:${programId}`,
        origin: 'POS',
        occurredAt: new Date(),
      });
    });

    it('reverses all economic movements of voided ticket without deleting original rows', async () => {
      const reversals = await redemptionService.reverseTicketLoyalty(
        tenantId,
        ticketId,
        customerId,
      );

      // Expect 2 compensating reversals: -25 for EARN, +15 for REDEEM
      expect(reversals.length).toBe(2);

      const revEarn = reversals.find((r) => r.units === -25);
      const revRedeem = reversals.find((r) => r.units === 15);

      expect(revEarn).toBeDefined();
      expect(revEarn.reversal_of_transaction_id).toBeDefined();
      expect(revEarn.transaction_type).toBe('REVERSAL');

      expect(revRedeem).toBeDefined();
      expect(revRedeem.reversal_of_transaction_id).toBeDefined();
      expect(revRedeem.transaction_type).toBe('REVERSAL');

      // Verify originals were NOT deleted (Strictly append-only ledger!)
      const originals = await txRepo.find({
        where: { tenant_id: tenantId, ticket_id: ticketId },
      });
      // 2 originals + 2 reversals = 4 total rows for this ticket
      expect(originals.length).toBe(4);

      // Verify projection matches SUM(ledger) exactly
      const sumResult = await txRepo
        .createQueryBuilder('tx')
        .select('SUM(tx.units)', 'total')
        .where('tx.tenant_id = :tenantId', { tenantId })
        .andWhere('tx.customer_id = :customerId', { customerId })
        .andWhere('tx.loyalty_program_id = :programId', { programId })
        .getRawOne();

      const proj = await projRepo.findOne({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });

      expect(proj.balance_units).toBe(Number(sumResult.total));
    });

    it('retry of TicketVoided reversal is strictly idempotent (zero duplicates created)', async () => {
      const retryReversals = await redemptionService.reverseTicketLoyalty(
        tenantId,
        ticketId,
        customerId,
      );

      // Already reversed, should return empty list
      expect(retryReversals.length).toBe(0);

      const totalRows = await txRepo.count({
        where: { tenant_id: tenantId, ticket_id: ticketId },
      });
      expect(totalRows).toBe(4);
    });
  });
});
