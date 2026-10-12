import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { CatalogValue } from '../../src/modules/catalog/entities/catalog-value.entity';
import { ModifierGroup } from '../../src/modules/modifiers/entities/modifier-group.entity';
import { ModifierOption } from '../../src/modules/modifiers/entities/modifier-option.entity';
import { CategoryModifierGroup } from '../../src/modules/modifiers/entities/category-modifier-group.entity';
import { ProductModifierGroup } from '../../src/modules/modifiers/entities/product-modifier-group.entity';
import { ModifiersService } from '../../src/modules/modifiers/services/modifiers.service';
import { ModifiersController } from '../../src/modules/modifiers/controllers/modifiers.controller';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

/**
 * BROWSER PAYLOAD FIXTURE — the artifact that pins the client-reported
 * defect at the contract level.
 *
 * This JSON is the exact body the owner dashboard sends to
 * `POST /modifier-groups/:groupId/options` when the operator saves a
 * modifier group whose option carries the decimal the API used to return:
 *
 *   - Producer: `apps/owner_dashboard/src/features/modifiers/modifier-group-form.tsx`,
 *     the option editor rows inside `onSubmit` (each row becomes
 *     `createOption.mutateAsync({ groupId, input: { name, price_delta,
 *     is_default, sort_order } })`). Before the dashboard-side fix, an
 *     option row's `price_delta` was seeded straight from the API response,
 *     where node-postgres had handed the Postgres `numeric(12,2)` over as
 *     the STRING `"0.00"` — so the form displayed 0.00 and echoed the same
 *     string back on save.
 *   - Regression pin: `modifier-group-form.test.tsx`, test
 *     "surfaces a string decimal from the real wire shape as a
 *     submit-ready number", which asserts on the actual mutation payload
 *     that `typeof payload.price_delta === 'number'`.
 *   - Pre-fix, this exact body was rejected by the backend `@IsNumber()`
 *     on `price_delta` (the operator's workaround was typing `0` by hand,
 *     which re-fired `onChange` with `valueAsNumber` and produced a real
 *     number). The dashboard now normalizes at its API boundary AND the
 *     backend DTOs coerce numerically-valid strings before validation, so
 *     this payload must be ACCEPTED — asserted below against the real app
 *     and the real PostgreSQL database.
 *
 * Loaded with `require` (not an ES import) because the backend tsconfig
 * does not enable `resolveJsonModule`.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- fixture JSON cannot be imported statically (resolveJsonModule is off) and prettier's reflow pushes the call past a next-line directive */
const browserCreateOptionPayload = require('../fixtures/modifiers/browser-create-option-payload.json') as {
  name: string;
  price_delta: unknown;
  is_default: boolean;
  sort_order: number;
};
/* eslint-enable @typescript-eslint/no-require-imports */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for DB-backed E2E tests`);
  return value;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

/**
 * Same isolated-schema bootstrapping as
 * test/inventory/product-routes.db.e2e-spec.ts: a throwaway PostgreSQL
 * schema (unique per test run via a random UUID suffix) holding ONLY the
 * entities this module touches, synchronized from the TypeORM entities so
 * `modifier_options.price_delta` is a real `numeric(12,2)` column — the
 * exact column type that makes node-postgres return decimals as strings.
 * The schema is dropped (CASCADE) in the finally block, so other e2e specs
 * sharing this database instance never see this run's rows.
 */
async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        Product,
        CatalogValue,
        ModifierGroup,
        ModifierOption,
        CategoryModifierGroup,
        ProductModifierGroup,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantId = randomUUID();
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
      [tenantId, `E2E Tenant ${schemaPrefix}`, normalizeTenantSlug(`E2E Tenant ${schemaPrefix}`)],
    );

    // The REAL ModifiersService over the REAL (schema-isolated) DataSource —
    // its repository constructor arguments are declared for Nest DI
    // compatibility only; every operation runs through
    // runInTenantTransaction(dataSource, ...) with the manager.
    const modifiersService = new ModifiersService(
      dataSource.getRepository(ModifierGroup),
      dataSource.getRepository(ModifierOption),
      dataSource.getRepository(CategoryModifierGroup),
      dataSource.getRepository(ProductModifierGroup),
      dataSource,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ModifiersController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        TenantInterceptor,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: ModifiersService, useValue: modifiersService },
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    const jwtService = app.get(JwtService);

    await assertion({ app, dataSource, jwtService, tenantId });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

/**
 * Strict wire-level type assertion: `price_delta` must arrive as a JSON
 * NUMBER on every path, never as a string. Deliberately NOT normalized —
 * `Number(...)` here would defeat the whole point of the contract.
 */
function expectNumberPriceDelta(body: { price_delta: unknown }): void {
  expect(typeof body.price_delta).toBe('number');
}

describe('Modifiers decimal wire contract E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  /**
   * Creates a modifier group through the API (the first half of the
   * dashboard's save flow) and returns its id.
   */
  async function createGroup(
    app: INestApplication,
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; body: Record<string, unknown> }> {
    const res = await request(app.getHttpServer())
      .post('/modifier-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Leche ${randomUUID().slice(0, 8)}`,
        min_selected: 0,
        max_selected: 3,
        allow_quantities: false,
        sort_order: 0,
        ...overrides,
      })
      .expect(201);
    return { id: res.body.id, body: res.body };
  }

  it(
    'accepts the browser payload that echoes price_delta as the string "0.00" (client-reported defect replay)',
    async () => {
      await withIsolatedSchema(
        'e2e_mod_browser_echo',
        async ({ app, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          const { id: groupId } = await createGroup(app, token);

          // The exact body the dashboard produced pre-fix: price_delta is
          // the STRING the API used to return, echoed back untouched.
          expect(browserCreateOptionPayload.price_delta).toBe('0.00');
          expect(typeof browserCreateOptionPayload.price_delta).toBe('string');

          // 201 (not 400): the old @IsNumber()-only DTO rejected this body;
          // the numericStringToNumber transform must coerce it first.
          const res = await request(app.getHttpServer())
            .post(`/modifier-groups/${groupId}/options`)
            .set('Authorization', `Bearer ${token}`)
            .send(browserCreateOptionPayload)
            .expect(201);

          expect(res.body.id).toBeDefined();
          expect(res.body.name).toBe(browserCreateOptionPayload.name);
          expectNumberPriceDelta(res.body);
          expect(res.body.price_delta).toBe(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'returns price_delta as a JSON number on every read path (create, list, findOne, effective)',
    async () => {
      await withIsolatedSchema(
        'e2e_mod_wire_number',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          const { id: groupId } = await createGroup(app, token);

          const createRes = await request(app.getHttpServer())
            .post(`/modifier-groups/${groupId}/options`)
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: 'Entera',
              price_delta: 15.25,
              is_default: false,
              sort_order: 0,
            })
            .expect(201);
          expectNumberPriceDelta(createRes.body);
          expect(createRes.body.price_delta).toBe(15.25);
          const optionId = createRes.body.id as string;

          // Reachable effective-groups resolution: attach the group to a
          // product of this tenant, then resolve GET /effective.
          const productId = randomUUID();
          await dataSource.query(
            `INSERT INTO products (id, tenant_id, name, uom, product_type, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
             VALUES ($1, $2, 'Café', 'un', 'SIMPLE', 0, 0, 25, true, false, now(), now())`,
            [productId, tenantId],
          );
          await request(app.getHttpServer())
            .post(`/modifier-groups/${groupId}/products`)
            .set('Authorization', `Bearer ${token}`)
            .send({ product_id: productId })
            .expect(201);

          // LIST — GET /modifier-groups
          const listRes = await request(app.getHttpServer())
            .get('/modifier-groups')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          const listedOption = listRes.body
            .find((g: { id: string }) => g.id === groupId)
            ?.options?.find((o: { id: string }) => o.id === optionId);
          expect(listedOption).toBeDefined();
          expectNumberPriceDelta(listedOption);
          expect(listedOption.price_delta).toBe(15.25);

          // FIND ONE — GET /modifier-groups/:id
          const oneRes = await request(app.getHttpServer())
            .get(`/modifier-groups/${groupId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          const oneOption = oneRes.body.options.find(
            (o: { id: string }) => o.id === optionId,
          );
          expect(oneOption).toBeDefined();
          expectNumberPriceDelta(oneOption);
          expect(oneOption.price_delta).toBe(15.25);

          // EFFECTIVE GROUPS — GET /modifier-groups/effective?product_id=…
          const effRes = await request(app.getHttpServer())
            .get(`/modifier-groups/effective?product_id=${productId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
          expect(effRes.body).toHaveLength(1);
          expect(effRes.body[0].group_id).toBe(groupId);
          expect(effRes.body[0].options[0].id).toBe(optionId);
          expectNumberPriceDelta(effRes.body[0].options[0]);
          expect(effRes.body[0].options[0].price_delta).toBe(15.25);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'still rejects a genuinely non-numeric price_delta ("abc") — the tolerance is not a hole',
    async () => {
      await withIsolatedSchema(
        'e2e_mod_reject_abc',
        async ({ app, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          const { id: groupId } = await createGroup(app, token);

          const res = await request(app.getHttpServer())
            .post(`/modifier-groups/${groupId}/options`)
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: 'Entera',
              price_delta: 'abc',
              is_default: false,
              sort_order: 0,
            })
            .expect(400);
          // The rejection is the VALIDATOR's, not a generic error: the body
          // names the offending field.
          expect(JSON.stringify(res.body)).toContain('price_delta');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'coerces an integer field sent as a numeric string ("2") and still rejects a fractional value',
    async () => {
      await withIsolatedSchema(
        'e2e_mod_int_coercion',
        async ({ app, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          // Integer-as-string is accepted and coerced.
          const coerced = await createGroup(app, token, {
            name: `Mínimo texto ${randomUUID().slice(0, 8)}`,
            min_selected: '2',
          });
          expect(typeof coerced.body.min_selected).toBe('number');
          expect(coerced.body.min_selected).toBe(2);

          // A fractional value for an integer field is still rejected.
          await request(app.getHttpServer())
            .post('/modifier-groups')
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: `Mínimo fraccional ${randomUUID().slice(0, 8)}`,
              min_selected: '1.5',
              max_selected: 3,
              allow_quantities: false,
              sort_order: 0,
            })
            .expect(400);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'persists the decimal exactly (DB round trip) — the response coercion is not cosmetic',
    async () => {
      await withIsolatedSchema(
        'e2e_mod_roundtrip',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          const { id: groupId } = await createGroup(app, token);

          // Negative decimals are legitimate (discount modifiers) and the
          // browser echoes them as strings too: "-2.50" in, number out.
          const res = await request(app.getHttpServer())
            .post(`/modifier-groups/${groupId}/options`)
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: 'Sin cebolla',
              price_delta: '-2.50',
              is_default: false,
              sort_order: 0,
            })
            .expect(201);
          expectNumberPriceDelta(res.body);
          expect(res.body.price_delta).toBe(-2.5);
          const optionId = res.body.id as string;

          // Read the persisted column back from PostgreSQL through the RAW
          // driver: node-postgres returns `numeric(12,2)` as text, so the
          // persisted value surfaces as the string "-2.50" — exactly the
          // pre-fix wire shape. The stored decimal must match the accepted
          // input exactly, proving the response coercion happened after
          // persistence, not instead of it.
          const rows = await dataSource.query(
            `SELECT price_delta FROM modifier_options WHERE id = $1 AND tenant_id = $2`,
            [optionId, tenantId],
          );
          expect(rows).toHaveLength(1);
          expect(typeof rows[0].price_delta).toBe('string');
          expect(rows[0].price_delta).toBe('-2.50');
          expect(Number(rows[0].price_delta)).toBe(-2.5);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
