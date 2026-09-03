import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../entities/loyalty-program.entity';
import { RewardDefinition, RewardStatus, RewardType } from '../entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction } from '../../customers/entities/customer-point-transaction.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

async function createTestHarness() {
  const schema = `loyalty_test_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  // Create minimal required tables
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

  // Seed tenant
  await bootstrap.query(
    `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
    ['tenant-1', 'Test Tenant'],
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

  const service = new LoyaltyService(
    dataSource.getRepository(LoyaltyProgram),
    dataSource.getRepository(RewardDefinition),
    dataSource.getRepository(CustomerLoyaltyAccountProjection),
    dataSource.getRepository(Customer),
  );

  return {
    service,
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

describe('LoyaltyService (db)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness?.destroy();
  });

  describe('Program CRUD', () => {
    it('creates a DRAFT program with typed earning rule', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Smash Burger Club',
        program_type: LoyaltyProgramType.PRODUCT_STAMPS,
        earning_rule: {
          eligibleProductIds: ['prod-1'],
          unitsPerPurchasedUnit: 1,
        },
        eligibility_rule: {},
      });

      expect(program.id).toBeDefined();
      expect(program.name).toBe('Smash Burger Club');
      expect(program.program_type).toBe(LoyaltyProgramType.PRODUCT_STAMPS);
      expect(program.status).toBe(LoyaltyProgramStatus.DRAFT);
      expect(program.config_version).toBe(1);
      expect(program.tenant_id).toBe('tenant-1');
    });

    it('lists programs filtered by tenant', async () => {
      await harness.service.createProgram('tenant-1', {
        name: 'Puntos NIO',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      const programs = await harness.service.findAllPrograms('tenant-1');
      expect(programs.length).toBeGreaterThanOrEqual(2);
      expect(programs.every((p) => p.tenant_id === 'tenant-1')).toBe(true);
    });

    it('activates a DRAFT program', async () => {
      const created = await harness.service.createProgram('tenant-1', {
        name: 'Visitas Cafe',
        program_type: LoyaltyProgramType.VISIT_STAMPS,
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
      });

      const activated = await harness.service.activateProgram(
        'tenant-1',
        created.id,
      );
      expect(activated.status).toBe(LoyaltyProgramStatus.ACTIVE);
      expect(activated.config_version).toBe(2);
    });

    it('prevents activating an already ACTIVE program', async () => {
      const created = await harness.service.createProgram('tenant-1', {
        name: 'Double Active',
        program_type: LoyaltyProgramType.VISIT_STAMPS,
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
      });
      await harness.service.activateProgram('tenant-1', created.id);

      await expect(
        harness.service.activateProgram('tenant-1', created.id),
      ).rejects.toThrow('already active');
    });

    it('deactivates an ACTIVE program', async () => {
      const created = await harness.service.createProgram('tenant-1', {
        name: 'To Deactivate',
        program_type: LoyaltyProgramType.VISIT_STAMPS,
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
      });
      await harness.service.activateProgram('tenant-1', created.id);
      const deactivated = await harness.service.deactivateProgram(
        'tenant-1',
        created.id,
      );
      expect(deactivated.status).toBe(LoyaltyProgramStatus.INACTIVE);
    });

    it('updates program and bumps config_version', async () => {
      const created = await harness.service.createProgram('tenant-1', {
        name: 'Old Name',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      const updated = await harness.service.updateProgram(
        'tenant-1',
        created.id,
        { name: 'New Name' },
      );
      expect(updated.name).toBe('New Name');
      expect(updated.config_version).toBe(2);
    });

    it('rejects starts_at >= ends_at', async () => {
      await expect(
        harness.service.createProgram('tenant-1', {
          name: 'Bad Dates',
          program_type: LoyaltyProgramType.VISIT_STAMPS,
          starts_at: '2026-12-31T00:00:00Z',
          ends_at: '2026-01-01T00:00:00Z',
          earning_rule: { unitsPerVisit: 1 },
          eligibility_rule: {},
        }),
      ).rejects.toThrow('starts_at must be before ends_at');
    });

    it('does not leak programs across tenants', async () => {
      await harness.service.createProgram('tenant-1', {
        name: 'Tenant 1 Only',
        program_type: LoyaltyProgramType.VISIT_STAMPS,
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
      });

      const otherTenantPrograms =
        await harness.service.findAllPrograms('tenant-OTHER');
      expect(otherTenantPrograms.length).toBe(0);
    });
  });

  describe('Reward CRUD', () => {
    it('creates a DISCOUNT_AMOUNT reward with amountNio validation', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Reward Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      const reward = await harness.service.createReward(
        'tenant-1',
        program.id,
        {
          name: 'C$50 Descuento',
          reward_type: RewardType.DISCOUNT_AMOUNT,
          cost_units: 100,
          benefit_config: { amountNio: 50 },
        },
      );

      expect(reward.id).toBeDefined();
      expect(reward.name).toBe('C$50 Descuento');
      expect(reward.cost_units).toBe(100);
      expect(reward.status).toBe(RewardStatus.INACTIVE);
    });

    it('rejects DISCOUNT_AMOUNT without amountNio', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Reject Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      await expect(
        harness.service.createReward('tenant-1', program.id, {
          name: 'Bad Reward',
          reward_type: RewardType.DISCOUNT_AMOUNT,
          cost_units: 100,
          benefit_config: {},
        }),
      ).rejects.toThrow('amountNio > 0');
    });

    it('creates a FREE_PRODUCT reward with productId', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Free Product Program',
        program_type: LoyaltyProgramType.PRODUCT_STAMPS,
        earning_rule: { eligibleProductIds: ['prod-1'], unitsPerPurchasedUnit: 1 },
        eligibility_rule: {},
      });

      const reward = await harness.service.createReward(
        'tenant-1',
        program.id,
        {
          name: 'Cappuccino Gratis',
          reward_type: RewardType.FREE_PRODUCT,
          cost_units: 10,
          benefit_config: { productId: 'prod-cappuccino', quantity: 1 },
        },
      );

      expect(reward.reward_type).toBe(RewardType.FREE_PRODUCT);
      expect((reward.benefit_config as any).productId).toBe('prod-cappuccino');
    });

    it('rejects FREE_PRODUCT without productId', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Bad Free Product',
        program_type: LoyaltyProgramType.PRODUCT_STAMPS,
        earning_rule: { eligibleProductIds: [], unitsPerPurchasedUnit: 1 },
        eligibility_rule: {},
      });

      await expect(
        harness.service.createReward('tenant-1', program.id, {
          name: 'No Product',
          reward_type: RewardType.FREE_PRODUCT,
          cost_units: 10,
          benefit_config: {},
        }),
      ).rejects.toThrow('productId');
    });

    it('activates and deactivates a reward', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Activation Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      const reward = await harness.service.createReward(
        'tenant-1',
        program.id,
        {
          name: 'Toggle Reward',
          reward_type: RewardType.DISCOUNT_AMOUNT,
          cost_units: 50,
          benefit_config: { amountNio: 25 },
        },
      );

      const activated = await harness.service.activateReward(
        'tenant-1',
        reward.id,
      );
      expect(activated.status).toBe(RewardStatus.ACTIVE);

      const deactivated = await harness.service.deactivateReward(
        'tenant-1',
        reward.id,
      );
      expect(deactivated.status).toBe(RewardStatus.INACTIVE);
    });

    it('bumps program config_version when reward is created', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Version Bump',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      expect(program.config_version).toBe(1);

      await harness.service.createReward('tenant-1', program.id, {
        name: 'Versioned Reward',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 10,
        benefit_config: { amountNio: 5 },
      });

      const refreshed = await harness.service.findOneProgram(
        'tenant-1',
        program.id,
      );
      expect(refreshed.config_version).toBe(2);
    });

    it('lists rewards ordered by presentation_order', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Order Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      await harness.service.createReward('tenant-1', program.id, {
        name: 'Second',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 20,
        benefit_config: { amountNio: 10 },
        presentation_order: 2,
      });
      await harness.service.createReward('tenant-1', program.id, {
        name: 'First',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 10,
        benefit_config: { amountNio: 5 },
        presentation_order: 1,
      });

      const rewards = await harness.service.findRewardsByProgram(
        'tenant-1',
        program.id,
      );
      expect(rewards[0].name).toBe('First');
      expect(rewards[1].name).toBe('Second');
    });
  });

  describe('Program type immutability hint', () => {
    it('stores program_type as configured and allows read-back', async () => {
      const program = await harness.service.createProgram('tenant-1', {
        name: 'Spend Points',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      const found = await harness.service.findOneProgram(
        'tenant-1',
        program.id,
      );
      expect(found.program_type).toBe(LoyaltyProgramType.SPEND_POINTS);
    });
  });

  describe('Edge cases', () => {
    it('throws NotFoundException for non-existent program', async () => {
      await expect(
        harness.service.findOneProgram('tenant-1', randomUUID()),
      ).rejects.toThrow('not found');
    });

    it('throws NotFoundException for non-existent reward', async () => {
      await harness.service.createProgram('tenant-1', {
        name: 'Empty Reward',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
      });

      await expect(
        harness.service.findOneReward('tenant-1', randomUUID()),
      ).rejects.toThrow('not found');
    });
  });
});
