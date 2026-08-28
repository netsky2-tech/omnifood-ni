import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PromotionsController } from '../../src/modules/promotions/controllers/promotions.controller';
import { PromotionsService } from '../../src/modules/promotions/services/promotions.service';
import { Promotion, PromotionType } from '../../src/modules/promotions/entities/promotion.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

describe('Promotions Module (E2E / Integration)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication<App>;
  let jwtService: JwtService;

  let dbPromotions: Promotion[] = [];

  const promotionRepo = {
    find: jest.fn((options: { where: { tenant_id?: string; is_active?: boolean } }) => {
      const filtered = dbPromotions.filter(
        (p) =>
          (!options.where.tenant_id || p.tenant_id === options.where.tenant_id) &&
          (options.where.is_active === undefined || p.is_active === options.where.is_active),
      );
      return Promise.resolve(filtered);
    }),
    findOne: jest.fn((options: { where: { id?: string; tenant_id?: string } }) => {
      const found = dbPromotions.find(
        (p) =>
          (!options.where.id || p.id === options.where.id) &&
          (!options.where.tenant_id || p.tenant_id === options.where.tenant_id),
      );
      return Promise.resolve(found || null);
    }),
    create: jest.fn((data: Partial<Promotion>) => ({
      id: `promo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date(),
      updated_at: new Date(),
      priority: 0,
      is_stackable: true,
      is_active: true,
      ...data,
    } as Promotion)),
    save: jest.fn((entity: Promotion) => {
      const idx = dbPromotions.findIndex((p) => p.id === entity.id);
      if (idx >= 0) {
        dbPromotions[idx] = { ...entity, updated_at: new Date() };
      } else {
        dbPromotions.push({ ...entity });
      }
      return Promise.resolve(entity);
    }),
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
      controllers: [PromotionsController],
      providers: [
        PromotionsService,
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        TenantInterceptor,
        {
          provide: getRepositoryToken(Promotion),
          useValue: promotionRepo,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    dbPromotions = [];
    jest.clearAllMocks();
  });

  function createToken(tenantId: string, role: UserRole = UserRole.OWNER): string {
    return jwtService.sign(
      {
        sub: 'user-001',
        email: 'user@omnifood.ni',
        tenant_id: tenantId,
        role,
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      },
      {
        secret: jwtSecret,
        issuer: 'omnifood-admin',
        audience: 'omnifood-pos',
        expiresIn: '1h',
      },
    );
  }

  describe('POST /promotions', () => {
    it('crea promoción exitosamente para el tenant', async () => {
      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Happy Hour Cervezas 2x1',
          type: PromotionType.BUY_X_GET_Y_FREE,
          target_product_id: 'prod-toña',
          buy_quantity: 1,
          get_quantity: 1,
          days_of_week: ['5', '6'],
          start_time: '18:00',
          end_time: '21:00',
          priority: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Happy Hour Cervezas 2x1');
      expect(res.body.tenant_id).toBe('tenant-A');
      expect(res.body.priority).toBe(10);
    });

    it('rechaza sin token JWT con 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/promotions')
        .send({ name: 'Promo Anónima', type: PromotionType.BUY_X_GET_Y_FREE });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /promotions & Multi-Tenant Isolation', () => {
    it('retorna únicamente las promociones del tenant autenticado', async () => {
      dbPromotions.push(
        {
          id: 'p-A',
          tenant_id: 'tenant-A',
          name: 'Promo de Tenant A',
          type: PromotionType.PERCENTAGE_DISCOUNT,
          discount_value: 10,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as Promotion,
        {
          id: 'p-B',
          tenant_id: 'tenant-B',
          name: 'Promo de Tenant B',
          type: PromotionType.FIXED_DISCOUNT,
          discount_value: 50,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as Promotion,
      );

      const tokenA = createToken('tenant-A');
      const resA = await request(app.getHttpServer())
        .get('/promotions')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.length).toBe(1);
      expect(resA.body[0].name).toBe('Promo de Tenant A');
    });
  });

  describe('PATCH & DELETE /promotions/:id', () => {
    it('actualiza datos de promoción', async () => {
      const promo = {
        id: 'p-edit',
        tenant_id: 'tenant-A',
        name: 'Nombre Original',
        type: PromotionType.PERCENTAGE_DISCOUNT,
        discount_value: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Promotion;
      dbPromotions.push(promo);

      const token = createToken('tenant-A', UserRole.MANAGER);
      const res = await request(app.getHttpServer())
        .patch('/promotions/p-edit')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Nombre Actualizado', discount_value: 25 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Nombre Actualizado');
      expect(res.body.discount_value).toBe(25);
    });

    it('soft-deletes la promoción estableciendo is_active = false', async () => {
      const promo = {
        id: 'p-del',
        tenant_id: 'tenant-A',
        name: 'Promo para Borrar',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Promotion;
      dbPromotions.push(promo);

      const token = createToken('tenant-A', UserRole.OWNER);
      const res = await request(app.getHttpServer())
        .delete('/promotions/p-del')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = dbPromotions.find((p) => p.id === 'p-del');
      expect(deleted?.is_active).toBe(false);
    });
  });
});
