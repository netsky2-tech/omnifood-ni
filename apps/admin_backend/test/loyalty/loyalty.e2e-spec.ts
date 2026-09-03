import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { LoyaltyController } from '../../src/modules/loyalty/controllers/loyalty.controller';
import { LoyaltyService } from '../../src/modules/loyalty/services/loyalty.service';
import { LoyaltyProgram, LoyaltyProgramStatus } from '../../src/modules/loyalty/entities/loyalty-program.entity';
import { RewardDefinition } from '../../src/modules/loyalty/entities/reward-definition.entity';
import { CustomerLoyaltyAccountProjection } from '../../src/modules/loyalty/entities/customer-loyalty-account-projection.entity';
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
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/loyalty/customers/cust-1/accounts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
