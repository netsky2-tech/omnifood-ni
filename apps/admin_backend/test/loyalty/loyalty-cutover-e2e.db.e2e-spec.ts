import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { LoyaltyController } from '../../src/modules/loyalty/controllers/loyalty.controller';
import { CustomersController } from '../../src/modules/customers/controllers/customers.controller';
import { LoyaltyService } from '../../src/modules/loyalty/services/loyalty.service';
import { CustomersService } from '../../src/modules/customers/services/customers.service';
import { TicketPaidHandler } from '../../src/modules/loyalty/services/ticket-paid.handler';
import { LegacyClassificationService } from '../../src/modules/loyalty/services/legacy-classification.service';
import { LoyaltyProfitAwareService } from '../../src/modules/loyalty/services/loyalty-profit-aware.service';
import { RedemptionService } from '../../src/modules/loyalty/services/redemption.service';
import { LoyaltyLedgerService } from '../../src/modules/loyalty/services/loyalty-ledger.service';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  LoyaltyProgramType,
} from '../../src/modules/loyalty/entities/loyalty-program.entity';
import {
  RewardDefinition,
  RewardStatus,
  RewardType,
} from '../../src/modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../src/modules/loyalty/entities/customer-loyalty-account-projection.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../../src/modules/customers/entities/customer-point-transaction.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { INVENTORY_COST_QUERY_PORT } from '../../src/modules/loyalty/domain/inventory-cost-query.port';
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

describe('Loyalty Cutover & Writers E2E (LV1.7A / M7 & M8 Real PostgreSQL)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let schema: string;

  const tenantId = 'tenant-cutover-e2e';
  let customerId: string;
  let programId: string;
  let rewardId: string;

  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    process.env.JWT_ISSUER = 'omnifood-admin';
    process.env.JWT_AUDIENCE = 'omnifood-pos';
    process.env.JWT_ACCESS_TTL_SECONDS = '3600';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = '5';
    process.env.JWT_ALGORITHM = 'HS256';

    schema = `loyalty_cutover_${randomUUID().replace(/-/g, '')}`;
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

    await bootstrap.query(`CREATE TABLE "${schema}".products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, name text NOT NULL,
      average_cost numeric(12,4) DEFAULT 0.0, price numeric(12,4) DEFAULT 0.0,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
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
        Product,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    const progRepo = dataSource.getRepository(LoyaltyProgram);
    const rewardRepo = dataSource.getRepository(RewardDefinition);
    const projRepo = dataSource.getRepository(CustomerLoyaltyAccountProjection);
    const txRepo = dataSource.getRepository(CustomerPointTransaction);
    const custRepo = dataSource.getRepository(Customer);
    const tenantRepo = dataSource.getRepository(Tenant);

    await tenantRepo.save({
      id: tenantId,
      name: 'Cutover E2E Tenant',
      is_active: true,
    });

    const customer = await custRepo.save({
      tenant_id: tenantId,
      name: 'Cutover Carlos',
      points_balance: 0,
      is_active: true,
    });
    customerId = customer.id;

    const program = await progRepo.save({
      tenant_id: tenantId,
      name: 'Cutover Program',
      program_type: LoyaltyProgramType.SPEND_POINTS,
      status: LoyaltyProgramStatus.ACTIVE,
      earning_rule: { pointsPerBlock: 1, spendBlockNio: 10 },
      eligibility_rule: {},
    });
    programId = program.id;

    const reward = await rewardRepo.save({
      tenant_id: tenantId,
      loyalty_program_id: programId,
      name: 'Cutover Free Soda',
      reward_type: RewardType.FREE_PRODUCT,
      cost_units: 20,
      benefit_config: { productId: 'prod-soda' },
      status: RewardStatus.ACTIVE,
    });
    rewardId = reward.id;

    const ledgerService = new LoyaltyLedgerService(txRepo, projRepo);
    const loyaltyService = new LoyaltyService(
      progRepo,
      rewardRepo,
      projRepo,
      custRepo,
    );
    const ticketPaidHandler = new TicketPaidHandler(
      progRepo,
      custRepo,
      ledgerService,
    );
    const legacyClassificationService = new LegacyClassificationService(
      progRepo,
      txRepo,
      projRepo,
      custRepo,
    );
    const redemptionService = new RedemptionService(
      progRepo,
      rewardRepo,
      custRepo,
      txRepo,
      ledgerService,
      loyaltyService,
    );
    const profitAwareService = new LoyaltyProfitAwareService(
      rewardRepo,
      progRepo,
      txRepo,
      {
        getCurrentEstimatedCostAndPrice: jest.fn().mockResolvedValue({
          status: 'AVAILABLE',
          estimatedCppNio: 10,
          canonicalBasePriceNio: 25,
        }),
      },
    );
    const customersService = new CustomersService(custRepo, txRepo);

    // Initial seed: 100 units in customer account
    await ledgerService.appendTransaction({
      tenantId,
      customerId,
      loyaltyProgramId: programId,
      transactionType: 'EARN',
      units: 100,
      idempotencyKey: `seed:${tenantId}:${customerId}`,
      origin: 'POS',
      occurredAt: new Date(),
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: jwtSecret }),
      ],
      controllers: [LoyaltyController, CustomersController],
      providers: [
        { provide: LoyaltyService, useValue: loyaltyService },
        { provide: LoyaltyProfitAwareService, useValue: profitAwareService },
        { provide: TicketPaidHandler, useValue: ticketPaidHandler },
        {
          provide: LegacyClassificationService,
          useValue: legacyClassificationService,
        },
        { provide: RedemptionService, useValue: redemptionService },
        { provide: LoyaltyLedgerService, useValue: ledgerService },
        { provide: CustomersService, useValue: customersService },
        {
          provide: INVENTORY_COST_QUERY_PORT,
          useValue: { getProductCostHistory: jest.fn() },
        },
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        TenantInterceptor,
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    jwtService = moduleRef.get<JwtService>(JwtService);
    await app.init();

    ownerToken = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'owner@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantId,
    });

    cashierToken = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'cashier@omnifood.ni',
      role: UserRole.CASHIER,
      tenant_id: tenantId,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  describe('Redemption HTTP Workflow (LV1.7A / M7)', () => {
    let intentId: string;
    const ticketId = 'ticket-e2e-cutover-01';

    it('POST /loyalty/redemptions/intent — Cashier creates intent (does not debit balance yet)', async () => {
      const res = await request(app.getHttpServer())
        .post('/loyalty/redemptions/intent')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerId,
          ticketId,
          loyaltyProgramId: programId,
          rewardId,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.application.costUnits).toBe(20);
      intentId = res.body.id;

      // Verify balance is STILL 100 (Intent does NOT consume units!)
      const balRes = await request(app.getHttpServer())
        .get(`/loyalty/customers/${customerId}/balance?program_id=${programId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(balRes.body.balanceUnits).toBe(100);
    });

    it('POST /loyalty/redemptions/consolidate — Cashier consolidates intent at ticket PAID', async () => {
      const res = await request(app.getHttpServer())
        .post('/loyalty/redemptions/consolidate')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          intentId,
          snapshot: {
            tenantId,
            branchId: 'branch-main',
            terminalId: 'pos-term-01',
            ticketId,
            customerId,
            paidAt: new Date(),
            lines: [],
          },
        })
        .expect(201);

      expect(res.body.alreadyConsolidated).toBe(false);
      expect(res.body.redeemTransaction).toBeDefined();
      expect(res.body.redeemTransaction.units).toBe(-20);

      // Verify projection is now 100 - 20 = 80
      const balRes = await request(app.getHttpServer())
        .get(`/loyalty/customers/${customerId}/balance?program_id=${programId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(balRes.body.balanceUnits).toBe(80);
    });

    it('POST /loyalty/reversals — Cashier triggers ticket void reversal compensations', async () => {
      const res = await request(app.getHttpServer())
        .post('/loyalty/reversals')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          ticketId,
          customerId,
        })
        .expect(201);

      expect(res.body.processed).toBe(1);
      expect(res.body.reversals[0].units).toBe(20); // Compensated +20

      // Verify projection is restored back to 100
      const balRes = await request(app.getHttpServer())
        .get(`/loyalty/customers/${customerId}/balance?program_id=${programId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(balRes.body.balanceUnits).toBe(100);
    });
  });

  describe('Manual Adjustment RBAC (LV1.7A & AV-10)', () => {
    it('rejects Cashier with 403 on POST /loyalty/customers/:id/adjust', async () => {
      await request(app.getHttpServer())
        .post(`/loyalty/customers/${customerId}/adjust`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          loyaltyProgramId: programId,
          units: 10,
          reason: 'Cashier trying to adjust points',
        })
        .expect(403);
    });

    it('allows Owner on POST /loyalty/customers/:id/adjust and records audit provenance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/loyalty/customers/${customerId}/adjust`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          loyaltyProgramId: programId,
          units: -25,
          reason: 'Owner corrected miscredited points',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.transaction.units).toBe(-25);
      expect(res.body.transaction.origin).toBe('CLOUD');

      // Verify balance is now 100 - 25 = 75
      const balRes = await request(app.getHttpServer())
        .get(`/loyalty/customers/${customerId}/balance?program_id=${programId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(balRes.body.balanceUnits).toBe(75);
    });

    it('rejects Cashier with 403 on legacy POST /customers/:id/points/adjust', async () => {
      await request(app.getHttpServer())
        .post(`/customers/${customerId}/points/adjust`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          points_delta: 10,
          reason: 'Cashier trying legacy adjust',
        })
        .expect(403);
    });

    it('allows Owner on POST /customers/:id/points/adjust and updates ledger + projection', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${customerId}/points/adjust`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          points_delta: 25,
          loyalty_program_id: programId,
          reason: 'Owner legacy compensation',
        })
        .expect(201);

      expect(res.body.transaction.points).toBe(25);
      expect(res.body.transaction.units).toBe(25);

      // Verify projection is now 75 + 25 = 100
      const balRes = await request(app.getHttpServer())
        .get(`/loyalty/customers/${customerId}/balance?program_id=${programId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(balRes.body.balanceUnits).toBe(100);
    });
  });
});
