import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { LoyaltyController } from '../../src/modules/loyalty/controllers/loyalty.controller';
import { LoyaltyService } from '../../src/modules/loyalty/services/loyalty.service';
import { TicketPaidHandler } from '../../src/modules/loyalty/services/ticket-paid.handler';
import { LegacyClassificationService } from '../../src/modules/loyalty/services/legacy-classification.service';
import { LoyaltyProfitAwareService } from '../../src/modules/loyalty/services/loyalty-profit-aware.service';
import { TypeOrmInventoryCostQueryAdapter } from '../../src/modules/loyalty/services/inventory-cost-query.adapter';
import { INVENTORY_COST_QUERY_PORT } from '../../src/modules/loyalty/domain/inventory-cost-query.port';
import { LoyaltyProgram, LoyaltyProgramStatus, LoyaltyProgramType } from '../../src/modules/loyalty/entities/loyalty-program.entity';
import { RewardDefinition, RewardStatus, RewardType } from '../../src/modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../src/modules/loyalty/entities/customer-loyalty-account-projection.entity';
import { CustomerPointTransaction, PointTransactionType } from '../../src/modules/customers/entities/customer-point-transaction.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import {
  createIdentityJwtConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

describe('LoyaltyProfitAware (Real DB E2E)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let schema: string;
  let tenantAId: string;
  let tenantBId: string;
  let customerAId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    process.env.JWT_ISSUER = 'omnifood-admin';
    process.env.JWT_AUDIENCE = 'omnifood-pos';
    process.env.JWT_ACCESS_TTL_SECONDS = '3600';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = '5';
    process.env.JWT_ALGORITHM = 'HS256';

    schema = `loyalty_e2e_pa_${randomUUID().replace(/-/g, '')}`;
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

    await bootstrap.query(`CREATE TABLE "${schema}".products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
      uom text DEFAULT 'UND', product_type text DEFAULT 'SIMPLE',
      category_code text, stock numeric(12,4) DEFAULT 100.0,
      "averageCost" numeric(12,2) DEFAULT 0.0, "sellPrice" numeric(12,2) DEFAULT 0.0,
      is_perishable boolean DEFAULT false, is_active boolean DEFAULT true,
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

    await bootstrap.query(`CREATE TABLE "${schema}".customer_loyalty_account_projection (
      tenant_id text NOT NULL, customer_id uuid NOT NULL, loyalty_program_id uuid NOT NULL,
      balance_units int NOT NULL DEFAULT 0, last_transaction_id uuid,
      projection_version int NOT NULL DEFAULT 0, recomputed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, customer_id, loyalty_program_id)
    )`);

    tenantAId = 'tenant-e2e-a';
    tenantBId = 'tenant-e2e-b';
    await bootstrap.query(`INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`, [tenantAId, 'Tenant A']);
    await bootstrap.query(`INSERT INTO "${schema}".tenants (id, name) VALUES ($1, $2)`, [tenantBId, 'Tenant B']);

    customerAId = randomUUID();
    await bootstrap.query(`INSERT INTO "${schema}".customers (id, tenant_id, name) VALUES ($1, $2, $3)`, [
      customerAId,
      tenantAId,
      'Alice',
    ]);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Product,
        LoyaltyProgram,
        RewardDefinition,
        CustomerPointTransaction,
        CustomerLoyaltyAccountProjection,
        Customer,
        Tenant,
      ],
      synchronize: false,
    });
    await dataSource.initialize();
    await bootstrap.destroy();

    const productRepo = dataSource.getRepository(Product);
    const programRepo = dataSource.getRepository(LoyaltyProgram);
    const rewardRepo = dataSource.getRepository(RewardDefinition);
    const txRepo = dataSource.getRepository(CustomerPointTransaction);
    const projRepo = dataSource.getRepository(CustomerLoyaltyAccountProjection);
    const custRepo = dataSource.getRepository(Customer);

    const costAdapter = new TypeOrmInventoryCostQueryAdapter(productRepo);
    const profitAwareService = new LoyaltyProfitAwareService(
      rewardRepo,
      programRepo,
      txRepo,
      costAdapter,
    );
    const loyaltyService = new LoyaltyService(
      programRepo,
      rewardRepo,
      projRepo,
      custRepo,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: jwtSecret }),
      ],
      controllers: [LoyaltyController],
      providers: [
        { provide: LoyaltyService, useValue: loyaltyService },
        { provide: LoyaltyProfitAwareService, useValue: profitAwareService },
        { provide: TicketPaidHandler, useValue: { handle: jest.fn() } },
        { provide: LegacyClassificationService, useValue: { ensureLegacyProgram: jest.fn(), classifyLegacyTransactions: jest.fn() } },
        { provide: INVENTORY_COST_QUERY_PORT, useValue: costAdapter },
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        TenantInterceptor,
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  function createToken(tenantId: string, role: UserRole): string {
    return signIdentityJwtAccessToken(jwtService, {
      sub: `user-${role.toLowerCase()}-${tenantId}`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      tenant_id: tenantId,
    });
  }

  it('performs full E2E HTTP GET /loyalty/rewards/:rewardId/profit-aware with real DB data', async () => {
    const productRepo = dataSource.getRepository(Product);
    const programRepo = dataSource.getRepository(LoyaltyProgram);
    const rewardRepo = dataSource.getRepository(RewardDefinition);
    const txRepo = dataSource.getRepository(CustomerPointTransaction);

    // 1. Create real product with sellPrice=150 and averageCost=60
    const product = await productRepo.save({
      tenant_id: tenantAId,
      name: 'Special Combo',
      sellPrice: 150.0,
      averageCost: 60.0,
      stock: 25.0,
    });

    // 2. Create real loyalty program
    const program = await programRepo.save({
      tenant_id: tenantAId,
      name: 'E2E Program',
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
    });

    // 3. Create real FREE_PRODUCT reward (quantity 2)
    const reward = await rewardRepo.save({
      tenant_id: tenantAId,
      loyalty_program_id: program.id,
      name: '2x Special Combo',
      reward_type: RewardType.FREE_PRODUCT,
      cost_units: 80,
      benefit_config: { productId: product.id, quantity: 2 },
      status: RewardStatus.ACTIVE,
    });

    const asOf = new Date('2026-09-02T12:00:00.000Z');

    // 4. Seed EARN transaction in real DB: C$15,000 qualified sales
    await txRepo.save({
      tenant_id: tenantAId,
      customer_id: customerAId,
      loyalty_program_id: program.id,
      transaction_type: PointTransactionType.EARN,
      units: 1500,
      occurred_at: new Date('2026-08-20T12:00:00Z'),
      commercial_snapshot: { earningBaseNio: 15000 },
    });

    // 5. Seed REDEEM transaction in real DB: 1 redemption of this reward
    await txRepo.save({
      tenant_id: tenantAId,
      customer_id: customerAId,
      loyalty_program_id: program.id,
      reward_id: reward.id,
      transaction_type: PointTransactionType.REDEEM,
      units: -80,
      occurred_at: new Date('2026-08-22T12:00:00Z'),
      commercial_snapshot: {
        rewardType: 'FREE_PRODUCT',
        rewardProductId: product.id,
        rewardQuantity: 2,
        estimatedUnitCostNioAtRedemption: 60,
      },
    });

    // 6. Make HTTP request with Owner token
    const token = createToken(tenantAId, UserRole.OWNER);
    const res = await request(app.getHttpServer())
      .get(`/loyalty/rewards/${reward.id}/profit-aware?as_of=${asOf.toISOString()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.rewardId).toBe(reward.id);
    expect(body.programId).toBe(program.id);
    expect(body.window.label).toBe('LAST_30_DAYS');

    // Product retail price = 150
    expect(body.retailPriceNio.status).toBe('AVAILABLE');
    expect(body.retailPriceNio.value).toBe(150);

    // Product CPP = 60
    expect(body.estimatedCppNio.status).toBe('AVAILABLE');
    expect(body.estimatedCppNio.value).toBe(60);

    // Reward cost = 60 * 2 = 120
    expect(body.estimatedRewardCostNio.status).toBe('AVAILABLE');
    expect(body.estimatedRewardCostNio.value).toBe(120);

    // Qualified sales = 15,000
    expect(body.qualifiedSalesNio.status).toBe('AVAILABLE');
    expect(body.qualifiedSalesNio.value).toBe(15000);

    // Incentive cost in window = 60 * 2 = 120
    expect(body.estimatedIncentiveCostInWindowNio.status).toBe('AVAILABLE');
    expect(body.estimatedIncentiveCostInWindowNio.value).toBe(120);

    // Effective incentive rate = 120 / 15,000 * 100 = 0.80%
    expect(body.effectiveIncentiveRatePct.status).toBe('AVAILABLE');
    expect(body.effectiveIncentiveRatePct.value).toBe(0.8);

    // 7. Verify RBAC: CASHIER is forbidden (403)
    const cashierToken = createToken(tenantAId, UserRole.CASHIER);
    const cashierRes = await request(app.getHttpServer())
      .get(`/loyalty/rewards/${reward.id}/profit-aware`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(cashierRes.status).toBe(403);

    // 8. Verify Tenant isolation: Tenant B cannot access Tenant A reward (404)
    const tenantBToken = createToken(tenantBId, UserRole.OWNER);
    const tenantBRes = await request(app.getHttpServer())
      .get(`/loyalty/rewards/${reward.id}/profit-aware`)
      .set('Authorization', `Bearer ${tenantBToken}`);
    expect(tenantBRes.status).toBe(404);
  });
});
