import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { CreateTenantTopologyRevisions1794000000000 } from '../../src/migrations/1794000000000-CreateTenantTopologyRevisions';
import { AddTenantTopologyRevisionsRls1794000000001 } from '../../src/migrations/1794000000001-AddTenantTopologyRevisionsRls';
import { FulfillmentModule } from '../../src/modules/fulfillment/fulfillment.module';
import { TenantTopologyRevision } from '../../src/modules/fulfillment/entities/tenant-topology-revision.entity';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { signIdentityJwtAccessToken } from '../support/identity-jwt-test.fixture';

describe('FulfillmentTopology (e2e - Real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let adminSource: DataSource;
  let jwtService: JwtService;
  let schema: string;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const ownerAId = randomUUID();
  const cashierAId = randomUUID();
  const ownerBId = randomUUID();

  let ownerAToken: string;
  let cashierAToken: string;
  let ownerBToken: string;

  const postgresConnection = {
    type: 'postgres' as const,
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'omnifood',
  };

  beforeAll(async () => {
    schema = `e2e_topo_${randomUUID().replace(/-/g, '')}`;

    adminSource = new DataSource({
      ...postgresConnection,
    });
    await adminSource.initialize();
    const runner = adminSource.createQueryRunner();
    await runner.connect();

    // Create isolated schema
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}", public`);

    // Run migrations inside isolated schema
    const m1 = new CreateTenantTopologyRevisions1794000000000();
    const m2 = new AddTenantTopologyRevisionsRls1794000000001();
    await m1.up(runner);
    await m2.up(runner);

    // Seed tenants and users in public tables for auth & AuthoritativeCurrentUserGuard
    await runner.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES
       ($1, 'Tenant A', now(), now()),
       ($2, 'Tenant B', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [tenantAId, tenantBId],
    );

    await runner.query(
      `INSERT INTO users (id, tenant_id, name, email, role, is_active, security_version, created_at, updated_at) VALUES
       ($1, $2, 'Owner A', 'owner.a@test.com', 'OWNER', true, 1, now(), now()),
       ($3, $2, 'Cashier A', 'cashier.a@test.com', 'CASHIER', true, 1, now(), now()),
       ($4, $5, 'Owner B', 'owner.b@test.com', 'OWNER', true, 1, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [ownerAId, tenantAId, cashierAId, ownerBId, tenantBId],
    );

    await runner.release();

    // Bootstrap Nest testing module with real DB
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
              JWT_ISSUER: 'omnifood-admin',
              JWT_AUDIENCE: 'omnifood-pos',
              JWT_ACCESS_TTL_SECONDS: '3600',
              JWT_REFRESH_TTL_SECONDS: '604800',
              JWT_CLOCK_TOLERANCE_SECONDS: '5',
              JWT_ALGORITHM: 'HS256',
            }),
          ],
        }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          ...postgresConnection,
          entities: [
            Tenant,
            User,
            SecurityProfile,
            AuditLog,
            AuditIntegrityAlert,
            TenantTopologyRevision,
          ],
          synchronize: false,
          extra: { options: `-c search_path=${schema},public` },
        }),
        IdentityModule,
        FulfillmentModule,
      ],
    }).compile();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Sign test tokens
    ownerAToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerAId,
      email: 'owner.a@test.com',
      tenant_id: tenantAId,
      role: UserRole.OWNER,
      security_version: 1,
    });

    cashierAToken = signIdentityJwtAccessToken(jwtService, {
      sub: cashierAId,
      email: 'cashier.a@test.com',
      tenant_id: tenantAId,
      role: UserRole.CASHIER,
      security_version: 1,
    });

    ownerBToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerBId,
      email: 'owner.b@test.com',
      tenant_id: tenantBId,
      role: UserRole.OWNER,
      security_version: 1,
    });

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 45000);

  afterAll(async () => {
    try {
      if (app) await app.close();
      if (adminSource && adminSource.isInitialized) {
        const runner = adminSource.createQueryRunner();
        await runner.connect();
        await runner.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [
          ownerAId,
          cashierAId,
          ownerBId,
        ]);
        await runner.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [
          tenantAId,
          tenantBId,
        ]);
        await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await runner.release();
        await adminSource.destroy();
      }
    } catch {
      // cleanup best effort
    }
  }, 30000);

  describe('GET /api/fulfillment/topology/current', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/fulfillment/topology/current')
        .expect(401);
    });

    it('returns unprovisioned state (revision 0) for a new tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/fulfillment/topology/current')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .expect(200);

      expect(response.body).toEqual({
        provisioned: false,
        revision: 0,
      });
    });
  });

  describe('POST /api/fulfillment/topology/revisions', () => {
    const validTopology = {
      operationMode: 'FOOD_PARK',
      channels: ['KDS_AND_PRINT'],
      devices: [
        {
          deviceId: 'pos-main',
          roles: ['CASHIER', 'KITCHEN'],
          capabilities: ['KDS', 'PRINT'],
        },
      ],
    };

    it('rejects CASHIER role with 403 Forbidden (only OWNER allowed)', async () => {
      await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          baseRevision: 0,
          contractVersion: 1,
          topology: validTopology,
          hash: 'hash-001',
        })
        .expect(403);
    });

    it('rejects invalid payload with 400 Bad Request via ValidationPipe', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          baseRevision: -1, // invalid: must be >= 0
          contractVersion: 0, // invalid: must be >= 1
          topology: {}, // invalid: must not be empty
          // missing hash
        })
        .expect(400);

      const body = response.body as { message?: unknown };
      expect(body.message).toBeDefined();
    });

    it('provisions revision 1 for tenant A when OWNER posts with baseRevision 0', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          baseRevision: 0,
          contractVersion: 1,
          topology: validTopology,
          hash: 'hash-rev-1',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        provisioned: true,
        tenantId: tenantAId,
        revision: 1,
        contractVersion: 1,
        topology: validTopology,
        hash: 'hash-rev-1',
      });

      // Verify that GET /current now returns the newly created revision 1
      const currentRes = await request(app.getHttpServer())
        .get('/api/fulfillment/topology/current')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .expect(200);

      expect(currentRes.body).toMatchObject({
        provisioned: true,
        tenantId: tenantAId,
        revision: 1,
        hash: 'hash-rev-1',
      });
    });

    it('rejects stale baseRevision with 409 Conflict', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          baseRevision: 0, // stale: current revision is 1!
          contractVersion: 1,
          topology: validTopology,
          hash: 'hash-conflict',
        })
        .expect(409);

      expect(response.body).toMatchObject({
        baseRevision: 0,
        currentRevision: 1,
      });
    });

    it('provisions revision 2 when OWNER uses correct baseRevision 1', async () => {
      const updatedTopology = {
        ...validTopology,
        operationMode: 'RESTAURANT',
      };

      const response = await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          baseRevision: 1,
          contractVersion: 1,
          topology: updatedTopology,
          hash: 'hash-rev-2',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        provisioned: true,
        tenantId: tenantAId,
        revision: 2,
        topology: updatedTopology,
        hash: 'hash-rev-2',
      });
    });

    it('guarantees tenant isolation: Tenant B remains unprovisioned and isolated', async () => {
      // Tenant B queries current -> must be provisioned: false, revision: 0
      const resB = await request(app.getHttpServer())
        .get('/api/fulfillment/topology/current')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(200);

      expect(resB.body).toEqual({
        provisioned: false,
        revision: 0,
      });

      // Tenant B can provision its own revision 1 independently
      const createB = await request(app.getHttpServer())
        .post('/api/fulfillment/topology/revisions')
        .set('Authorization', `Bearer ${ownerBToken}`)
        .send({
          baseRevision: 0,
          contractVersion: 1,
          topology: validTopology,
          hash: 'hash-tenant-b-1',
        })
        .expect(201);

      expect(createB.body).toMatchObject({
        provisioned: true,
        tenantId: tenantBId,
        revision: 1,
        hash: 'hash-tenant-b-1',
      });

      // Tenant A is still at revision 2
      const resA = await request(app.getHttpServer())
        .get('/api/fulfillment/topology/current')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .expect(200);

      expect(resA.body).toMatchObject({
        tenantId: tenantAId,
        revision: 2,
      });
    });
  });
});
