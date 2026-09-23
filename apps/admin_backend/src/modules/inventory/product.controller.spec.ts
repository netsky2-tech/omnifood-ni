import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product, ProductType } from './entities/product.entity';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../identity/guards/authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from '../identity/services/current-user-authorization.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../identity/entities/user.entity';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../identity/config/identity-jwt.config';

const createIdentityJwtConfig = (jwtEnvironment: {
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_ACCESS_TTL_SECONDS: string;
  JWT_REFRESH_TTL_SECONDS: string;
  JWT_CLOCK_TOLERANCE_SECONDS: string;
  JWT_ALGORITHM: 'HS256';
}): IdentityJwtConfig => ({
  secret: jwtEnvironment.JWT_SECRET,
  issuer: jwtEnvironment.JWT_ISSUER,
  audience: jwtEnvironment.JWT_AUDIENCE,
  accessTokenTtlSeconds: Number(jwtEnvironment.JWT_ACCESS_TTL_SECONDS),
  refreshTokenTtlSeconds: Number(jwtEnvironment.JWT_REFRESH_TTL_SECONDS),
  clockToleranceSeconds: Number(jwtEnvironment.JWT_CLOCK_TOLERANCE_SECONDS),
  algorithm: jwtEnvironment.JWT_ALGORITHM,
});

describe('ProductController', () => {
  const jwtEnvironment = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  } as const;
  let controller: ProductController;
  let service: jest.Mocked<ProductService>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      listPaginated: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<ProductService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM,
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
      controllers: [ProductController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: ProductService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: createIdentityJwtConfig(jwtEnvironment),
        },
      ],
    }).compile();

    controller = module.get(ProductController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('requires authoritative authorization on writes but excludes GET endpoints', () => {
    const handler = (name: string): object => {
      const value: unknown = Object.getOwnPropertyDescriptor(
        ProductController.prototype,
        name,
      )?.value;
      if (typeof value !== 'function') {
        throw new Error(`Missing ${name} handler`);
      }
      return value;
    };

    for (const name of ['create', 'update', 'deactivate']) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(name))).toEqual([
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
      ]);
    }

    for (const name of ['list', 'findOne']) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler(name))).toEqual([
        AuthGuard,
        RolesGuard,
      ]);
    }
  });

  it('GET /products delegates to service.list with tenant', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(undefined, undefined, 'tenant-A');
    expect(service.list.mock.calls[0]).toEqual(['tenant-A', undefined, false]);
  });

  it('GET /products?productType=SIMPLE forwards the filter', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('SIMPLE', undefined, 'tenant-A');
    expect(service.list.mock.calls[0]).toEqual([
      'tenant-A',
      ProductType.SIMPLE,
      false,
    ]);
  });

  it('GET /products?includeInactive=true forwards the flag', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(undefined, 'true', 'tenant-A');
    expect(service.list.mock.calls[0]).toEqual(['tenant-A', undefined, true]);
  });

  it('GET /products fails closed when tenant context is missing', async () => {
    service.list.mockResolvedValue([]);
    await expect(
      controller.list(undefined, undefined, undefined),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.list.mock.calls).toHaveLength(0);
  });

  it('GET /products/:id delegates to service.findOne', async () => {
    service.findOne.mockResolvedValue({ id: 'p1' } as never);
    await controller.findOne('p1', 'tenant-A');
    expect(service.findOne.mock.calls[0]).toEqual(['p1', 'tenant-A']);
  });

  it('POST /products delegates to service.create', async () => {
    const dto = {
      name: 'Taza de Capuccino',
      uom: 'un',
      product_type: ProductType.COMPOUND,
    };
    service.create.mockResolvedValue({ id: 'p1' } as never);
    await controller.create(dto, 'tenant-A');
    expect(service.create.mock.calls[0]).toEqual(['tenant-A', dto]);
  });

  it('PATCH /products/:id delegates to service.update', async () => {
    service.update.mockResolvedValue({ id: 'p1' } as never);
    await controller.update('p1', { name: 'Updated' }, 'tenant-A');
    expect(service.update.mock.calls[0]).toEqual([
      'p1',
      'tenant-A',
      { name: 'Updated' },
    ]);
  });

  it('DELETE /products/:id soft-deactivates', async () => {
    await controller.deactivate('p1', 'tenant-A');
    expect(service.deactivate.mock.calls[0]).toEqual(['p1', 'tenant-A']);
  });
});

describe('ProductController HTTP guards and route precedence', () => {
  const jwtEnvironment = {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
    JWT_ISSUER: 'omnifood-admin-test',
    JWT_AUDIENCE: 'omnifood-pos-test',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  } as const;
  let app: INestApplication;
  let service: jest.Mocked<ProductService>;

  beforeAll(async () => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      listPaginated: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
      create: jest.fn().mockResolvedValue({ id: 'created' }),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<ProductService>;

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: jwtEnvironment.JWT_SECRET,
          signOptions: {
            algorithm: jwtEnvironment.JWT_ALGORITHM,
            issuer: jwtEnvironment.JWT_ISSUER,
            audience: jwtEnvironment.JWT_AUDIENCE,
          },
        }),
      ],
      controllers: [ProductController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: ProductService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: keyof typeof jwtEnvironment) => jwtEnvironment[key],
          },
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: createIdentityJwtConfig(jwtEnvironment),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.list.mockResolvedValue([]);
    service.findOne.mockResolvedValue({ id: 'p1' } as never);
    service.create.mockResolvedValue({ id: 'created' } as never);
  });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const signToken = (payload: Record<string, unknown>) =>
    app.get(JwtService).sign({
      sub: 'user-1',
      email: 'manager@example.com',
      is_active: true,
      token_type: 'access',
      security_version: 1,
      ...payload,
    });

  it('returns 401 without authentication', async () => {
    await request(getHttpServer()).get('/products').expect(401);
  });

  it('returns 401 when authenticated payload has no tenant', async () => {
    await request(getHttpServer())
      .get('/products')
      .set('Authorization', `Bearer ${signToken({ role: UserRole.MANAGER })}`)
      .expect(401);
    expect(service.list.mock.calls).toHaveLength(0);
  });

  it('returns 403 for insufficient role', async () => {
    await request(getHttpServer())
      .get('/products')
      .set(
        'Authorization',
        `Bearer ${signToken({ role: UserRole.CASHIER, tenant_id: 'tenant-A' })}`,
      )
      .expect(403);
    expect(service.list.mock.calls).toHaveLength(0);
  });

  it('GET /products with valid auth returns 200', async () => {
    await request(getHttpServer())
      .get('/products')
      .set(
        'Authorization',
        `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-A' })}`,
      )
      .expect(200)
      .expect([]);
  });

  it('POST /products with valid auth returns 201', async () => {
    await request(getHttpServer())
      .post('/products')
      .set(
        'Authorization',
        `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-A' })}`,
      )
      .send({
        name: 'Test Product',
        uom: 'un',
        product_type: 'SIMPLE',
      })
      .expect(201)
      // create() now serializes at the response boundary, so the body carries
      // the coerced numeric fields on top of the mocked entity.
      .expect({ id: 'created', stock: 0, averageCost: 0, sellPrice: 0, tax_rate: 0 });
  });

  describe('numeric response contract (driver returns strings for numeric)', () => {
    // The untyped override bag is deliberate: the driver hands back strings
    // where the Product entity declares numbers.
    const makeProductEntity = (over: Record<string, unknown> = {}): Product =>
      ({
        id: 'p1',
        tenant_id: 'tenant-A',
        name: 'Tacos al Pastor',
        uom: 'UN',
        product_type: ProductType.SIMPLE,
        category_code: null,
        warehouse_id: null,
        is_perishable: false,
        stock: '0.0000',
        averageCost: '0.00',
        sellPrice: '50.00',
        tax_rate: '0.1500',
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        ...over,
      }) as unknown as Product;

    it('GET /products?page=1 returns strict JSON numbers in the paginated branch', async () => {
      service.listPaginated.mockResolvedValue({
        data: [makeProductEntity()],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      } as never);

      const res = await request(getHttpServer())
        .get('/products?page=1')
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-A' })}`,
        )
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sellPrice).toBe(50);
      expect(typeof res.body.data[0].sellPrice).toBe('number');
      expect(res.body.data[0].stock).toBe(0);
      expect(typeof res.body.data[0].stock).toBe('number');
      expect(res.body.data[0].averageCost).toBe(0);
      expect(typeof res.body.data[0].averageCost).toBe('number');
      expect(res.body.data[0].tax_rate).toBe(0.15);
      expect(typeof res.body.data[0].tax_rate).toBe('number');
      // The string the driver returned must not leak over the wire.
      expect(JSON.parse(JSON.stringify(res.body.data[0])).sellPrice).toBe(50);
    });

    it('GET /products returns strict JSON numbers in the plain list branch', async () => {
      service.list.mockResolvedValue([makeProductEntity()]);

      const res = await request(getHttpServer())
        .get('/products')
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-A' })}`,
        )
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].sellPrice).toBe(50);
      expect(typeof res.body[0].sellPrice).toBe('number');
      expect(res.body[0].stock).toBe(0);
      expect(typeof res.body[0].stock).toBe('number');
      expect(JSON.parse(JSON.stringify(res.body[0])).averageCost).toBe(0);
    });

    it('GET /products/:id returns strict JSON numbers', async () => {
      service.findOne.mockResolvedValue(makeProductEntity());

      const res = await request(getHttpServer())
        .get('/products/p1')
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-A' })}`,
        )
        .expect(200);

      expect(res.body.id).toBe('p1');
      expect(res.body.sellPrice).toBe(50);
      expect(typeof res.body.sellPrice).toBe('number');
      expect(res.body.stock).toBe(0);
      expect(typeof res.body.stock).toBe('number');
      expect(res.body.tax_rate).toBe(0.15);
      expect(typeof res.body.tax_rate).toBe('number');
      expect(JSON.parse(JSON.stringify(res.body)).sellPrice).toBe(50);
    });
  });
});
