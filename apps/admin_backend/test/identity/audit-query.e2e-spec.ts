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
import { TenantCapabilityEvent } from '../../src/modules/identity/entities/tenant-capability-event.entity';
import { AppPermission } from '../../src/modules/identity/security/permissions.enum';
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

describe('Forensic Audit Queries & Drawer Logs (e2e) (Slice 10.3)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let userRepository: Partial<Record<keyof Repository<User>, jest.Mock>>;
  let auditRepository: Partial<Record<keyof Repository<AuditLog>, jest.Mock>>;
  let mockQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };

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

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    auditRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      save: jest.fn(),
      findOne: jest.fn(),
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
      .useValue({ findOne: jest.fn() })
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

  describe('GET /identity/audit/overrides', () => {
    it('returns 401 when no token is provided', () => {
      return request(app.getHttpServer())
        .get('/identity/audit/overrides')
        .expect(401);
    });

    it('returns 403 when accessed by CASHIER or WAITER', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);
      const waiterToken = generateTestToken(waiterUserId, UserRole.WAITER);

      await request(app.getHttpServer())
        .get('/identity/audit/overrides')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/identity/audit/overrides')
        .set('Authorization', `Bearer ${waiterToken}`)
        .expect(403);
    });

    it('returns supervisor overrides audit stream for OWNER or MANAGER', async () => {
      const managerToken = generateTestToken(managerUserId, UserRole.MANAGER);

      const mockOverrideLogs = [
        {
          id: 'override-log-1',
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          tenant_id: testTenantId,
          user_id: cashierUserId,
          usuario_autorizador_id: managerUserId,
          metodo_autorizacion: 'PIN',
          device_id: 'POS-MAIN',
          timestamp: new Date('2026-08-26T12:00:00Z'),
          metadata: { permissionRequired: AppPermission.SALES_VOID_INVOICE },
        },
      ];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockOverrideLogs, 1]);

      const res = await request(app.getHttpServer())
        .get('/identity/audit/overrides?limit=10&offset=0')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].id).toBe('override-log-1');
      expect(res.body.items[0].metodo_autorizacion).toBe('PIN');
    });
  });

  describe('GET /identity/audit/drawer-opens', () => {
    it('returns 401 when no token is provided', () => {
      return request(app.getHttpServer())
        .get('/identity/audit/drawer-opens')
        .expect(401);
    });

    it('returns 403 when accessed by unauthorized role', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);

      await request(app.getHttpServer())
        .get('/identity/audit/drawer-opens')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(403);
    });

    it('returns manual drawer open records with reason filter for OWNER', async () => {
      const ownerToken = generateTestToken(ownerUserId, UserRole.OWNER);

      const mockDrawerLogs = [
        {
          id: 'drawer-log-1',
          action: 'DRAWER_OPENED_MANUALLY',
          tenant_id: testTenantId,
          user_id: cashierUserId,
          usuario_autorizador_id: managerUserId,
          metodo_autorizacion: 'PIN',
          device_id: 'POS-01',
          timestamp: new Date('2026-08-26T15:00:00Z'),
          metadata: { reason: 'CHANGE_REPLENISHMENT' },
        },
      ];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockDrawerLogs, 1]);

      const res = await request(app.getHttpServer())
        .get('/identity/audit/drawer-opens?reason=CHANGE_REPLENISHMENT')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].metadata.reason).toBe('CHANGE_REPLENISHMENT');
    });
  });

  describe('POST /identity/audit/drawer-opens', () => {
    it('records a valid manual drawer opening with mandatory reason code (DEC-10.4)', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);

      auditRepository.findOne.mockResolvedValue(null);
      auditRepository.save.mockImplementation(async (entity: AuditLog) => ({
        ...entity,
        id: 'saved-drawer-uuid',
      }));

      const res = await request(app.getHttpServer())
        .post('/identity/audit/drawer-opens')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          terminalId: 'POS-TERMINAL-01',
          reason: 'FLOAT_ADJUSTMENT',
          notes: 'Ajuste de fondo de caja',
          supervisorId: managerUserId,
          metodoAutorizacion: 'PIN',
        })
        .expect(201);

      expect(res.body.id).toBe('saved-drawer-uuid');
      expect(res.body.action).toBe('DRAWER_OPENED_MANUALLY');
      expect(res.body.metadata.reason).toBe('FLOAT_ADJUSTMENT');
    });

    it('rejects invalid reason code with 400', async () => {
      const cashierToken = generateTestToken(cashierUserId, UserRole.CASHIER);

      await request(app.getHttpServer())
        .post('/identity/audit/drawer-opens')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          terminalId: 'POS-TERMINAL-01',
          reason: 'INVALID_REASON',
        })
        .expect(400);
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
