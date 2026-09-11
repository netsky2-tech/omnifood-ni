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
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { TenantCapabilityEvent } from '../../src/modules/identity/entities/tenant-capability-event.entity';
import { AppPermission } from '../../src/modules/identity/security/permissions.enum';
import { generateTotp } from '../../src/modules/identity/security/totp.util';
import { JWT_TOKEN_TYPES } from '../../src/modules/identity/security/jwt-token.types';

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useValue: {
        entityMetadatas: [],
        getRepository: jest.fn().mockReturnValue({}),
      },
    },
  ],
  exports: [DataSource],
})
class TestDatabaseModule {}

describe('Dual-Channel Supervisor Override (e2e) (Slice 10.2)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let userRepository: Partial<Record<keyof Repository<User>, jest.Mock>>;
  let securityProfileRepository: Partial<
    Record<keyof Repository<SecurityProfile>, jest.Mock>
  >;
  let auditRepository: Partial<Record<keyof Repository<AuditLog>, jest.Mock>>;

  const testTenantId = '11111111-1111-1111-1111-111111111111';
  const cashierUserId = '22222222-2222-2222-2222-222222222222';
  const supervisorManagerId = '33333333-3333-3333-3333-333333333333';
  const supervisorOwnerId = '44444444-4444-4444-4444-444444444444';
  const testTotpSeed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  const defaultFindOneImpl = async (args?: { where?: { id?: string } }) => {
    const id = args?.where?.id;
    if (id === cashierUserId) {
      return {
        id: cashierUserId,
        name: 'Ana Cashier',
        email: 'cashier@omnifood.ni',
        role: UserRole.CASHIER,
        tenant_id: testTenantId,
        is_active: true,
        security_version: 1,
      };
    }
    if (id === supervisorManagerId) {
      return {
        id: supervisorManagerId,
        name: 'Carlos Manager',
        email: 'manager@omnifood.ni',
        role: UserRole.MANAGER,
        tenant_id: testTenantId,
        is_active: true,
        security_version: 1,
      };
    }
    if (id === supervisorOwnerId) {
      return {
        id: supervisorOwnerId,
        name: 'Ana Owner',
        email: 'owner@omnifood.ni',
        role: UserRole.OWNER,
        tenant_id: testTenantId,
        is_active: true,
        security_version: 1,
      };
    }
    return null;
  };

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
      findOne: jest.fn().mockImplementation(defaultFindOneImpl),
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
      .overrideProvider(getRepositoryToken(TenantCapabilityEvent))
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

  beforeEach(() => {
    userRepository.findOne.mockReset().mockImplementation(defaultFindOneImpl);
  });

  describe('POST /identity/auth/supervisor-override', () => {
    it('returns 401 when no bearer token is provided', () => {
      return request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .send({
          supervisorId: supervisorManagerId,
          credential: '1234',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        })
        .expect(401);
    });

    it('successfully authorizes with in-person PIN and generates 60s ephemeral token', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      const pinHash = await bcrypt.hash('123456', 10);

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorManagerId,
        pin_hash: pinHash,
        is_pin_enabled: true,
        custom_permissions: [],
      });
      auditRepository.save.mockResolvedValue({ id: 'audit-1' });

      const res = await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: supervisorManagerId,
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
          context: {
            invoiceId: 'inv-999',
            reason: 'Cliente canceló comanda',
          },
        })
        .expect(201);

      const body = res.body as {
        authorized: boolean;
        supervisorId: string;
        supervisorName: string;
        authorizationToken: string;
        expiresAt: string;
        permission: string;
      };

      expect(body.authorized).toBe(true);
      expect(body.supervisorId).toBe(supervisorManagerId);
      expect(body.supervisorName).toBe('Carlos Manager');
      expect(body.permission).toBe(AppPermission.SALES_VOID_INVOICE);
      expect(body.authorizationToken).toBeDefined();
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          metodo_autorizacion: 'PIN',
          usuario_autorizador_id: supervisorManagerId,
          user_id: cashierUserId,
        }),
      );
    });

    it('returns 401 when invalid PIN is provided', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      const pinHash = await bcrypt.hash('123456', 10);

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorManagerId,
        pin_hash: pinHash,
        is_pin_enabled: true,
        custom_permissions: [],
      });
      auditRepository.save.mockResolvedValue({ id: 'audit-2' });

      await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: supervisorManagerId,
          credential: 'wrong_pin',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        })
        .expect(401);

      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_REJECTED',
          metodo_autorizacion: 'PIN',
        }),
      );
    });

    it('successfully authorizes with remote RFC 6238 TOTP token', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      const validTotpCode = generateTotp(testTotpSeed, Date.now());

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorOwnerId,
        totp_secret_seed: testTotpSeed,
        is_totp_enabled: true,
        custom_permissions: [],
      });
      auditRepository.save.mockResolvedValue({ id: 'audit-3' });

      const res = await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: supervisorOwnerId,
          credential: validTotpCode,
          method: 'TOTP',
          permissionRequired: AppPermission.INVENTORY_RECIPE_EDIT,
        })
        .expect(201);

      const body = res.body as {
        authorized: boolean;
        supervisorId: string;
        supervisorName: string;
        authorizationToken: string;
        expiresAt: string;
        permission: string;
      };

      expect(body.authorized).toBe(true);
      expect(body.supervisorId).toBe(supervisorOwnerId);
      expect(body.supervisorName).toBe('Ana Owner');
      expect(body.permission).toBe(AppPermission.INVENTORY_RECIPE_EDIT);
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          metodo_autorizacion: 'TOTP',
          usuario_autorizador_id: supervisorOwnerId,
        }),
      );
    });

    it('returns 401 when invalid TOTP token is provided', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorOwnerId,
        totp_secret_seed: testTotpSeed,
        is_totp_enabled: true,
        custom_permissions: [],
      });
      auditRepository.save.mockResolvedValue({ id: 'audit-4' });

      await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: supervisorOwnerId,
          credential: '000000',
          method: 'TOTP',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        })
        .expect(401);
    });

    it('returns 403 when supervisor lacks the required capability (e.g. MANAGER authorizing recipe edit)', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      const pinHash = await bcrypt.hash('123456', 10);

      securityProfileRepository.findOne.mockResolvedValue({
        user_id: supervisorManagerId,
        pin_hash: pinHash,
        is_pin_enabled: true,
        custom_permissions: [],
      });
      auditRepository.save.mockResolvedValue({ id: 'audit-5' });

      await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: supervisorManagerId,
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.INVENTORY_RECIPE_EDIT,
        })
        .expect(403);
    });

    it('returns 404 when supervisor is not found in the tenant', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);

      auditRepository.save.mockResolvedValue({ id: 'audit-6' });

      await request(app.getHttpServer())
        .post('/identity/auth/supervisor-override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          supervisorId: 'non-existent-supervisor-id',
          credential: '123456',
          method: 'PIN',
          permissionRequired: AppPermission.SALES_VOID_INVOICE,
        })
        .expect(404);
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
