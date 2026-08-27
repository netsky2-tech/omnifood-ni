import { Test, TestingModule } from '@nestjs/testing';
import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { AppPermission } from '../../src/modules/identity/security/permissions.enum';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDatabaseModule {}

describe('Permissions & Fine-Grained RBAC (e2e) (Slice 10.1)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let userRepository: Partial<Record<keyof Repository<User>, jest.Mock>>;
  let securityProfileRepository: Partial<
    Record<keyof Repository<SecurityProfile>, jest.Mock>
  >;
  let auditRepository: Partial<Record<keyof Repository<AuditLog>, jest.Mock>>;

  const testTenantId = '11111111-1111-1111-1111-111111111111';
  const ownerUserId = '22222222-2222-2222-2222-222222222222';
  const managerUserId = '33333333-3333-3333-3333-333333333333';
  const cashierUserId = '44444444-4444-4444-4444-444444444444';
  const waiterUserId = '55555555-5555-5555-5555-555555555555';

  const jwtEnvironment: Record<string, string> = {
    NODE_ENV: 'test',
    JWT_SECRET: 'supersecretjwtkeyforadminbackenddevelopmentonly-32bytes',
    JWT_ISSUER: 'omnifood-admin-api',
    JWT_AUDIENCE: 'omnifood-pos-client',
    JWT_ACCESS_TTL_SECONDS: '3600',
    JWT_REFRESH_TTL_SECONDS: '604800',
    JWT_CLOCK_TOLERANCE_SECONDS: '5',
    JWT_ALGORITHM: 'HS256',
  };

  const generateTestToken = (
    sub: string,
    role: UserRole,
    tenantId: string = testTenantId,
  ) => {
    return jwtService.sign(
      {
        sub,
        email: `${role.toLowerCase()}@omnifood.ni`,
        tenant_id: tenantId,
        role,
        is_active: true,
        token_type: JWT_TOKEN_TYPES.ACCESS,
        security_version: 1,
      },
      {
        secret: jwtEnvironment.JWT_SECRET,
        issuer: jwtEnvironment.JWT_ISSUER,
        audience: jwtEnvironment.JWT_AUDIENCE,
        expiresIn: '1h',
      },
    );
  };

  beforeAll(async () => {
    Object.assign(process.env, jwtEnvironment);

    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    securityProfileRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    auditRepository = {
      save: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        TestDatabaseModule,
        IdentityModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue(auditRepository)
      .overrideProvider(getRepositoryToken(SecurityProfile))
      .useValue(securityProfileRepository)
      .overrideProvider(getRepositoryToken(AuditIntegrityAlert))
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  describe('GET /identity/users/permissions/matrix', () => {
    it('returns 401 when no token is provided', () => {
      return request(app.getHttpServer())
        .get('/identity/users/permissions/matrix')
        .expect(401);
    });

    it('returns permissions matrix for OWNER', async () => {
      const token = generateTestToken(ownerUserId, UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .get('/identity/users/permissions/matrix')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const matrixBody = res.body as {
        role_defaults: Record<string, string[]>;
        all_permissions: string[];
      };
      expect(matrixBody).toHaveProperty('role_defaults');
      expect(matrixBody).toHaveProperty('all_permissions');
      expect(matrixBody.role_defaults.OWNER).toContain('sales:void_invoice');
      expect(matrixBody.role_defaults.OWNER).toContain('inventory:recipe_edit');
      expect(matrixBody.role_defaults.MANAGER).not.toContain(
        'inventory:recipe_edit',
      );
      expect(matrixBody.role_defaults.CASHIER).toEqual([]);
      expect(matrixBody.all_permissions).toContain('sales:void_invoice');
      expect(matrixBody.all_permissions).toContain('cash:manual_drawer_open');
    });

    it('returns permissions matrix for MANAGER', async () => {
      const token = generateTestToken(managerUserId, UserRole.MANAGER);

      const res = await request(app.getHttpServer())
        .get('/identity/users/permissions/matrix')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const managerBody = res.body as {
        role_defaults: Record<string, string[]>;
      };
      expect(managerBody).toHaveProperty('role_defaults');
    });

    it('returns 403 when accessed by CASHIER or WAITER', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      await request(app.getHttpServer())
        .get('/identity/users/permissions/matrix')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(403);

      const waiterToken = generateTestToken(waiterUserId, UserRole.WAITER);
      await request(app.getHttpServer())
        .get('/identity/users/permissions/matrix')
        .set('Authorization', `Bearer ${waiterToken}`)
        .expect(403);
    });
  });

  describe('GET /identity/users/:id/permissions', () => {
    it('returns effective permissions for a user', async () => {
      const token = generateTestToken(ownerUserId, UserRole.OWNER);

      userRepository.findOne.mockResolvedValue({
        id: cashierUserId,
        role: UserRole.CASHIER,
        tenant_id: testTenantId,
        is_active: true,
      });

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: cashierUserId,
        custom_permissions: [AppPermission.SALES_VOID_INVOICE],
      });

      const res = await request(app.getHttpServer())
        .get(`/identity/users/${cashierUserId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const permsBody = res.body as {
        user_id: string;
        role: string;
        role_permissions: string[];
        custom_permissions: string[];
        effective_permissions: string[];
      };
      expect(permsBody.user_id).toBe(cashierUserId);
      expect(permsBody.role).toBe(UserRole.CASHIER);
      expect(permsBody.role_permissions).toEqual([]);
      expect(permsBody.custom_permissions).toEqual([
        AppPermission.SALES_VOID_INVOICE,
      ]);
      expect(permsBody.effective_permissions).toEqual([
        AppPermission.SALES_VOID_INVOICE,
      ]);
    });
  });

  describe('PUT /identity/users/:id/permissions validation & authorization', () => {
    it('updates custom permissions when executed by OWNER', async () => {
      const token = generateTestToken(ownerUserId, UserRole.OWNER);

      userRepository.findOne.mockResolvedValue({
        id: cashierUserId,
        role: UserRole.CASHIER,
        tenant_id: testTenantId,
        is_active: true,
      });

      const profile = {
        user_id: cashierUserId,
        custom_permissions: [],
      };
      securityProfileRepository.findOne.mockResolvedValue(profile);
      securityProfileRepository.save.mockImplementation(
        async (p: unknown) => p,
      );
      auditRepository.save.mockResolvedValue({ id: 'audit-1' });

      const res = await request(app.getHttpServer())
        .put(`/identity/users/${cashierUserId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          custom_permissions: [
            AppPermission.SALES_VOID_INVOICE,
            AppPermission.CASH_MANUAL_DRAWER_OPEN,
          ],
        })
        .expect(200);

      const updateBody = res.body as {
        effective_permissions: string[];
      };
      expect(updateBody.effective_permissions).toContain(
        AppPermission.SALES_VOID_INVOICE,
      );
      expect(updateBody.effective_permissions).toContain(
        AppPermission.CASH_MANUAL_DRAWER_OPEN,
      );
      expect(auditRepository.save).toHaveBeenCalled();
    });

    it('returns 403 when non-owner attempts to modify permissions', async () => {
      const waiterToken = generateTestToken(waiterUserId, UserRole.WAITER);

      await request(app.getHttpServer())
        .put(`/identity/users/${cashierUserId}/permissions`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ custom_permissions: [AppPermission.SALES_VOID_INVOICE] })
        .expect(403);
    });

    it('returns 400 when invalid permission capability is provided', async () => {
      const ownerToken = generateTestToken(ownerUserId, UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .put(`/identity/users/${cashierUserId}/permissions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ custom_permissions: ['invalid:capability:format'] })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('custom_permissions');
    });

    it('returns 400 when duplicate permissions are provided in payload', async () => {
      const ownerToken = generateTestToken(ownerUserId, UserRole.OWNER);

      const res = await request(app.getHttpServer())
        .put(`/identity/users/${cashierUserId}/permissions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          custom_permissions: [
            AppPermission.SALES_VOID_INVOICE,
            AppPermission.SALES_VOID_INVOICE,
          ],
        })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('duplicates');
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
