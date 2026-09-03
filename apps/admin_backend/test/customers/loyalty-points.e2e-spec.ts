import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { CustomersController } from '../../src/modules/customers/controllers/customers.controller';
import { CustomersService } from '../../src/modules/customers/services/customers.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import {
  CustomerPointTransaction,
  PointTransactionType,
} from '../../src/modules/customers/entities/customer-point-transaction.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';
import { createIdentityJwtConfigProvider } from '../support/identity-jwt-test.fixture';

describe('Customer Loyalty Points Module (E2E / Integration)', () => {
  const jwtSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
  let app: INestApplication<App>;
  let jwtService: JwtService;

  let dbCustomers: Customer[] = [];
  let dbTransactions: CustomerPointTransaction[] = [];

  const customerRepo = {
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

  const pointTxRepo = {
    find: jest.fn(
      (options: { where: { tenant_id?: string; customer_id?: string } }) => {
        const filtered = dbTransactions.filter(
          (t) =>
            (!options.where.tenant_id ||
              t.tenant_id === options.where.tenant_id) &&
            (!options.where.customer_id ||
              t.customer_id === options.where.customer_id),
        );
        return Promise.resolve(filtered);
      },
    ),
    create: jest.fn(
      (data: Partial<CustomerPointTransaction>) =>
        ({
          id: `pt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          created_at: new Date(),
          conversion_rate: 0.1,
          ...data,
        }) as CustomerPointTransaction,
    ),
    save: jest.fn((entity: CustomerPointTransaction) => {
      dbTransactions.push({ ...entity });
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
          useValue: pointTxRepo,
        },
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
    dbTransactions = [];
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

  describe('POST /customers/:id/points/adjust', () => {
    it('ajusta puntos de fidelidad y actualiza el saldo del cliente en el ledger', async () => {
      dbCustomers.push({
        id: 'cust-1',
        tenant_id: 'tenant-A',
        name: 'Roberto Gómez',
        tax_id: '001-200390-0002A',
        points_balance: 100.0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer);

      const token = createToken('tenant-A', UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .post('/customers/cust-1/points/adjust')
        .set('Authorization', `Bearer ${token}`)
        .send({
          points_delta: 50.0,
          reason: 'Bono fidelidad por compra mayorista',
        });

      expect(res.status).toBe(201);
      expect(res.body.customer.points_balance).toBe(150.0);
      expect(res.body.transaction.points).toBe(50.0);
      expect(res.body.transaction.balance_after).toBe(150.0);
      expect(res.body.transaction.type).toBe(PointTransactionType.ADJUST);
    });

    it('rechaza con 401 si no está autenticado', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers/cust-1/points/adjust')
        .send({ points_delta: 50.0, reason: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /customers/:id/points/transactions & Multi-Tenant Isolation', () => {
    it('retorna transacciones de puntos aislando por tenant', async () => {
      dbCustomers.push({
        id: 'cust-A',
        tenant_id: 'tenant-A',
        name: 'Cliente Tenant A',
        points_balance: 150.0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Customer);

      dbTransactions.push(
        {
          id: 'tx-A',
          tenant_id: 'tenant-A',
          customer_id: 'cust-A',
          type: PointTransactionType.EARN,
          points: 20.0,
          balance_after: 150.0,
          conversion_rate: 0.1,
          reason: 'Compra factura #1',
          created_at: new Date(),
        } as CustomerPointTransaction,
        {
          id: 'tx-B',
          tenant_id: 'tenant-B',
          customer_id: 'cust-B',
          type: PointTransactionType.EARN,
          points: 100.0,
          balance_after: 100.0,
          conversion_rate: 0.1,
          reason: 'Compra Tenant B',
          created_at: new Date(),
        } as CustomerPointTransaction,
      );

      const tokenA = createToken('tenant-A', UserRole.CASHIER);
      const resA = await request(app.getHttpServer())
        .get('/customers/cust-A/points/transactions')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.length).toBe(1);
      expect(resA.body[0].id).toBe('tx-A');
      expect(resA.body[0].points).toBe(20.0);
    });
  });
});
