import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { CustomersController } from '../../src/modules/customers/controllers/customers.controller';
import { CustomersService } from '../../src/modules/customers/services/customers.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { CustomerPointTransaction } from '../../src/modules/customers/entities/customer-point-transaction.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';
import { createIdentityJwtConfigProvider } from '../support/identity-jwt-test.fixture';

describe('Customers Module (E2E / Integration)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication<App>;
  let jwtService: JwtService;

  let dbCustomers: Customer[] = [];

  const customerRepo = {
    createQueryBuilder: jest.fn(() => {
      let currentTenant = '';
      let searchStr = '';
      let limitVal = 20;
      let offsetVal = 0;
      let statusFilter: 'all' | 'active' | 'inactive' = 'all';
      let typeFilter: string | undefined = undefined;

      const qb = {
        where: jest.fn((clause: string, params: { tenantId: string }) => {
          currentTenant = params.tenantId;
          return qb;
        }),
        andWhere: jest.fn(
          (clause: string, params?: { s?: string; customerType?: string }) => {
            if (clause === 'c.is_active = false') {
              statusFilter = 'inactive';
            } else if (clause === 'c.is_active = true') {
              statusFilter = 'active';
            }
            if (params?.customerType) {
              typeFilter = params.customerType;
            }
            if (params?.s) {
              searchStr = params.s.replace(/%/g, '').toLowerCase();
            }
            return qb;
          },
        ),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn((limit: number) => {
          limitVal = limit;
          return qb;
        }),
        skip: jest.fn((offset: number) => {
          offsetVal = offset;
          return qb;
        }),
        getManyAndCount: jest.fn(() => {
          let filtered = dbCustomers.filter(
            (c) => c.tenant_id === currentTenant,
          );
          if (statusFilter === 'active') {
            filtered = filtered.filter((c) => c.is_active);
          } else if (statusFilter === 'inactive') {
            filtered = filtered.filter((c) => !c.is_active);
          }
          if (typeFilter) {
            filtered = filtered.filter((c) => c.customer_type === typeFilter);
          }
          if (searchStr) {
            filtered = filtered.filter(
              (c) =>
                c.name.toLowerCase().includes(searchStr) ||
                (c.tax_id?.toLowerCase().includes(searchStr) ?? false) ||
                (c.phone?.toLowerCase().includes(searchStr) ?? false) ||
                (c.email?.toLowerCase().includes(searchStr) ?? false),
            );
          }
          const total = filtered.length;
          const data = filtered.slice(offsetVal, offsetVal + limitVal);
          return Promise.resolve([data, total]);
        }),
      };
      return qb;
    }),
    findOne: jest.fn(
      (options: { where: { id?: string; tenant_id?: string } }) => {
        const found = dbCustomers.find(
          (c) =>
            (!options.where.id || c.id === options.where.id) &&
            (!options.where.tenant_id ||
              c.tenant_id === options.where.tenant_id),
        );
        return Promise.resolve(found || null);
      },
    ),
    create: jest.fn(
      (data: Partial<Customer>) =>
        ({
          id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          created_at: new Date(),
          updated_at: new Date(),
          points_balance: 0.0,
          is_active: true,
          ...data,
        }) as Customer,
    ),
    save: jest.fn((entity: Customer) => {
      const idx = dbCustomers.findIndex((c) => c.id === entity.id);
      if (idx >= 0) {
        dbCustomers[idx] = { ...entity, updated_at: new Date() };
      } else {
        dbCustomers.push({ ...entity });
      }
      return Promise.resolve(entity);
    }),
  };

  // Issue #512 slice 4: the service resolves its repositories from the
  // tenant-bound transaction manager; route the same mock repositories
  // through it so binding is transparent to these in-memory fixtures.
  const inlinePointTxRepo = { find: jest.fn(), save: jest.fn() };
  const manager: Record<string, unknown> = {
    getRepository: (entity: unknown) =>
      entity === Customer
        ? customerRepo
        : entity === CustomerPointTransaction
          ? inlinePointTxRepo
          : undefined,
    query: jest.fn(),
  };
  manager['transaction'] = (cb: (m: unknown) => Promise<unknown>) =>
    cb({ getRepository: manager.getRepository, query: manager.query });
  const mockDataSource = {
    transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
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
      controllers: [CustomersController],
      providers: [
        CustomersService,
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        createIdentityJwtConfigProvider(),
        TenantInterceptor,
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepo,
        },
        {
          provide: getRepositoryToken(CustomerPointTransaction),
          useValue: inlinePointTxRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    jwtService = moduleRef.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    dbCustomers = [];
    jest.clearAllMocks();
  });

  function createToken(
    tenantId: string,
    role: UserRole = UserRole.OWNER,
  ): string {
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

  describe('POST /customers', () => {
    it('crea cliente exitosamente con tenantId inyectado', async () => {
      const token = createToken('tenant-A', UserRole.CASHIER);

      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Comercial Monge S.A.',
          tax_id: 'J0310000000123',
          phone: '2222-3333',
          email: 'contacto@monge.com.ni',
          address: 'Managua, Plaza Inter',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Comercial Monge S.A.');
      expect(res.body.tenant_id).toBe('tenant-A');
      expect(res.body.points_balance).toBe(0);
    });

    it('rechaza con 401 si no se envía token de autenticación', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .send({ name: 'Cliente Anónimo' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /customers & Multi-Tenant Segregation', () => {
    it('filtra clientes respetando aislamiento estricto por tenant_id', async () => {
      // Seed Tenant A customer
      dbCustomers.push({
        id: 'cust-A1',
        tenant_id: 'tenant-A',
        name: 'Cliente de Tenant A',
        tax_id: '001-120590-0001A',
        phone: '8888-0001',
        points_balance: 50,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer);

      // Seed Tenant B customer
      dbCustomers.push({
        id: 'cust-B1',
        tenant_id: 'tenant-B',
        name: 'Cliente de Tenant B',
        tax_id: '281-240885-0002B',
        phone: '8888-0002',
        points_balance: 100,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer);

      const tokenA = createToken('tenant-A');
      const resA = await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.total).toBe(1);
      expect(resA.body.data[0].name).toBe('Cliente de Tenant A');
      expect(
        resA.body.data.some((c: Customer) => c.tenant_id === 'tenant-B'),
      ).toBe(false);
    });

    it('búsqueda predictiva con query param ?search= incluyendo email', async () => {
      dbCustomers.push(
        {
          id: 'c-1',
          tenant_id: 'tenant-A',
          name: 'Supermercado La Colonia',
          tax_id: 'J0310000000999',
          phone: '2277-0000',
          email: 'compras@lacolonia.com.ni',
          customer_type: 'EMPRESA',
          points_balance: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as Customer,
        {
          id: 'c-2',
          tenant_id: 'tenant-A',
          name: 'Farmacia Saba',
          tax_id: 'J0310000000888',
          phone: '2288-0000',
          email: 'contacto@saba.com.ni',
          customer_type: 'EMPRESA',
          points_balance: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as Customer,
      );

      const token = createToken('tenant-A');
      const res = await request(app.getHttpServer())
        .get('/customers?search=lacolonia.com.ni')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].name).toBe('Supermercado La Colonia');
    });

    it('filtra clientes por customer_type y por status (all / inactive)', async () => {
      dbCustomers.push(
        {
          id: 'c-empresa-activa',
          tenant_id: 'tenant-A',
          name: 'Empresa Activa',
          customer_type: 'EMPRESA',
          is_active: true,
        } as Customer,
        {
          id: 'c-persona-activa',
          tenant_id: 'tenant-A',
          name: 'Persona Activa',
          customer_type: 'PERSONA',
          is_active: true,
        } as Customer,
        {
          id: 'c-empresa-inactiva',
          tenant_id: 'tenant-A',
          name: 'Empresa Inactiva',
          customer_type: 'EMPRESA',
          is_active: false,
        } as Customer,
      );

      const token = createToken('tenant-A');

      // Filter by customer_type EMPRESA (defaults to active)
      const resType = await request(app.getHttpServer())
        .get('/customers?customer_type=EMPRESA')
        .set('Authorization', `Bearer ${token}`);
      expect(resType.status).toBe(200);
      expect(resType.body.total).toBe(1);
      expect(resType.body.data[0].name).toBe('Empresa Activa');

      // Filter by status=inactive
      const resInactive = await request(app.getHttpServer())
        .get('/customers?status=inactive')
        .set('Authorization', `Bearer ${token}`);
      expect(resInactive.status).toBe(200);
      expect(resInactive.body.total).toBe(1);
      expect(resInactive.body.data[0].name).toBe('Empresa Inactiva');

      // Filter by status=all
      const resAll = await request(app.getHttpServer())
        .get('/customers?status=all')
        .set('Authorization', `Bearer ${token}`);
      expect(resAll.status).toBe(200);
      expect(resAll.body.total).toBe(3);
    });
  });

  describe('PATCH & DELETE /customers/:id', () => {
    it('actualiza datos de cliente incluyendo customer_type y reactivación', async () => {
      const customer = {
        id: 'c-edit',
        tenant_id: 'tenant-A',
        name: 'Nombre Original',
        phone: '8000-0000',
        customer_type: 'PERSONA',
        points_balance: 0,
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer;
      dbCustomers.push(customer);

      const token = createToken('tenant-A', UserRole.MANAGER);
      const res = await request(app.getHttpServer())
        .patch('/customers/c-edit')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Empresa Modificada',
          phone: '8999-9999',
          customer_type: 'EMPRESA',
          is_active: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Empresa Modificada');
      expect(res.body.phone).toBe('8999-9999');
      expect(res.body.customer_type).toBe('EMPRESA');
      expect(res.body.is_active).toBe(true);
    });

    it('elimina lógicamente el cliente (soft-delete is_active = false)', async () => {
      const customer = {
        id: 'c-del',
        tenant_id: 'tenant-A',
        name: 'Cliente para borrar',
        points_balance: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer;
      dbCustomers.push(customer);

      const token = createToken('tenant-A', UserRole.OWNER);
      const res = await request(app.getHttpServer())
        .delete('/customers/c-del')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = dbCustomers.find((c) => c.id === 'c-del');
      expect(deleted?.is_active).toBe(false);
    });
  });
});
