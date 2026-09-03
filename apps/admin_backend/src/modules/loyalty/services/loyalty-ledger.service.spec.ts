import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { LoyaltyLedgerService, AppendLoyaltyTxDto } from './loyalty-ledger.service';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../entities/loyalty-program.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { RewardDefinition } from '../entities/reward-definition.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

async function createTestHarness() {
  const schema = `loyalty_ledger_test_${randomUUID().replace(/-/g, '')}`;
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

  await bootstrap.query(`CREATE TABLE "${schema}".reward_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_program_id uuid NOT NULL,
    tenant_id text NOT NULL, name text NOT NULL, reward_type text NOT NULL,
    points_required int NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
    config_version int NOT NULL DEFAULT 1, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  await bootstrap.query(
    `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
    ['tenant-1', 'Test Tenant'],
  );

  await bootstrap.query(
    `INSERT INTO "${schema}".customers (id, tenant_id, name, points_balance) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), 'tenant-1', 'Test Customer', 0],
  );

  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    schema,
    entities: [
      CustomerPointTransaction,
      CustomerLoyaltyAccountProjection,
      LoyaltyProgram,
      RewardDefinition,
      Customer,
      Tenant,
    ],
    synchronize: false,
  });
  await dataSource.initialize();

  const ledgerService = new LoyaltyLedgerService(
    dataSource.getRepository(CustomerPointTransaction),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
  );

  return {
    ledgerService,
    txRepo: dataSource.getRepository(CustomerPointTransaction),
    projectionRepo: dataSource.getRepository(CustomerLoyaltyAccountProjection),
    programRepo: dataSource.getRepository(LoyaltyProgram),
    customerRepo: dataSource.getRepository(Customer),
    dataSource,
    bootstrap,
    schema,
    destroy: async () => {
      await dataSource.destroy();
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    },
  };
}

describe('LoyaltyLedgerService (db)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let customerId: string;
  let programId: string;

  beforeAll(async () => {
    harness = await createTestHarness();

    const customer = await harness.customerRepo.findOne({
      where: { tenant_id: 'tenant-1' },
    });
    customerId = customer!.id;

    const program = await harness.programRepo.save(
      harness.programRepo.create({
        tenant_id: 'tenant-1',
        name: 'Puntos NIO',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        config_version: 1,
      }),
    );
    programId = program.id;
  });

  afterAll(async () => {
    await harness?.destroy();
  });

  describe('appendTransaction', () => {
    it('creates a loyalty transaction and updates projection', async () => {
      const dto: AppendLoyaltyTxDto = {
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-001',
        transactionType: 'EARN',
        units: 10,
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      };

      const tx = await harness.ledgerService.appendTransaction(dto);

      expect(tx.id).toBeDefined();
      expect(tx.loyalty_program_id).toBe(programId);
      expect(tx.units).toBe(10);
      expect(tx.transaction_type).toBe('EARN');
      expect(tx.idempotency_key).toBe(dto.idempotencyKey);
      expect(tx.legacy_imported).toBe(false);

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: 'tenant-1',
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection).toBeDefined();
      expect(projection!.balance_units).toBe(10);
      expect(projection!.projection_version).toBe(1);
    });

    it('accumulates units across multiple transactions', async () => {
      await harness.ledgerService.appendTransaction({
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-002',
        transactionType: 'EARN',
        units: 5,
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-002:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      });

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: 'tenant-1',
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection!.balance_units).toBe(15);
      expect(projection!.projection_version).toBe(2);
    });

    it('is idempotent: same idempotency key returns existing transaction', async () => {
      const dto: AppendLoyaltyTxDto = {
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-003',
        transactionType: 'EARN',
        units: 8,
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-003:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      };

      const first = await harness.ledgerService.appendTransaction(dto);
      const second = await harness.ledgerService.appendTransaction(dto);

      expect(second.id).toBe(first.id);
      expect(second.units).toBe(first.units);

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: 'tenant-1',
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection!.balance_units).toBe(23);
    });

    it('duplicate insert does not alter balance or increment projection_version', async () => {
      const before = await harness.projectionRepo.findOne({
        where: { tenant_id: 'tenant-1', customer_id: customerId, loyalty_program_id: programId },
      });
      const dto: AppendLoyaltyTxDto = {
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-001',
        transactionType: 'EARN',
        units: 10,
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      };
      const duplicate = await harness.ledgerService.appendTransaction(dto);
      expect(duplicate).toBeDefined();

      const after = await harness.projectionRepo.findOne({
        where: { tenant_id: 'tenant-1', customer_id: customerId, loyalty_program_id: programId },
      });
      expect(after!.balance_units).toBe(before!.balance_units);
      expect(after!.projection_version).toBe(before!.projection_version);
    });

    it('same idempotencyKey + different payload throws ConflictException (AV-13 integrity conflict)', async () => {
      const conflictDto: AppendLoyaltyTxDto = {
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-001',
        transactionType: 'EARN',
        units: 999,
        idempotencyKey: 'loyalty:earn:tenant-1:ticket-001:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      };

      await expect(harness.ledgerService.appendTransaction(conflictDto)).rejects.toThrow(
        /Integrity conflict/i,
      );
    });

    it('handles negative units for REVERSAL', async () => {
      await harness.ledgerService.appendTransaction({
        tenantId: 'tenant-1',
        customerId,
        loyaltyProgramId: programId,
        ticketId: 'ticket-004',
        transactionType: 'REVERSAL',
        units: -5,
        idempotencyKey: 'loyalty:reversal:tenant-1:ticket-004:' + programId,
        origin: 'POS',
        occurredAt: new Date(),
      });

      const projection = await harness.projectionRepo.findOne({
        where: {
          tenant_id: 'tenant-1',
          customer_id: customerId,
          loyalty_program_id: programId,
        },
      });
      expect(projection!.balance_units).toBe(18);
    });
  });

  describe('rebuildProjection', () => {
    it('recomputes projection from ledger SUM(units)', async () => {
      const projection = await harness.ledgerService.rebuildProjection(
        'tenant-1',
        customerId,
        programId,
      );

      expect(projection.balance_units).toBe(18);
      expect(projection.projection_version).toBeGreaterThan(0);
    });
  });
});
