import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { ProductController } from '../../src/modules/inventory/product.controller';
import { ProductService } from '../../src/modules/inventory/product.service';
import { ProductType } from '../../src/modules/inventory/entities/product.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const PRODUCTS_API = '/products';

describe('ProductController E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let productService: jest.Mocked<ProductService>;

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    tenant_id: 'tenant-e2e',
    name: 'Taza de Capuccino',
    uom: 'un',
    product_type: ProductType.COMPOUND,
    category_code: 'BEBIDA_CALIENTE',
    warehouse_id: null,
    is_perishable: false,
    stock: 0,
    averageCost: 25,
    sellPrice: 45,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeAll(async () => {
    productService = {
      list: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<ProductService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
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
        { provide: ProductService, useValue: productService },
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const signToken = (overrides: Record<string, unknown> = {}) =>
    signIdentityJwtAccessToken(jwtService, overrides);

  // ── 401 / 403 guard tests ────────────────────────────────────────────

  describe('authentication & authorization', () => {
    it('GET /products returns 401 without token', async () => {
      await request(app.getHttpServer()).get(PRODUCTS_API).expect(401);
    });

    it('GET /products returns 403 for CASHIER role', async () => {
      await request(app.getHttpServer())
        .get(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.CASHIER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(403);
    });

    it('POST /products returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .send({ name: 'Test', uom: 'un', product_type: 'SIMPLE' })
        .expect(401);
    });

    it('POST /products returns 403 for CASHIER role', async () => {
      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.CASHIER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ name: 'Test', uom: 'un', product_type: 'SIMPLE' })
        .expect(403);
    });

    it('PATCH /products/:id returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`${PRODUCTS_API}/p1`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('DELETE /products/:id returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`${PRODUCTS_API}/p1`)
        .expect(401);
    });
  });

  // ── GET /products ────────────────────────────────────────────────────

  describe('GET /products', () => {
    it('returns product list for OWNER', async () => {
      const products = [
        makeProduct(),
        makeProduct({ id: 'prod-2', name: 'Gaseosa' }),
      ];
      productService.list.mockResolvedValue(products as any);

      const res = await request(app.getHttpServer())
        .get(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Taza de Capuccino');
      expect(productService.list).toHaveBeenCalledWith(
        'tenant-e2e',
        undefined,
        false,
      );
    });

    it('forwards productType filter', async () => {
      productService.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`${PRODUCTS_API}?productType=COMPOUND`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(productService.list).toHaveBeenCalledWith(
        'tenant-e2e',
        ProductType.COMPOUND,
        false,
      );
    });

    it('forwards includeInactive=true', async () => {
      productService.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`${PRODUCTS_API}?includeInactive=true`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(productService.list).toHaveBeenCalledWith(
        'tenant-e2e',
        undefined,
        true,
      );
    });

    it('ignores unknown productType gracefully (passes undefined)', async () => {
      productService.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`${PRODUCTS_API}?productType=INVALID`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(productService.list).toHaveBeenCalledWith(
        'tenant-e2e',
        undefined,
        false,
      );
    });
  });

  // ── GET /products/:id ────────────────────────────────────────────────

  describe('GET /products/:id', () => {
    it('returns a product by id', async () => {
      const product = makeProduct({ id: 'prod-42' });
      productService.findOne.mockResolvedValue(product as any);

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_API}/prod-42`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(res.body.id).toBe('prod-42');
      expect(productService.findOne).toHaveBeenCalledWith(
        'prod-42',
        'tenant-e2e',
      );
    });

    it('returns 404 when product not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      productService.findOne.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .get(`${PRODUCTS_API}/nonexistent`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(404);
    });
  });

  // ── POST /products ───────────────────────────────────────────────────

  describe('POST /products', () => {
    it('creates a SIMPLE product', async () => {
      const created = makeProduct({ product_type: ProductType.SIMPLE });
      productService.create.mockResolvedValue(created as any);

      const res = await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({
          name: 'Lata de Gaseosa',
          uom: 'un',
          product_type: 'SIMPLE',
          sellPrice: 25,
        })
        .expect(201);

      expect(res.body.name).toBe('Taza de Capuccino');
      expect(productService.create).toHaveBeenCalledWith(
        'tenant-e2e',
        expect.objectContaining({
          name: 'Lata de Gaseosa',
          product_type: 'SIMPLE',
        }),
      );
    });

    it('creates a COMPOUND product', async () => {
      const created = makeProduct({ product_type: ProductType.COMPOUND });
      productService.create.mockResolvedValue(created as any);

      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({
          name: 'Hamburguesa',
          uom: 'un',
          product_type: 'COMPOUND',
          sellPrice: 120,
        })
        .expect(201);

      expect(productService.create).toHaveBeenCalledWith(
        'tenant-e2e',
        expect.objectContaining({
          product_type: 'COMPOUND',
        }),
      );
    });

    it('creates a VARIANT_PARENT product', async () => {
      const created = makeProduct({ product_type: ProductType.VARIANT_PARENT });
      productService.create.mockResolvedValue(created as any);

      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({
          name: 'Camisa Oxford',
          uom: 'un',
          product_type: 'VARIANT_PARENT',
          sellPrice: 350,
        })
        .expect(201);

      expect(productService.create).toHaveBeenCalledWith(
        'tenant-e2e',
        expect.objectContaining({
          product_type: 'VARIANT_PARENT',
        }),
      );
    });

    it('returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ uom: 'un', product_type: 'SIMPLE' })
        .expect(400);
    });

    it('returns 400 when product_type is invalid', async () => {
      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ name: 'Test', uom: 'un', product_type: 'INVALID' })
        .expect(400);
    });

    it('returns 400 when uom is missing', async () => {
      await request(app.getHttpServer())
        .post(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ name: 'Test', product_type: 'SIMPLE' })
        .expect(400);
    });
  });

  // ── PATCH /products/:id ──────────────────────────────────────────────

  describe('PATCH /products/:id', () => {
    it('updates product name', async () => {
      const updated = makeProduct({ name: 'Updated Name' });
      productService.update.mockResolvedValue(updated as any);

      const res = await request(app.getHttpServer())
        .patch(`${PRODUCTS_API}/prod-1`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
      expect(productService.update).toHaveBeenCalledWith(
        'prod-1',
        'tenant-e2e',
        { name: 'Updated Name' },
      );
    });

    it('returns 404 when product not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      productService.update.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .patch(`${PRODUCTS_API}/nonexistent`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .send({ name: 'X' })
        .expect(404);
    });
  });

  // ── DELETE /products/:id ─────────────────────────────────────────────

  describe('DELETE /products/:id', () => {
    it('soft-deactivates product', async () => {
      productService.deactivate.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`${PRODUCTS_API}/prod-1`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(200);

      expect(res.body).toEqual({ id: 'prod-1', deactivated: true });
      expect(productService.deactivate).toHaveBeenCalledWith(
        'prod-1',
        'tenant-e2e',
      );
    });

    it('returns 404 when product not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      productService.deactivate.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer())
        .delete(`${PRODUCTS_API}/nonexistent`)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.OWNER, tenant_id: 'tenant-e2e' })}`,
        )
        .expect(404);
    });
  });

  // ── Tenant isolation in E2E ──────────────────────────────────────────

  describe('tenant isolation', () => {
    it('passes tenant from JWT to service layer', async () => {
      productService.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(PRODUCTS_API)
        .set(
          'Authorization',
          `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-X' })}`,
        )
        .expect(200);

      expect(productService.list).toHaveBeenCalledWith(
        'tenant-X',
        undefined,
        false,
      );
    });
  });
});
