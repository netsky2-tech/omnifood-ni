import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import {
  OnboardingFeatureRolloutService,
  OnboardingFeatureFlag,
} from '../../src/modules/onboarding/services/onboarding-feature-rollout.service';
import { OnboardingRolloutController } from '../../src/modules/onboarding/controllers/onboarding-rollout.controller';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('ONB1.10E: Feature Rollout & Cutover Sequence Verification (PostgreSQL Real DB)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rolloutService: OnboardingFeatureRolloutService;
  let jwtService: JwtService;
  let tenantAId: string;
  let tenantBId: string;
  let ownerTokenA: string;
  let cashierTokenA: string;
  let schema: string;
  let bootstrap: DataSource;

  beforeAll(async () => {
    bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
    await bootstrap.initialize();
    schema = `rollout_${randomUUID().replace(/-/g, '')}`;
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [Tenant, User, SecurityProfile],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    tenantAId = randomUUID();
    tenantBId = randomUUID();
    const ownerUserId = randomUUID();
    const cashierUserId = randomUUID();

    await dataSource.getRepository(Tenant).save([
      { id: tenantAId, name: 'Tenant Rollout A', is_active: true },
      { id: tenantBId, name: 'Tenant Rollout B', is_active: true },
    ]);

    await dataSource.getRepository(User).save([
      {
        id: ownerUserId,
        tenant_id: tenantAId,
        name: 'Owner User',
        email: 'owner@omnifood.ni',
        password_hash: 'hash',
        role: UserRole.OWNER,
        is_active: true,
      },
      {
        id: cashierUserId,
        tenant_id: tenantAId,
        name: 'Cashier User',
        email: 'cashier@omnifood.ni',
        password_hash: 'hash',
        role: UserRole.CASHIER,
        is_active: true,
      },
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingRolloutController],
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: DataSource, useValue: dataSource },
        { provide: 'TenantRepository', useValue: dataSource.getRepository(Tenant) },
        { provide: 'UserRepository', useValue: dataSource.getRepository(User) },
        { provide: 'SecurityProfileRepository', useValue: dataSource.getRepository(SecurityProfile) },
        OnboardingFeatureRolloutService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    rolloutService = moduleFixture.get<OnboardingFeatureRolloutService>(
      OnboardingFeatureRolloutService,
    );

    ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: ownerUserId,
      email: 'owner@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantAId,
    });
    cashierTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: cashierUserId,
      email: 'cashier@omnifood.ni',
      role: UserRole.CASHIER,
      tenant_id: tenantAId,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  });

  it('enforces RBAC: Cashier is rejected with 403 on rollout controls', async () => {
    const res = await request(app.getHttpServer())
      .post('/onboarding/rollout/stage')
      .set('Authorization', `Bearer ${cashierTokenA}`)
      .send({ stage: 1 });
    expect(res.status).toBe(403);
  });

  it('verifies progressive cutover execution through 10 ordered stages', async () => {
    // Stage 1: session_v1 enabled
    const s1Res = await request(app.getHttpServer())
      .post('/onboarding/rollout/stage')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ stage: 1 });
    expect(s1Res.status).toBe(200);
    expect(s1Res.body.stage).toBe(1);
    expect(s1Res.body.flags[OnboardingFeatureFlag.SESSION_V1]).toBe(true);
    expect(s1Res.body.flags[OnboardingFeatureFlag.ACTIVATION_V1]).toBe(false);

    // Stage 6: required_config_v1 enabled
    const s6Res = await request(app.getHttpServer())
      .post('/onboarding/rollout/stage')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ stage: 6 });
    expect(s6Res.status).toBe(200);
    expect(s6Res.body.flags[OnboardingFeatureFlag.REQUIRED_CONFIG_V1]).toBe(true);
    expect(s6Res.body.flags[OnboardingFeatureFlag.ACTIVATION_V1]).toBe(false);

    // Stage 10: founder tenant pilot (all flags enabled)
    const s10Res = await request(app.getHttpServer())
      .post('/onboarding/rollout/stage')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ stage: 10 });
    expect(s10Res.status).toBe(200);
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      expect(s10Res.body.flags[flag]).toBe(true);
    }
  });

  it('preserves multi-tenant isolation: Tenant B remains unconfigured when Tenant A advances', async () => {
    expect(rolloutService.isEnabled(tenantBId, OnboardingFeatureFlag.ACTIVATION_V1)).toBe(false);
    expect(rolloutService.isEnabled(tenantAId, OnboardingFeatureFlag.ACTIVATION_V1)).toBe(true);
  });

  it('rejects invalid cutover stage payload (< 1 or > 10)', async () => {
    const errRes = await request(app.getHttpServer())
      .post('/onboarding/rollout/stage')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ stage: 99 });
    expect(errRes.status).toBe(400);
  });

  it('reverts all flags on rollback call (ONB1.10G)', async () => {
    const rollbackRes = await request(app.getHttpServer())
      .post('/onboarding/rollout/rollback')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send();
    expect(rollbackRes.status).toBe(200);
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      expect(rollbackRes.body.flags[flag]).toBe(false);
    }
  });
});
