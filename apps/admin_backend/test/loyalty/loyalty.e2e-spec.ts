import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { LoyaltyController } from '../../src/modules/loyalty/controllers/loyalty.controller';
import { LoyaltyService } from '../../src/modules/loyalty/services/loyalty.service';
import { TicketPaidHandler } from '../../src/modules/loyalty/services/ticket-paid.handler';
import { LegacyClassificationService } from '../../src/modules/loyalty/services/legacy-classification.service';
import { LoyaltyProfitAwareService } from '../../src/modules/loyalty/services/loyalty-profit-aware.service';
import { LoyaltyProgram, LoyaltyProgramStatus } from '../../src/modules/loyalty/entities/loyalty-program.entity';
import { RewardDefinition } from '../../src/modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../src/modules/loyalty/entities/customer-loyalty-account-projection.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';
import { createIdentityJwtConfigProvider, signIdentityJwtAccessToken } from '../support/identity-jwt-test.fixture';

describe('Loyalty API (E2E / Integration)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication<App>;
  let jwtService: JwtService;

  // In-memory stores
  let dbPrograms: LoyaltyProgram[] = [];
  let dbRewards: RewardDefinition[] = [];
  let dbCustomers: Customer[] = [];

  const customerRepo = {
    findOne: jest.fn((opts?: { where?: Record<string, unknown> }) => {
      const found = dbCustomers.find((c) =>
        opts?.where
          ? Object.entries(opts.where).every(([k, v]) => (c as any)[k] === v)
          : true,
      );
      return Promise.resolve(found || null);
    }),
  };

  const programRepo = {
    find: jest.fn((opts?: { where?: Record<string, unknown> }) => {
      let results = [...dbPrograms];
      if (opts?.where) {
        results = results.filter((p) =>
          Object.entries(opts.where).every(([k, v]) => (p as any)[k] === v),
        );
      }
      return Promise.resolve(results);
    }),
    findOne: jest.fn((opts: { where: Record<string, unknown>; relations?: string[] }) => {
      const found = dbPrograms.find((p) =>
        Object.entries(opts.where).every(([k, v]) => (p as any)[k] === v),
      );
      if (found && opts.relations?.includes('rewards')) {
        (found as any).rewards = dbRewards.filter(
          (r) => r.loyalty_program_id === found.id,
        );
      }
      return Promise.resolve(found || null);
    }),
    create: jest.fn((data: Partial<LoyaltyProgram>) => ({
      id: `prog-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      config_version: 1,
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    } as LoyaltyProgram)),
    save: jest.fn((entity: LoyaltyProgram) => {
      const idx = dbPrograms.findIndex((p) => p.id === entity.id);
      if (idx >= 0) dbPrograms[idx] = entity;
      else dbPrograms.push(entity);
      return Promise.resolve(entity);
    }),
    increment: jest.fn().mockResolvedValue(undefined),
  };

  const rewardRepo = {
    find: jest.fn((opts?: { where?: Record<string, unknown>; order?: Record<string, string> }) => {
      let results = [...dbRewards];
      if (opts?.where) {
        results = results.filter((r) =>
          Object.entries(opts.where).every(([k, v]) => (r as any)[k] === v),
        );
      }
      if (opts?.order?.presentation_order === 'ASC') {
        results.sort((a, b) => a.presentation_order - b.presentation_order);
      }
      return Promise.resolve(results);
    }),
    findOne: jest.fn((opts: { where: Record<string, unknown> }) => {
      const found = dbRewards.find((r) =>
        Object.entries(opts.where).every(([k, v]) => (r as any)[k] === v),
      );
      return Promise.resolve(found || null);
    }),
    create: jest.fn((data: Partial<RewardDefinition>) => ({
      id: `rw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      config_version: 1,
      created_at: new Date(),
      updated_at: new Date(),
      ...data,
    } as RewardDefinition)),
    save: jest.fn((entity: RewardDefinition) => {
      const idx = dbRewards.findIndex((r) => r.id === entity.id);
      if (idx >= 0) dbRewards[idx] = entity;
      else dbRewards.push(entity);
      return Promise.resolve(entity);
    }),
  };

  const projectionRepo = {
    find: jest.fn().mockResolvedValue([]),
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    process.env.JWT_ISSUER = 'omnifood-admin';
    process.env.JWT_AUDIENCE = 'omnifood-pos';
    process.env.JWT_ACCESS_TTL_SECONDS = '3600';
    process.env.JWT_REFRESH_TTL_SECONDS = '604800';
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = '5';
    process.env.JWT_ALGORITHM = 'HS256';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: jwtSecret }),
      ],
      controllers: [LoyaltyController],
      providers: [
        LoyaltyService,
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        TenantInterceptor,
        createIdentityJwtConfigProvider(),
        {
          provide: getRepositoryToken(LoyaltyProgram),
          useValue: programRepo,
        },
        {
          provide: getRepositoryToken(RewardDefinition),
          useValue: rewardRepo,
        },
        {
          provide: getRepositoryToken(CustomerLoyaltyAccountProjection),
          useValue: projectionRepo,
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepo,
        },
        {
          provide: TicketPaidHandler,
          useValue: { handle: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: LegacyClassificationService,
          useValue: {
            ensureLegacyProgram: jest.fn(),
            classifyLegacyTransactions: jest.fn(),
          },
        },
        {
          provide: LoyaltyProfitAwareService,
          useValue: {
            getRewardProfitAwareMetrics: jest.fn().mockImplementation((tenantId: string, rewardId: string, asOf?: string) => {
              const reward = dbRewards.find((r) => r.id === rewardId && r.tenant_id === tenantId);
              if (!reward) throw new NotFoundException('Reward not found');
              return Promise.resolve({
                rewardId,
                programId: reward.loyalty_program_id,
                asOfUtc: asOf ?? '2026-09-02T12:00:00.000Z',
                window: {
                  startUtc: '2026-08-03T12:00:00.000Z',
                  endUtc: '2026-09-02T12:00:00.000Z',
                  label: 'LAST_30_DAYS',
                },
                retailPriceNio: { status: 'NOT_APPLICABLE', reason: 'ONLY_FOR_FREE_PRODUCT' },
                estimatedCppNio: { status: 'NOT_APPLICABLE', reason: 'ONLY_FOR_FREE_PRODUCT' },
                estimatedRewardCostNio: { status: 'AVAILABLE', value: 50 },
                qualifiedSalesNio: { status: 'AVAILABLE', value: 10000 },
                estimatedIncentiveCostInWindowNio: { status: 'AVAILABLE', value: 100 },
                effectiveIncentiveRatePct: { status: 'AVAILABLE', value: 1.0 },
              });
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    dbPrograms = [];
    dbRewards = [];
    dbCustomers = [];
    jest.clearAllMocks();
  });

  function createToken(
    tenantId: string,
    role: UserRole = UserRole.OWNER,
  ): string {
    return signIdentityJwtAccessToken(jwtService, {
      sub: 'user-001',
      email: 'user@omnifood.ni',
      tenant_id: tenantId,
      role,
    });
  }

  describe('POST /loyalty/programs', () => {
    it('creates a DRAFT program with typed earning rule', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Smash Burger Club',
          program_type: 'PRODUCT_STAMPS',
          earning_rule: {
            eligibleProductIds: ['prod-1'],
            unitsPerPurchasedUnit: 1,
          },
          eligibility_rule: {},
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Smash Burger Club');
      expect(res.body.program_type).toBe('PRODUCT_STAMPS');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.config_version).toBe(1);
    });

    it('rejects 401 without auth token', async () => {
      const res = await request(app.getHttpServer())
        .post('/loyalty/programs')
        .send({ name: 'No Auth', program_type: 'VISIT_STAMPS', earning_rule: {}, eligibility_rule: {} });

      expect(res.status).toBe(401);
    });

    it('rejects 403 for CASHIER role', async () => {
      const token = createToken('tenant-A', UserRole.CASHIER);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Cashier Try',
          program_type: 'VISIT_STAMPS',
          earning_rule: { unitsPerVisit: 1 },
          eligibility_rule: {},
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /loyalty/programs', () => {
    it('lists programs for the authenticated tenant', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      // Seed programs via mock
      dbPrograms.push({
        id: 'prog-1',
        tenant_id: 'tenant-A',
        name: 'Program A',
        program_type: 'SPEND_POINTS',
        status: 'ACTIVE',
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .get('/loyalty/programs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].tenant_id).toBe('tenant-A');
    });
  });

  describe('POST /loyalty/programs/:programId/activate', () => {
    it('activates a DRAFT program', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-to-activate',
        tenant_id: 'tenant-A',
        name: 'Activate Me',
        program_type: 'VISIT_STAMPS',
        status: 'DRAFT',
        earning_rule: { unitsPerVisit: 1 },
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs/prog-to-activate/activate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('POST /loyalty/programs/:programId/rewards', () => {
    it('creates a reward under a program', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-with-rewards',
        tenant_id: 'tenant-A',
        name: 'Parent',
        program_type: 'SPEND_POINTS',
        status: 'DRAFT',
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs/prog-with-rewards/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'C$50 Descuento',
          reward_type: 'DISCOUNT_AMOUNT',
          cost_units: 100,
          benefit_config: { amountNio: 50 },
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('C$50 Descuento');
      expect(res.body.cost_units).toBe(100);
    });
  });

  describe('Multi-tenant isolation', () => {
    it('tenant A cannot see tenant B programs', async () => {
      const tokenA = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-B',
        tenant_id: 'tenant-B',
        name: 'Tenant B Program',
        program_type: 'SPEND_POINTS',
        status: 'ACTIVE',
        earning_rule: {},
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .get('/loyalty/programs')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /loyalty/customers/:customerId/accounts', () => {
    it('returns loyalty accounts for a customer', async () => {
      dbCustomers.push({
        id: 'cust-1',
        tenant_id: 'tenant-A',
        name: 'Carlos Mendoza',
      } as Customer);
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/loyalty/customers/cust-1/accounts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PATCH /loyalty/programs/:programId (LV1.5A)', () => {
    it('updates a program and bumps config_version', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-to-update',
        tenant_id: 'tenant-A',
        name: 'Old Name',
        program_type: 'SPEND_POINTS',
        status: 'ACTIVE',
        earning_rule: { spendBlockNio: 10, pointsPerBlock: 1 },
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .patch('/loyalty/programs/prog-to-update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Smash Club',
          earning_rule: { spendBlockNio: 20, pointsPerBlock: 2 },
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Smash Club');
    });

    it('rejects 403 when CASHIER attempts to update program', async () => {
      const token = createToken('tenant-A', UserRole.CASHIER);

      const res = await request(app.getHttpServer())
        .patch('/loyalty/programs/prog-to-update')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /loyalty/programs/:programId/deactivate (LV1.5A)', () => {
    it('deactivates an ACTIVE program', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-to-deactivate',
        tenant_id: 'tenant-A',
        name: 'Deactivate Me',
        program_type: 'SPEND_POINTS',
        status: 'ACTIVE',
        earning_rule: {},
        eligibility_rule: {},
        config_version: 2,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs/prog-to-deactivate/deactivate')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('INACTIVE');
    });
  });

  describe('Rewards management E2E (LV1.5B)', () => {
    it('lists rewards by program', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-parent',
        tenant_id: 'tenant-A',
        name: 'Parent Prog',
        program_type: 'PRODUCT_STAMPS',
        status: 'ACTIVE',
        earning_rule: {},
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      dbRewards.push({
        id: 'rw-1',
        tenant_id: 'tenant-A',
        loyalty_program_id: 'prog-parent',
        name: 'Burger Gratis',
        reward_type: 'FREE_PRODUCT',
        cost_units: 10,
        benefit_config: { productId: 'prod-smash' },
        status: 'ACTIVE',
        presentation_order: 1,
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as RewardDefinition);

      const res = await request(app.getHttpServer())
        .get('/loyalty/programs/prog-parent/rewards')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Burger Gratis');
    });

    it('updates a reward', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-for-reward-update',
        tenant_id: 'tenant-A',
        name: 'Parent Prog',
        program_type: 'PRODUCT_STAMPS',
        status: 'ACTIVE',
        earning_rule: {},
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      dbRewards.push({
        id: 'rw-to-update',
        tenant_id: 'tenant-A',
        loyalty_program_id: 'prog-for-reward-update',
        name: 'Old Reward',
        reward_type: 'DISCOUNT_AMOUNT',
        cost_units: 50,
        benefit_config: { amountNio: 25 },
        status: 'ACTIVE',
        presentation_order: 1,
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as RewardDefinition);

      const res = await request(app.getHttpServer())
        .patch('/loyalty/rewards/rw-to-update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Descuento C$30 Actualizado',
          cost_units: 60,
          benefit_config: { amountNio: 30 },
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Descuento C$30 Actualizado');
      expect(res.body.cost_units).toBe(60);
    });

    it('activates and deactivates a reward', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbPrograms.push({
        id: 'prog-for-reward-toggle',
        tenant_id: 'tenant-A',
        name: 'Parent Prog',
        program_type: 'PRODUCT_STAMPS',
        status: 'ACTIVE',
        earning_rule: {},
        eligibility_rule: {},
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as LoyaltyProgram);

      dbRewards.push({
        id: 'rw-to-toggle',
        tenant_id: 'tenant-A',
        loyalty_program_id: 'prog-for-reward-toggle',
        name: 'Toggle Reward',
        reward_type: 'FREE_PRODUCT',
        cost_units: 10,
        benefit_config: { productId: 'prod-smash' },
        status: 'INACTIVE',
        presentation_order: 1,
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as RewardDefinition);

      // Activate
      const actRes = await request(app.getHttpServer())
        .post('/loyalty/rewards/rw-to-toggle/activate')
        .set('Authorization', `Bearer ${token}`);

      expect(actRes.status).toBe(201);
      expect(actRes.body.status).toBe('ACTIVE');

      // Deactivate
      const deactRes = await request(app.getHttpServer())
        .post('/loyalty/rewards/rw-to-toggle/deactivate')
        .set('Authorization', `Bearer ${token}`);

      expect(deactRes.status).toBe(201);
      expect(deactRes.body.status).toBe('INACTIVE');
    });

    it('rejects 403 when CASHIER attempts to mutate rewards', async () => {
      const token = createToken('tenant-A', UserRole.CASHIER);

      const res = await request(app.getHttpServer())
        .post('/loyalty/programs/prog-1/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Hacked Reward',
          reward_type: 'FREE_PRODUCT',
          cost_units: 1,
          benefit_config: { productId: 'prod-1' },
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /loyalty/customers/:customerId/transactions (LV1.5C)', () => {
    it('queries transactions scoped by customer and optional program', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/loyalty/customers/cust-1/transactions?program_id=prog-smash')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /loyalty/rewards/:rewardId/profit-aware (LV1.6)', () => {
    it('returns profit-aware reward metrics for OWNER with 200', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      dbRewards.push({
        id: 'rw-pa-1',
        tenant_id: 'tenant-A',
        loyalty_program_id: 'prog-1',
        name: 'Reward Profit-aware',
        reward_type: 'DISCOUNT_AMOUNT' as any,
        cost_units: 50,
        benefit_config: { amountNio: 50 },
        status: 'ACTIVE' as any,
        presentation_order: 0,
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as RewardDefinition);

      const res = await request(app.getHttpServer())
        .get('/loyalty/rewards/rw-pa-1/profit-aware?as_of=2026-09-02T12:00:00.000Z')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.rewardId).toBe('rw-pa-1');
      expect(res.body.window.label).toBe('LAST_30_DAYS');
      expect(res.body.estimatedRewardCostNio.status).toBe('AVAILABLE');
      expect(res.body.estimatedRewardCostNio.value).toBe(50);
      expect(res.body.qualifiedSalesNio.status).toBe('AVAILABLE');
      expect(res.body.qualifiedSalesNio.value).toBe(10000);
      expect(res.body.effectiveIncentiveRatePct.value).toBe(1.0);
    });

    it('rejects 403 when CASHIER attempts to view profit-aware metrics', async () => {
      const token = createToken('tenant-A', UserRole.CASHIER);

      const res = await request(app.getHttpServer())
        .get('/loyalty/rewards/rw-pa-1/profit-aware')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 when reward does not exist for tenant', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/loyalty/rewards/non-existent/profit-aware')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
