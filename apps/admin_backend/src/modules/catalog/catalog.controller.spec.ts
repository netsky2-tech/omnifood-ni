import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CATALOG_TYPE } from './catalog-type';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../identity/guards/auth.guard';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../identity/entities/user.entity';

describe('CatalogController', () => {
  const jwtSecret = 'test-jwt-secret';
  let controller: CatalogController;
  let service: jest.Mocked<CatalogService>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      seedDefaults: jest.fn(),
    } as unknown as jest.Mocked<CatalogService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [CatalogController],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        { provide: CatalogService, useValue: service },
        { provide: ConfigService, useValue: { get: () => jwtSecret } },
      ],
    }).compile();

    controller = module.get(CatalogController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET :type delegates to service.list with the resolved type and tenant', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('UOM', undefined, 'tenant-A');
    expect(service.list).toHaveBeenCalledWith(
      CATALOG_TYPE.UOM,
      'tenant-A',
      false,
    );
  });

  it('GET :type?includeInactive=true forwards the flag', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('UOM', 'true', 'tenant-A');
    expect(service.list).toHaveBeenCalledWith(
      CATALOG_TYPE.UOM,
      'tenant-A',
      true,
    );
  });

  it('GET :type fails closed when tenant context is missing', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.list('UOM', undefined, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('POST :type delegates to service.create', async () => {
    const dto = { code: 'kg', name: 'Kilogramo' };
    service.create.mockResolvedValue({ id: 'x' } as never);
    await controller.create('UOM', dto, 'tenant-A');
    expect(service.create).toHaveBeenCalledWith(
      CATALOG_TYPE.UOM,
      'tenant-A',
      dto,
    );
  });

  it('PATCH :type/:id delegates to service.update', async () => {
    service.update.mockResolvedValue({ id: 'x' } as never);
    await controller.update(
      'SALES_PRODUCT_TYPE',
      'x',
      { name: 'Preparado' },
      'tenant-A',
    );
    expect(service.update).toHaveBeenCalledWith(
      CATALOG_TYPE.SALES_PRODUCT_TYPE,
      'x',
      'tenant-A',
      { name: 'Preparado' },
    );
  });

  it('DELETE :type/:id soft-deactivates', async () => {
    await controller.deactivate('UOM', 'x', 'tenant-A');
    expect(service.deactivate).toHaveBeenCalledWith(
      CATALOG_TYPE.UOM,
      'x',
      'tenant-A',
    );
  });

  it('POST seed-defaults delegates to service.seedDefaults', async () => {
    service.seedDefaults.mockResolvedValue(42);
    const result = await controller.seedDefaults('tenant-A');
    expect(service.seedDefaults).toHaveBeenCalledWith('tenant-A');
    expect(result).toEqual({ inserted: 42 });
  });
});

describe('CatalogController HTTP guards and route precedence', () => {
  const jwtSecret = 'test-jwt-secret';
  let app: INestApplication;
  let service: jest.Mocked<CatalogService>;

  beforeAll(async () => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'created' }),
      update: jest.fn(),
      deactivate: jest.fn(),
      seedDefaults: jest.fn().mockResolvedValue(42),
    } as unknown as jest.Mocked<CatalogService>;

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: jwtSecret })],
      controllers: [CatalogController],
      providers: [
        Reflector,
        RolesGuard,
        AuthGuard,
        { provide: CatalogService, useValue: service },
        { provide: ConfigService, useValue: { get: () => jwtSecret } },
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
    service.create.mockResolvedValue({ id: 'created' } as never);
    service.seedDefaults.mockResolvedValue(42);
  });

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const signToken = (payload: Record<string, string>) =>
    app.get(JwtService).sign({ sub: 'user-1', ...payload });

  it('returns 401 without authentication', async () => {
    await request(getHttpServer()).get('/catalogs/UOM').expect(401);
  });

  it('returns 401 when authenticated payload has no tenant', async () => {
    await request(getHttpServer())
      .get('/catalogs/UOM')
      .set('Authorization', `Bearer ${signToken({ role: UserRole.MANAGER })}`)
      .expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('returns 403 for insufficient role', async () => {
    await request(getHttpServer())
      .get('/catalogs/UOM')
      .set(
        'Authorization',
        `Bearer ${signToken({ role: UserRole.CASHIER, tenant_id: 'tenant-A' })}`,
      )
      .expect(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('routes POST seed-defaults to the static handler, not POST :type', async () => {
    await request(getHttpServer())
      .post('/catalogs/seed-defaults')
      .set(
        'Authorization',
        `Bearer ${signToken({ role: UserRole.MANAGER, tenant_id: 'tenant-A' })}`,
      )
      .expect(201)
      .expect({ inserted: 42 });

    expect(service.seedDefaults).toHaveBeenCalledWith('tenant-A');
    expect(service.create).not.toHaveBeenCalled();
  });
});
