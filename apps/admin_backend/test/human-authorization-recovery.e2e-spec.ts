import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TenantInterceptor } from '../src/core/database/rls.interceptor';
import { HumanAuthorizationRecoveryTokenController } from '../src/modules/identity/human-authorization/controllers/recovery-token.controller';
import { InboundSyncController } from '../src/modules/sales/controllers/inbound-sync.controller';
import { AuthGuard } from '../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../src/modules/identity/guards/roles.guard';
import { SyncTransportGuard } from '../src/modules/identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  type DeviceSyncJwtConfig,
} from '../src/modules/identity/config/device-sync-jwt.config';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
} from '../src/modules/identity/security/jwt-token.types';
import {
  createIdentityJwtConfigProvider,
  signIdentityJwtAccessToken,
} from './support/identity-jwt-test.fixture';
import { CurrentUserAuthorizationService } from '../src/modules/identity/services/current-user-authorization.service';
import { RecoveryTokenService } from '../src/modules/identity/human-authorization/services/recovery-token.service';
import { InboundSyncService } from '../src/modules/sales/services/inbound-sync.service';

/**
 * Transport-class separation for the OHAC recovery-token surfaces (design §9
 * routes, §13 integration discipline).
 *
 * Layer split (deliberate): THIS file proves, through the real Nest router
 * with the real guards, WHO may transmit to each surface — a human session
 * JWT cannot ride the device redeem route, a device-sync JWT cannot ride the
 * human issuance route, and even a cryptographically valid device token
 * cannot redeem without a provisioned ACTIVE credential (the guard's
 * credential lookup fails against the (empty) test store). The response
 * shapes and §10 HTTP status mapping of a successful/denied redemption are
 * proven at the service level in
 * `src/modules/sales/services/inbound-sync.service.spec.ts`, because a real
 * 200 redemption requires a provisioned device credential + recovery token
 * in a real database (covered by the db-spec lifecycle suite instead).
 */

// Distinct deployment secrets per transport: the whole point of the
// separation is that a token minted for one transport cannot authenticate
// against the other.
const DEVICE_SYNC_TEST_CONFIG: DeviceSyncJwtConfig = {
  secret: 'test-only-device-sync-jwt-secret-at-least-32-bytes',
  issuer: 'omnifood-admin',
  audience: 'omnifood-device-sync',
  accessTokenTtlSeconds: 900,
  renewalTtlSeconds: 2_592_000,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};

describe('OHAC recovery-token transport separation (e2e, design §13)', () => {
  let app: INestApplication<App>;
  const recoveryTokenService = {
    issue: jest.fn(),
    redeem: jest.fn(),
    revoke: jest.fn(),
  };
  const inboundSyncService = {
    redeemHumanAuthorizationRecoveryToken: jest.fn(),
  };

  beforeAll(async () => {
    // Empty credential store: the transport guard's credential lookup must
    // fail for any token, which is exactly the rejection under test.
    const dataSourceMock = {
      transaction: jest.fn(async (operation: (manager: unknown) => unknown) =>
        operation({
          query: jest.fn().mockResolvedValue(undefined),
          getRepository: () => ({
            findOne: jest.fn().mockResolvedValue(null),
          }),
        }),
      ),
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      controllers: [
        HumanAuthorizationRecoveryTokenController,
        InboundSyncController,
      ],
      providers: [
        JwtService,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        TenantInterceptor,
        SyncTransportGuard,
        createIdentityJwtConfigProvider(),
        { provide: DEVICE_SYNC_JWT_CONFIG, useValue: DEVICE_SYNC_TEST_CONFIG },
        { provide: DataSource, useValue: dataSourceMock },
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn() },
        },
        {
          provide: RecoveryTokenService,
          useValue: recoveryTokenService,
        },
        { provide: InboundSyncService, useValue: inboundSyncService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // RolesGuard compares the JWT role against @Roles(OWNER, MANAGER), so the
  // token carries the canonical enum value.
  const humanToken = () =>
    signIdentityJwtAccessToken(app.get(JwtService), { role: 'OWNER' });

  /**
   * A device-sync access token minted with the DEVICE transport secret and
   * the strict claims contract (mirrors signDeviceSyncAccessToken's claims,
   * without provisioning a credential — the rejection under test happens
   * before or at the credential lookup).
   */
  const deviceToken = () => {
    const jwtService = app.get(JwtService);
    return jwtService.sign(
      {
        sub: randomUUID(),
        principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
        token_type: DEVICE_SYNC_TOKEN_TYPE,
        tenant_id: 'tenant-e2e',
        device_id: 'Q802024120001',
        scopes: ['sync:pull'],
        credential_version: 1,
        jti: randomUUID(),
      },
      {
        secret: DEVICE_SYNC_TEST_CONFIG.secret,
        algorithm: DEVICE_SYNC_TEST_CONFIG.algorithm,
        issuer: DEVICE_SYNC_TEST_CONFIG.issuer,
        audience: DEVICE_SYNC_TEST_CONFIG.audience,
        expiresIn: DEVICE_SYNC_TEST_CONFIG.accessTokenTtlSeconds,
      },
    );
  };

  const redeemBody = {
    token: `ohr1.${randomUUID()}.${'a'.repeat(43)}`,
    idempotencyKey: 'idem-e2e-1',
    posBuild: 'pos-build-1',
    policySchema: 'ohac.staff-policy-snapshot.v1',
    assertionSchema: 'ohac.assertion.v1',
  };

  it('rejects unauthenticated requests on both surfaces with 401 from their own guards', async () => {
    await request(app.getHttpServer())
      .post('/identity/human-authorization/recovery-tokens')
      .send({ terminalId: 'Q802024120001', reason: 'test' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/sync/inbound/human-authorization/recovery/redeem')
      .send(redeemBody)
      .expect(401);
  });

  it('denies Device Sync authority on the human issuance route: a valid device JWT cannot issue recovery tokens', async () => {
    // The transport guard authenticated this token's twin on the device
    // routes, but the human route authenticates the identity JWT only: the
    // device secret and claims contract fail the AuthGuard.
    const response = await request(app.getHttpServer())
      .post('/identity/human-authorization/recovery-tokens')
      .set('Authorization', `Bearer ${deviceToken()}`)
      .send({ terminalId: 'Q802024120001', reason: 'test' })
      .expect(401);
    expect(recoveryTokenService.issue).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty('token');
  });

  it('denies the human path on the device redeem route: a valid human session JWT cannot redeem', async () => {
    // The identity JWT fails the SyncTransportGuard's device-secret
    // verification: the human transport can never carry a redemption.
    const response = await request(app.getHttpServer())
      .post('/v1/sync/inbound/human-authorization/recovery/redeem')
      .set('Authorization', `Bearer ${humanToken()}`)
      .send(redeemBody)
      .expect(401);
    expect(
      inboundSyncService.redeemHumanAuthorizationRecoveryToken,
    ).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty('receipt');
  });

  it('denies even a cryptographically valid device token without a provisioned ACTIVE credential on the redeem route', async () => {
    // The transport guard verifies the signature, then looks the credential
    // up in the store: no ACTIVE device-sync credential, no redemption.
    await request(app.getHttpServer())
      .post('/v1/sync/inbound/human-authorization/recovery/redeem')
      .set('Authorization', `Bearer ${deviceToken()}`)
      .send(redeemBody)
      .expect(401);
    expect(
      inboundSyncService.redeemHumanAuthorizationRecoveryToken,
    ).not.toHaveBeenCalled();
  });

  it('lets a human OWNER/MANAGER session reach the issuance handler (200-family through the full human guard chain)', async () => {
    recoveryTokenService.issue.mockResolvedValue({
      tokenId: 'token-1',
      token: `ohr1.token-1.${'s'.repeat(43)}`,
      expiresAt: new Date('2026-09-28T12:15:00Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/identity/human-authorization/recovery-tokens')
      .set('Authorization', `Bearer ${humanToken()}`)
      .send({ terminalId: 'Q802024120001', reason: 'e2e' })
      .expect(201);

    expect(response.body).toMatchObject({ tokenId: 'token-1' });
    expect(response.body.token).toMatch(/^ohr1\.token-1\./);
    // Never echoed twice: the mock is the one-time secret holder.
    recoveryTokenService.issue.mockReset();
  });
});
