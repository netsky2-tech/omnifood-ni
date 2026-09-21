import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
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
import { SyncBatchController } from './sync-batch.controller';
import { InboundSyncController } from './inbound-sync.controller';
import { InvoicesService } from '../services/invoices.service';
import { InboundSyncService } from '../services/inbound-sync.service';
import { SyncCreditNoteAuthGuard } from '../guards/sync-credit-note-auth.guard';
import { AuthGuard } from '../../identity/guards/auth.guard';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../../identity/security/jwt-token.types';

describe('Sync Device Transport Integration (DSI-2)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const syncBatchMock = jest.fn();
  const getInboundDeltasMock = jest.fn();
  const recordFiscalAckMock = jest.fn();

  const mockDeviceSyncJwtConfig: DeviceSyncJwtConfig = {
    secret: 'super-secure-device-sync-jwt-secret-key-32-chars!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    renewalTtlSeconds: 86400 * 30,
    issuer: 'omnifood-device-sync',
    audience: 'omnifood-device-sync-client',
    clockToleranceSeconds: 5,
  };

  const mockIdentityJwtConfig: IdentityJwtConfig = {
    secret: 'super-secure-identity-jwt-secret-key-32-chars!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 86400 * 7,
    issuer: 'omnifood-identity',
    audience: 'omnifood-identity-client',
    clockToleranceSeconds: 5,
  };

  let mockCredentialRecord: Partial<DeviceSyncCredential>;
  let mockTenantRecord: Partial<Tenant>;
  // The tenant-bound transaction manager created in beforeAll and passed to
  // the service as the fourth argument of getInboundDeltas (issue #470).
  let boundManager: object;

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
    boundManager = mockManager;

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
      getRepository: jest.fn().mockImplementation(() => {
        throw new Error(
          'Repositories must not be accessed outside transaction',
        );
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController, InboundSyncController],
      providers: [
        {
          provide: InvoicesService,
          useValue: { syncBatch: syncBatchMock },
        },
        {
          provide: InboundSyncService,
          useValue: {
            getInboundDeltas: getInboundDeltasMock,
            recordFiscalAck: recordFiscalAckMock,
          },
        },
        {
          provide: DEVICE_SYNC_JWT_CONFIG,
          useValue: mockDeviceSyncJwtConfig,
        },
        {
          provide: IDENTITY_JWT_CONFIG,
          useValue: mockIdentityJwtConfig,
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
        SyncCreditNoteAuthGuard,
        AuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

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
      } as any,
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

  describe('Outbound sync batch (POST /v1/sync/batch)', () => {
    it('accepts batch and establishes tenant authority purely from principal', async () => {
      const token = await signDeviceToken();
      syncBatchMock.mockResolvedValue({
        received: 1,
        processed: 1,
        duplicates: 0,
        results: [],
      });

      const response = await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-key-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(201);

      expect(syncBatchMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.any(Array),
      );
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'success',
          received: 1,
          processed: 1,
        }),
      );
    });

    it('denies batch when token only has sync:pull scope (403 Forbidden)', async () => {
      const token = await signDeviceToken({ scopes: ['sync:pull'] });

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-key-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(403);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('rejects batch when any record has mismatched sourceDeviceId (origin binding)', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-key-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
            {
              idempotencyKey: 'pur-key-2',
              sourceDeviceId: 'untrusted-pos-99',
              sourceSequence: 2,
              documentType: 'PURCHASE',
            },
          ],
        })
        .expect(403);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('rejects batch when record terminalId is present and mismatches principal deviceId', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-key-1',
              sourceDeviceId: 'pos-terminal-01',
              terminalId: 'spoofed-terminal-02',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(403);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('binds authoritative origin across non-credit-note record types (SALE, PURCHASE, FULFILLMENT)', async () => {
      const token = await signDeviceToken();
      syncBatchMock.mockResolvedValue({
        received: 3,
        processed: 3,
        duplicates: 0,
        results: [],
      });

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-rec-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
            {
              idempotencyKey: 'inventory-rec-2',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 2,
              documentType: 'PURCHASE',
            },
            {
              idempotencyKey: 'fulfillment-rec-3',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 3,
              documentType: 'FULFILLMENT',
            },
          ],
        })
        .expect(201);

      expect(syncBatchMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.any(Array),
      );
    });

    it('fails closed (403 Forbidden) when batch contains CREDIT_NOTE under device transport until DSI-6', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'credit-note-rec-4',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 4,
              documentType: 'CREDIT_NOTE',
            },
          ],
        })
        .expect(403);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('rejects batch when payload attempts to declare another tenantId', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tenantId: 'tenant-other-spoofed',
          records: [
            {
              idempotencyKey: 'sale-rec-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(403);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('rejects batch when credential is revoked in database', async () => {
      mockCredentialRecord.status = DeviceSyncCredentialStatus.REVOKED;
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-rec-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(401);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });

    it('rejects batch when tenant is inactive in database', async () => {
      mockTenantRecord.is_active = false;
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .post('/v1/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          records: [
            {
              idempotencyKey: 'sale-rec-1',
              sourceDeviceId: 'pos-terminal-01',
              sourceSequence: 1,
              documentType: 'SALE',
            },
          ],
        })
        .expect(401);

      expect(syncBatchMock).not.toHaveBeenCalled();
    });
  });

  describe('Inbound sync endpoints (GET /v1/sync/inbound/*)', () => {
    it('allows GET /v1/sync/inbound/deltas with sync:pull scope and uses tenant authority from principal when terminalId matches', async () => {
      const token = await signDeviceToken();
      getInboundDeltasMock.mockResolvedValue({
        status: 'success',
        serverTime: new Date().toISOString(),
        currentVersion: 1,
        deltas: { products: [] },
      });

      await request(app.getHttpServer())
        .get(
          '/v1/sync/inbound/deltas?sinceVersion=100&terminalId=pos-terminal-01',
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify that tenant passed to service is strictly the principal's tenant 'tenant-omega'
      // The third argument is the authenticated principal, and it is the only
      // source of the terminal identity the epoch chain binds to (decision 24),
      // so asserting it here is what keeps the query from becoming an alias.
      // The fourth argument is the tenant-bound transaction manager the reads
      // must ride (issue #470): the guard's binding commits before the handler.
      expect(getInboundDeltasMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.objectContaining({
          sinceVersion: '100',
          terminalId: 'pos-terminal-01',
        }),
        expect.objectContaining({ deviceId: 'pos-terminal-01' }),
        boundManager,
      );
    });

    it('denies GET /v1/sync/inbound/deltas when query terminalId mismatches principal deviceId (403 Forbidden)', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/deltas?sinceVersion=0&terminalId=OTHER-TERMINAL')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(getInboundDeltasMock).not.toHaveBeenCalled();
    });

    it('denies GET /v1/sync/inbound/deltas when query terminalId is empty or blank (403 Forbidden)', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/deltas?sinceVersion=0&terminalId=')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/deltas?sinceVersion=0&terminalId=%20%20%20')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(getInboundDeltasMock).not.toHaveBeenCalled();
    });

    it('denies GET /v1/sync/inbound/deltas when query terminalId is duplicated as an array (403 Forbidden)', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .get(
          '/v1/sync/inbound/deltas?sinceVersion=0&terminalId=pos-terminal-01&terminalId=OTHER-TERMINAL',
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(getInboundDeltasMock).not.toHaveBeenCalled();
    });

    it('denies GET /v1/sync/inbound/deltas when query tenantId mismatches principal tenantId (403 Forbidden)', async () => {
      const token = await signDeviceToken();

      await request(app.getHttpServer())
        .get(
          '/v1/sync/inbound/deltas?sinceVersion=0&terminalId=pos-terminal-01&tenantId=spoofed-tenant',
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(getInboundDeltasMock).not.toHaveBeenCalled();
    });

    it('allows GET /v1/sync/inbound/deltas without terminalId query param (preserves routes without it)', async () => {
      const token = await signDeviceToken();
      getInboundDeltasMock.mockResolvedValue({
        status: 'success',
        serverTime: new Date().toISOString(),
        currentVersion: 1,
        deltas: { products: [] },
      });

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/deltas?sinceVersion=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getInboundDeltasMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.objectContaining({ sinceVersion: '0' }),
        expect.objectContaining({ deviceId: 'pos-terminal-01' }),
        boundManager,
      );
    });

    it('denies GET /v1/sync/inbound/deltas when token only has sync:push scope (403 Forbidden)', async () => {
      const token = await signDeviceToken({ scopes: ['sync:push'] });

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/deltas')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(getInboundDeltasMock).not.toHaveBeenCalled();
    });

    it('allows GET /v1/sync/inbound/catalog with sync:pull scope', async () => {
      const token = await signDeviceToken();
      getInboundDeltasMock.mockResolvedValue({
        status: 'success',
        serverTime: new Date().toISOString(),
        currentVersion: 1,
        deltas: { products: [] },
      });

      await request(app.getHttpServer())
        .get('/v1/sync/inbound/catalog')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getInboundDeltasMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.any(Object),
        expect.objectContaining({ deviceId: 'pos-terminal-01' }),
        boundManager,
      );
    });

    it('allows POST /v1/sync/inbound/fiscal/ack with sync:pull scope', async () => {
      const token = await signDeviceToken();
      recordFiscalAckMock.mockResolvedValue({
        status: 'success',
        acknowledgedRevision: 1,
        acknowledgedFingerprint: 'fp-1',
      });

      const ackPayload = {
        tenantId: 'tenant-omega',
        terminalId: 'pos-terminal-01',
        revision: 1,
        fingerprint: 'fp-1',
        appliedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/v1/sync/inbound/fiscal/ack')
        .set('Authorization', `Bearer ${token}`)
        .send(ackPayload)
        .expect(201);

      expect(recordFiscalAckMock).toHaveBeenCalledWith(
        'tenant-omega',
        expect.objectContaining({ revision: 1 }),
      );
    });

    it('denies POST /v1/sync/inbound/fiscal/ack when token only has sync:push scope (403 Forbidden)', async () => {
      const token = await signDeviceToken({ scopes: ['sync:push'] });

      const ackPayload = {
        tenantId: 'tenant-omega',
        terminalId: 'pos-terminal-01',
        revision: 1,
        fingerprint: 'fp-1',
        appliedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/v1/sync/inbound/fiscal/ack')
        .set('Authorization', `Bearer ${token}`)
        .send(ackPayload)
        .expect(403);

      expect(recordFiscalAckMock).not.toHaveBeenCalled();
    });
  });
});
