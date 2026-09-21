import { INestApplication } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  DeviceSyncJwtConfig,
  DEVICE_SYNC_JWT_CONFIG,
} from '../../identity/config/device-sync-jwt.config';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { SYNC_SCOPES_KEY } from '../../identity/decorators/sync-scopes.decorator';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../../identity/security/jwt-token.types';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from '../services/invoices.service';

const handlerOf = (handlerName: string): unknown => {
  const handler = Object.getOwnPropertyDescriptor(
    InvoicesController.prototype,
    handlerName,
  )?.value;
  if (typeof handler !== 'function') {
    throw new Error(`Missing ${handlerName} handler`);
  }
  return handler;
};

const unauthenticatedContext = (request: Record<string, unknown> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('InvoicesController device transport routes (issue #445)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let controller: InvoicesController;
  const syncInvoicesMock = jest.fn();
  const findAllMock = jest.fn();
  const findOneMock = jest.fn();

  const mockDeviceSyncJwtConfig: DeviceSyncJwtConfig = {
    secret: 'super-secure-device-sync-jwt-secret-key-32-chars!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    renewalTtlSeconds: 86400 * 30,
    issuer: 'omnifood-device-sync',
    audience: 'omnifood-device-sync-client',
    clockToleranceSeconds: 5,
  };

  const signDeviceToken = async (
    claimsOverrides: Partial<DeviceSyncJwtClaims> = {},
  ) => {
    const claims: DeviceSyncJwtClaims = {
      sub: 'cred-device-uuid-1',
      principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
      token_type: DEVICE_SYNC_TOKEN_TYPE,
      tenant_id: 'tenant-omega',
      device_id: 'pos-terminal-01',
      scopes: ['sync:push', 'sync:pull'],
      credential_version: 1,
      jti: 'jti-device-token-1',
      ...claimsOverrides,
    };

    return await jwtService.signAsync(claims, {
      secret: mockDeviceSyncJwtConfig.secret,
      algorithm: mockDeviceSyncJwtConfig.algorithm,
      issuer: mockDeviceSyncJwtConfig.issuer,
      audience: mockDeviceSyncJwtConfig.audience,
      expiresIn: mockDeviceSyncJwtConfig.accessTokenTtlSeconds,
    });
  };

  beforeAll(async () => {
    jwtService = new JwtService();

    const mockManager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === DeviceSyncCredential) {
          return {
            findOne: jest
              .fn()
              .mockImplementation(() => Promise.resolve(mockCredentialRecord)),
          };
        }
        if (entity === Tenant) {
          return {
            findOne: jest
              .fn()
              .mockImplementation(() => Promise.resolve(mockTenantRecord)),
          };
        }
        throw new Error(`Unexpected entity: ${entity}`);
      }),
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
      getRepository: jest.fn().mockImplementation(() => {
        throw new Error(
          'Repositories must not be accessed outside transaction',
        );
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [
        {
          provide: InvoicesService,
          useValue: {
            syncInvoices: syncInvoicesMock,
            findAll: findAllMock,
            findOne: findOneMock,
          },
        },
        {
          provide: DEVICE_SYNC_JWT_CONFIG,
          useValue: mockDeviceSyncJwtConfig,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        SyncTransportGuard,
      ],
    }).compile();

    // Direct handle for the fail-closed tenant assertions.
    controller = moduleFixture.get<InvoicesController>(InvoicesController);

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  let mockCredentialRecord: Partial<DeviceSyncCredential>;
  let mockTenantRecord: Partial<Tenant>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCredentialRecord = {
      id: 'cred-device-uuid-1',
      tenantId: 'tenant-omega',
      activationAttemptId: 'attempt-1',
      activationAttempt: {
        id: 'attempt-1',
        tenantId: 'tenant-omega',
        trustedTerminalId: 'pos-terminal-01',
      } as never,
      scopes: ['sync:push', 'sync:pull'],
      version: 1,
      status: DeviceSyncCredentialStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 86400 * 1000),
      issuedAt: new Date(),
    };

    mockTenantRecord = {
      id: 'tenant-omega',
      name: 'Tenant Omega',
      ruc: 'J1234567890123',
      is_active: true,
    };
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('transport metadata', () => {
    it('declares the device sync transport on the controller', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, InvoicesController)).toEqual([
        SyncTransportGuard,
      ]);
    });

    it.each([
      ['POST sales/sync', 'syncInvoices', 'sync:push'],
      ['GET sales', 'findAll', 'sync:pull'],
      ['GET sales/:id', 'findOne', 'sync:pull'],
    ])('%s requires the device scope %s', (_route, handlerName, scope) => {
      const handler = handlerOf(handlerName);

      expect(Reflect.getMetadata(SYNC_SCOPES_KEY, handler)).toEqual([scope]);
    });

    it.each(['syncInvoices', 'findAll', 'findOne'])(
      'class-level transport on %s leaves no human guard or role gate',
      (handlerName) => {
        const handler = handlerOf(handlerName);
        const classGuards = Reflect.getMetadata(
          GUARDS_METADATA,
          InvoicesController,
        ) as unknown[];

        expect(classGuards).not.toContain(AuthGuard);
        expect(classGuards).not.toContain(RolesGuard);
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
      },
    );
  });

  describe('POST /sales/sync', () => {
    it('rejects a request without a device bearer token', async () => {
      await request(app.getHttpServer())
        .post('/sales/sync')
        .send([])
        .expect(401);

      expect(syncInvoicesMock).not.toHaveBeenCalled();
    });

    it('accepts a device token with the sync:push scope and binds the principal tenant', async () => {
      const token = await signDeviceToken();
      syncInvoicesMock.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/sales/sync')
        .set('Authorization', `Bearer ${token}`)
        .send([])
        .expect(201);

      expect(syncInvoicesMock).toHaveBeenCalledWith('tenant-omega', []);
    });

    it('denies a device token that only carries the sync:pull scope', async () => {
      const token = await signDeviceToken({ scopes: ['sync:pull'] });

      await request(app.getHttpServer())
        .post('/sales/sync')
        .set('Authorization', `Bearer ${token}`)
        .send([])
        .expect(403);

      expect(syncInvoicesMock).not.toHaveBeenCalled();
    });

    it('fails closed when no tenant context is bound', async () => {
      await expect(controller.syncInvoices(undefined, [])).rejects.toThrow(
        'Tenant context is required',
      );
      expect(syncInvoicesMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /sales', () => {
    it('rejects a request without a device bearer token', async () => {
      await request(app.getHttpServer()).get('/sales').expect(401);

      expect(findAllMock).not.toHaveBeenCalled();
    });

    it('accepts a device token with the sync:pull scope and binds the principal tenant', async () => {
      const token = await signDeviceToken();
      findAllMock.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/sales')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(findAllMock).toHaveBeenCalledWith('tenant-omega');
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /sales/:id', () => {
    it('rejects a request without a device bearer token', async () => {
      await request(app.getHttpServer()).get('/sales/inv-1').expect(401);

      expect(findOneMock).not.toHaveBeenCalled();
    });

    it('accepts a device token with the sync:pull scope and binds the principal tenant', async () => {
      const token = await signDeviceToken();
      findOneMock.mockResolvedValue({ id: 'inv-1' });

      const response = await request(app.getHttpServer())
        .get('/sales/inv-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(findOneMock).toHaveBeenCalledWith('tenant-omega', 'inv-1');
      expect(response.body).toEqual({ id: 'inv-1' });
    });
  });

  describe('the transport guard itself', () => {
    it('is the real SyncTransportGuard and rejects an unauthenticated request', async () => {
      // The real guard, not an override: fail-closed on a missing bearer is
      // the acceptance criterion for these routes (issue #445).
      const guard = new SyncTransportGuard(
        {} as JwtService,
        mockDeviceSyncJwtConfig,
        {} as DataSource,
        undefined as never,
      );

      await expect(
        guard.canActivate(unauthenticatedContext({ headers: {} })),
      ).rejects.toThrow('Missing or invalid device authorization header');
    });
  });
});
