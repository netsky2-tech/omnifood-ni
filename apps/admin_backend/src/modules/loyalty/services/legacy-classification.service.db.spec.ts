import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { LegacyClassificationService } from './legacy-classification.service';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../entities/loyalty-program.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
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
  const schema = `loyalty_class_test_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  await bootstrap.query(`CREATE TABLE "${schema}".tenants (
    id text PRIMARY KEY, name text NOT NULL, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);

  const customerId = randomUUID();
  await bootstrap.query(`CREATE TABLE "${schema}".customers (
    id uuid PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL,
    tax_id text, phone text, email text, address text,
    points_balance numeric(12,2) DEFAULT 0.0, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  )`);
  await bootstrap.query(
    `INSERT INTO "${schema}".customers (id, tenant_id, name, points_balance) VALUES ($1, $2, $3, $4)`,
    [customerId, 'tenant-1', 'Legacy Customer', 150.5],
  );

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

  // Insert legacy transactions (no loyalty_program_id)
  const legacyTxIds = [randomUUID(), randomUUID(), randomUUID()];
  for (const txId of legacyTxIds) {
    await bootstrap.query(
      `INSERT INTO "${schema}".customer_point_transactions
       (id, tenant_id, customer_id, type, units, points, balance_after, conversion_rate, created_at)
       VALUES ($1, $2, $3, 'earn', 50, 50.0, 100.0, 0.1, now())`,
      [txId, 'tenant-1', customerId],
    );
  }

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

  const service = new LegacyClassificationService(
    dataSource.getRepository(LoyaltyProgram),
    dataSource.getRepository(CustomerPointTransaction),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
    dataSource.getRepository(Customer),
  );

  return {
    service,
    customerId,
    txRepo: dataSource.getRepository(CustomerPointTransaction),
    programRepo: dataSource.getRepository(LoyaltyProgram),
    projectionRepo: dataSource.getRepository(CustomerLoyaltyAccountProjection),
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

describe('LegacyClassificationService (db)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness?.destroy();
  });

  describe('ensureLegacyProgram', () => {
    it('creates a "Puntos Legacy" program with SPEND_POINTS type', async () => {
      const program = await harness.service.ensureLegacyProgram('tenant-1');

      expect(program.id).toBeDefined();
      expect(program.name).toBe('Puntos Legacy');
      expect(program.program_type).toBe(LoyaltyProgramType.SPEND_POINTS);
      expect(program.status).toBe(LoyaltyProgramStatus.ACTIVE);
      expect(program.tenant_id).toBe('tenant-1');
    });

    it('is idempotent: second call returns same program', async () => {
      const first = await harness.service.ensureLegacyProgram('tenant-1');
      const second = await harness.service.ensureLegacyProgram('tenant-1');

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Puntos Legacy');

      const allPrograms = await harness.programRepo.find({
        where: { tenant_id: 'tenant-1', name: 'Puntos Legacy' },
      });
      expect(allPrograms).toHaveLength(1);
    });
  });

  describe('classifyLegacyTransactions', () => {
    it('classifies unclassified transactions to the legacy program', async () => {
      const program = await harness.service.ensureLegacyProgram('tenant-1');
      const result =
        await harness.service.classifyLegacyTransactions('tenant-1');

      expect(result.classified).toBe(3);

      const txsWithProgram = await harness.txRepo.count({
        where: {
          tenant_id: 'tenant-1',
          loyalty_program_id: program.id,
          legacy_imported: true,
        },
      });
      expect(txsWithProgram).toBe(3);
    });

    it('does not re-classify already classified transactions', async () => {
      const result =
        await harness.service.classifyLegacyTransactions('tenant-1');
      expect(result.classified).toBe(0);
    });
  });

  describe('reconcileProjection', () => {
    it('creates projection from SUM(units) of classified transactions', async () => {
      const program = await harness.service.ensureLegacyProgram('tenant-1');
      const projection = await harness.service.reconcileProjection(
        'tenant-1',
        harness.customerId,
        program.id,
      );

      expect(projection).toBeDefined();
      expect(projection.balance_units).toBe(150);
      expect(projection.projection_version).toBeGreaterThanOrEqual(1);
    });

    it('returns existing projection on second call (idempotent)', async () => {
      const program = await harness.service.ensureLegacyProgram('tenant-1');
      const first = await harness.service.reconcileProjection(
        'tenant-1',
        harness.customerId,
        program.id,
      );
      const second = await harness.service.reconcileProjection(
        'tenant-1',
        harness.customerId,
        program.id,
      );

      expect(second.projection_version).toBe(first.projection_version + 1);
      expect(second.balance_units).toBe(first.balance_units);
    });
  });
});
