import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { LoyaltyProfitAwareService } from './loyalty-profit-aware.service';
import { TypeOrmInventoryCostQueryAdapter } from './inventory-cost-query.adapter';
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
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../../customers/entities/customer-point-transaction.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

describe('LoyaltyProfitAwareService (Real PostgreSQL DB)', () => {
  let dataSource: DataSource;
  let schema: string;
  let profitAwareService: LoyaltyProfitAwareService;
  let tenant1Id: string;
  let tenant2Id: string;
  let customer1Id: string;

  beforeAll(async () => {
    schema = `loyalty_pa_${randomUUID().replace(/-/g, '')}`;
    const bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
    });
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

    await bootstrap.query(`CREATE TABLE "${schema}".products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
      uom text DEFAULT 'UND', product_type text DEFAULT 'SIMPLE',
      category_code text, stock numeric(12,4) DEFAULT 100.0,
      "averageCost" numeric(12,2) DEFAULT 0.0, "sellPrice" numeric(12,2) DEFAULT 0.0,
      is_perishable boolean DEFAULT false, is_active boolean DEFAULT true,
      tax_rate numeric(5,4) NOT NULL DEFAULT 0.15,
      is_tax_exempt boolean NOT NULL DEFAULT false,
      warehouse_id text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    )`);

    await bootstrap.query(`CREATE TABLE "${schema}".loyalty_programs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
      program_type text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE',
      starts_at timestamptz, ends_at timestamptz,
      earning_rule jsonb NOT NULL DEFAULT '{}', eligibility_rule jsonb NOT NULL DEFAULT '{}',
      config_version int NOT NULL DEFAULT 1,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    )`);

    await bootstrap.query(`CREATE TABLE "${schema}".loyalty_rewards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, loyalty_program_id uuid NOT NULL,
      name text NOT NULL, description text, reward_type text NOT NULL,
      cost_units int NOT NULL, benefit_config jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'ACTIVE', starts_at timestamptz, ends_at timestamptz,
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

    tenant1Id = 'tenant-pa-1';
    tenant2Id = 'tenant-pa-2';
    await bootstrap.query(
      `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
      [tenant1Id, 'Tenant 1'],
    );
    await bootstrap.query(
      `INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`,
      [tenant2Id, 'Tenant 2'],
    );

    customer1Id = randomUUID();
    await bootstrap.query(
      `INSERT INTO "${schema}".customers (id, tenant_id, name) VALUES ($1, $2, $3)`,
      [customer1Id, tenant1Id, 'John Doe'],
    );

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Product,
        LoyaltyProgram,
        RewardDefinition,
        CustomerPointTransaction,
        Customer,
        Tenant,
      ],
      synchronize: false,
    });
    await dataSource.initialize();
    await bootstrap.destroy();

    const costAdapter = new TypeOrmInventoryCostQueryAdapter(
      dataSource.getRepository(Product),
    );
    profitAwareService = new LoyaltyProfitAwareService(
      dataSource.getRepository(RewardDefinition),
      dataSource.getRepository(LoyaltyProgram),
      dataSource.getRepository(CustomerPointTransaction),
      costAdapter,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  describe('Zero-write invariant (Read-only guarantee)', () => {
    it('does NOT modify product stock, averageCost or sellPrice when computing metrics', async () => {
      // Create product
      const product = await dataSource.getRepository(Product).save({
        tenant_id: tenant1Id,
        name: 'Burger Classic',
        stock: 50.0,
        averageCost: 40.0,
        sellPrice: 120.0,
      });

      // Create program and reward
      const program = await dataSource.getRepository(LoyaltyProgram).save({
        tenant_id: tenant1Id,
        name: 'Puntos Burger',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
      });

      const reward = await dataSource.getRepository(RewardDefinition).save({
        tenant_id: tenant1Id,
        loyalty_program_id: program.id,
        name: 'Free Burger',
        reward_type: RewardType.FREE_PRODUCT,
        cost_units: 100,
        benefit_config: { productId: product.id, quantity: 1 },
        status: RewardStatus.ACTIVE,
      });

      const before = await dataSource
        .getRepository(Product)
        .findOneBy({ id: product.id });
      expect(Number(before.stock)).toBe(50.0);

      // Call profit-aware metrics service
      const metrics = await profitAwareService.getRewardProfitAwareMetrics(
        tenant1Id,
        reward.id,
      );
      expect(metrics).toBeDefined();
      expect(metrics.retailPriceNio.status).toBe('AVAILABLE');
      expect(metrics.retailPriceNio.value).toBe(120.0);
      expect(metrics.estimatedCppNio.status).toBe('AVAILABLE');
      expect(metrics.estimatedCppNio.value).toBe(40.0);
      expect(metrics.estimatedRewardCostNio.value).toBe(40.0);

      const after = await dataSource
        .getRepository(Product)
        .findOneBy({ id: product.id });
      expect(Number(after.stock)).toBe(50.0);
      expect(Number(after.averageCost)).toBe(40.0);
      expect(Number(after.sellPrice)).toBe(120.0);
    });
  });

  describe('Two-tenant isolation', () => {
    it('prevents tenant B from reading tenant A reward profit-aware metrics', async () => {
      const program = await dataSource.getRepository(LoyaltyProgram).save({
        tenant_id: tenant1Id,
        name: 'Tenant 1 Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
      });

      const reward = await dataSource.getRepository(RewardDefinition).save({
        tenant_id: tenant1Id,
        loyalty_program_id: program.id,
        name: 'Discount T1',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 50,
        benefit_config: { amountNio: 25 },
        status: RewardStatus.ACTIVE,
      });

      // Tenant 1 can read
      const t1Metrics = await profitAwareService.getRewardProfitAwareMetrics(
        tenant1Id,
        reward.id,
      );
      expect(t1Metrics.rewardId).toBe(reward.id);

      // Tenant 2 must receive NotFoundException
      await expect(
        profitAwareService.getRewardProfitAwareMetrics(tenant2Id, reward.id),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('MC-01 .. MC-10 Acceptance with real DB records', () => {
    it('computes qualified sales, incentive cost, and effective rate with 30-day window and reversals in real DB', async () => {
      const asOf = new Date('2026-09-02T12:00:00.000Z');

      const program = await dataSource.getRepository(LoyaltyProgram).save({
        tenant_id: tenant1Id,
        name: 'Commercial Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
      });

      const reward = await dataSource.getRepository(RewardDefinition).save({
        tenant_id: tenant1Id,
        loyalty_program_id: program.id,
        name: 'C$120 Descuento',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 100,
        benefit_config: { amountNio: 120 },
        status: RewardStatus.ACTIVE,
      });

      // 1. Insert EARN transactions:
      // Earn 1: 10 days ago -> C$12,000
      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        transaction_type: PointTransactionType.EARN,
        units: 1200,
        occurred_at: new Date('2026-08-23T12:00:00Z'),
        commercial_snapshot: { earningBaseNio: 12000 },
      });

      // Earn 2: 20 days ago -> C$8,000
      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        transaction_type: PointTransactionType.EARN,
        units: 800,
        occurred_at: new Date('2026-08-13T12:00:00Z'),
        commercial_snapshot: { earningBaseNio: 8000 },
      });

      // Earn 3: 15 days ago -> C$5,000 but reversed!
      const earn3 = await dataSource
        .getRepository(CustomerPointTransaction)
        .save({
          tenant_id: tenant1Id,
          customer_id: customer1Id,
          loyalty_program_id: program.id,
          transaction_type: PointTransactionType.EARN,
          units: 500,
          occurred_at: new Date('2026-08-18T12:00:00Z'),
          commercial_snapshot: { earningBaseNio: 5000 },
        });

      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        transaction_type: PointTransactionType.REVERSAL,
        units: -500,
        reversal_of_transaction_id: earn3.id,
        occurred_at: new Date('2026-08-19T12:00:00Z'),
      });

      // Earn 4: 35 days ago (outside window) -> C$10,000
      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        transaction_type: PointTransactionType.EARN,
        units: 1000,
        occurred_at: new Date('2026-07-25T12:00:00Z'),
        commercial_snapshot: { earningBaseNio: 10000 },
      });

      // Total qualifiedSalesNio inside window = Earn 1 (12,000) + Earn 2 (8,000) = 20,000!

      // 2. Insert REDEEM transactions for reward:
      // Redeem 1: 5 days ago -> appliedBenefitNio C$120
      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        reward_id: reward.id,
        transaction_type: PointTransactionType.REDEEM,
        units: -100,
        occurred_at: new Date('2026-08-28T12:00:00Z'),
        commercial_snapshot: {
          rewardType: 'DISCOUNT_AMOUNT',
          appliedBenefitNio: 120,
        },
      });

      // Call profit-aware service with asOf
      const metrics = await profitAwareService.getRewardProfitAwareMetrics(
        tenant1Id,
        reward.id,
        asOf,
      );

      // Verify qualified sales
      expect(metrics.qualifiedSalesNio.status).toBe('AVAILABLE');
      expect(metrics.qualifiedSalesNio.value).toBe(20000);

      // Verify incentive cost
      expect(metrics.estimatedIncentiveCostInWindowNio.status).toBe(
        'AVAILABLE',
      );
      expect(metrics.estimatedIncentiveCostInWindowNio.value).toBe(120);

      // Verify rate MC-07: 120 / 20,000 = 0.60%
      expect(metrics.effectiveIncentiveRatePct.status).toBe('AVAILABLE');
      expect(metrics.effectiveIncentiveRatePct.value).toBe(0.6);
    });

    it('returns 0.00% rate when qualified sales exist and zero redemptions (MC-08)', async () => {
      const asOf = new Date('2026-09-02T12:00:00.000Z');

      const program = await dataSource.getRepository(LoyaltyProgram).save({
        tenant_id: tenant1Id,
        name: 'Zero Redemption Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
      });

      const reward = await dataSource.getRepository(RewardDefinition).save({
        tenant_id: tenant1Id,
        loyalty_program_id: program.id,
        name: 'Unclaimed Reward',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 100,
        benefit_config: { amountNio: 50 },
        status: RewardStatus.ACTIVE,
      });

      await dataSource.getRepository(CustomerPointTransaction).save({
        tenant_id: tenant1Id,
        customer_id: customer1Id,
        loyalty_program_id: program.id,
        transaction_type: PointTransactionType.EARN,
        units: 500,
        occurred_at: new Date('2026-08-20T12:00:00Z'),
        commercial_snapshot: { earningBaseNio: 5000 },
      });

      const metrics = await profitAwareService.getRewardProfitAwareMetrics(
        tenant1Id,
        reward.id,
        asOf,
      );

      expect(metrics.qualifiedSalesNio.value).toBe(5000);
      expect(metrics.estimatedIncentiveCostInWindowNio.value).toBe(0);
      expect(metrics.effectiveIncentiveRatePct.status).toBe('AVAILABLE');
      expect(metrics.effectiveIncentiveRatePct.value).toBe(0);
    });

    it('returns NOT_AVAILABLE(NO_QUALIFIED_SALES) when qualified sales is zero (MC-09)', async () => {
      const asOf = new Date('2026-09-02T12:00:00.000Z');

      const program = await dataSource.getRepository(LoyaltyProgram).save({
        tenant_id: tenant1Id,
        name: 'No Sales Program',
        program_type: LoyaltyProgramType.SPEND_POINTS,
        status: LoyaltyProgramStatus.ACTIVE,
      });

      const reward = await dataSource.getRepository(RewardDefinition).save({
        tenant_id: tenant1Id,
        loyalty_program_id: program.id,
        name: 'No Sales Reward',
        reward_type: RewardType.DISCOUNT_AMOUNT,
        cost_units: 50,
        benefit_config: { amountNio: 25 },
        status: RewardStatus.ACTIVE,
      });

      const metrics = await profitAwareService.getRewardProfitAwareMetrics(
        tenant1Id,
        reward.id,
        asOf,
      );

      expect(metrics.qualifiedSalesNio.value).toBe(0);
      expect(metrics.effectiveIncentiveRatePct.status).toBe('NOT_AVAILABLE');
      expect(metrics.effectiveIncentiveRatePct.reason).toBe(
        'NO_QUALIFIED_SALES',
      );
    });
  });
});
