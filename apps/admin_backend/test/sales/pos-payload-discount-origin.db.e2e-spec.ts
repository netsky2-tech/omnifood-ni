import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, type QueryRunner } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { ProductInventoryMappingVersion } from '../../src/modules/inventory/entities/product-inventory-mapping-version.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../src/modules/inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import { SyncCreditNoteAuthGuard } from '../../src/modules/sales/guards/sync-credit-note-auth.guard';
import { SyncBatchController } from '../../src/modules/sales/controllers/sync-batch.controller';
import { InvoicesService } from '../../src/modules/sales/services/invoices.service';
import { ReplaceDiscountOriginWithBreakdown1809630000000 } from '../../src/migrations/1809630000000-ReplaceDiscountOriginWithBreakdown';
import type { SyncBatchRecordDto } from '../../src/modules/sales/dto/sync-batch.dto';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

/**
 * THE POS's REAL sync payload, replayed against the REAL backend over a REAL
 * PostgreSQL database — the missing end-to-end verification for the
 * discount-origin work (SOHO P3, D-A2). Everything before this spec was
 * unit/widget level against mappers; mocks and hand-built payloads hide the
 * schema, and a test that fabricates its input does not prove production
 * builds that input.
 *
 * FIXTURE PROVENANCE (the comment the sibling fixture cannot carry):
 *
 *   - Producer: `apps/pos_app/lib/data/services/activation_controlled_sale_runner.dart`,
 *     the idempotent rebuild path — the payload is the queued batch record
 *     the runner persists for sync (the VERIFICATION_SALE outbox envelope),
 *     built from the PERSISTED SQLite rows through the exact production wire
 *     builder: `SalesMapper.toSyncJson` + `SyncService.buildSalesSyncRecord`.
 *   - Scenario: a MIXED discount provenance checkout — a REAL 10% category
 *     promotion on the beer line PLUS a REAL manual order discount of 30.00
 *     driven through `SaleViewModel.processSale` (real promotion engine,
 *     real fiscal calculator, real discount-origin allocator), persisted
 *     through the REAL `SalesRepositoryImpl.saveSale` with only the sale's
 *     identity (ids/timestamps) pinned for reproducibility.
 *   - Capturing test (the two apps are bound by this one artifact):
 *     `apps/pos_app/test/data/services/activation_controlled_sale_runner_test.dart`,
 *     group "SOHO P3 cross-app fixture — REAL producer chain for the
 *     discount-origin wire payload", test "producer + pin: the persisted
 *     VERIFICATION_SALE payload ... equals the committed backend fixture
 *     EXACTLY". Re-capture with
 *     `POS_CAPTURE_DISCOUNT_ORIGIN_FIXTURE=1 flutter test --concurrency=1
 *     test/data/services/activation_controlled_sale_runner_test.dart` — the
 *     producer test re-creates these bytes byte for byte, and its pin
 *     assertion deep-equals them against this file.
 *
 * Loaded with `require` (not an ES import) because the backend tsconfig does
 * not enable `resolveJsonModule` (same as the modifier fixture spec).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const posRecordPayload = require('../fixtures/sales/pos-discount-origin-payload.json') as SyncBatchRecordDto;

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

const CHECK_NAME = 'chk_invoice_items_discount_origin_breakdown';

/**
 * Isolated throwaway schema per run (same pattern as
 * test/modifiers/modifier-decimals.db.e2e-spec.ts): `synchronize: true`
 * builds the columns from the entities — which does NOT create the CHECK
 * constraint migration 1809630000000 adds — so the migration class itself is
 * applied to the throwaway schema to arm
 * `chk_invoice_items_discount_origin_breakdown` exactly the way production
 * arms it. The schema is dropped (CASCADE) in the finally block.
 */
async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication<App>;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
    checkRowsBeforeArming: Array<{ conname: string }>;
    checkDefAfterArming: { conname: string; definition: string } | null;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let queryRunner: QueryRunner | null = null;
  let app: INestApplication<App> | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        InventorySyncReceipt,
        InventorySyncOutbox,
        InventoryMovement,
        Insumo,
        UomConversion,
        Product,
        ProductInventoryMappingVersion,
      ],
      synchronize: true,
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${schema},public -c statement_timeout=15000`,
      },
    });
    await dataSource.initialize();

    // THE ARMING PROOF, part 1: a schema created only by synchronize has
    // NO discount-origin CHECK — proving nothing about it.
    const checkRowsBeforeArming = (await dataSource.query(
      `SELECT conname FROM pg_constraint
        WHERE conname = $1 AND conrelid = 'invoice_items'::regclass`,
      [CHECK_NAME],
    )) as Array<{ conname: string }>;

    // THE ARMING: apply the REAL migration class to the throwaway schema
    // (the column synchronize built is already jsonb, so up() takes its
    // idempotent branch and ensures the constraint — the exact constraint
    // SQL production runs).
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await new ReplaceDiscountOriginWithBreakdown1809630000000().up(queryRunner);
    await queryRunner.query(`SET search_path TO public`);

    const checkRowsAfterArming = (await dataSource.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conname = $1 AND conrelid = 'invoice_items'::regclass`,
      [CHECK_NAME],
    )) as Array<{ conname: string; definition: string }>;

    const tenantId = randomUUID();
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        id: tenantId,
        name: `POS Fixture Replay ${schemaPrefix}`,
        slug: `pos-fixture-replay-${schemaPrefix}-${randomUUID().slice(0, 8)}`,
      }),
    );

    // The REAL InvoicesService over the REAL (schema-isolated) DataSource —
    // the same construction the db-backed service spec uses; only the
    // recipe/BOM collaborators are stubs (this sale carries no recipe
    // version bindings).
    const invoicesService = new InvoicesService(
      dataSource,
      dataSource.getRepository(Invoice),
      dataSource.getRepository(InvoiceItem),
      dataSource.getRepository(Payment),
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'authorizing-user',
          tenant_id: tenantId,
          role: UserRole.MANAGER,
          is_active: true,
        }),
      } as never,
      dataSource.getRepository(InventoryMovement),
      dataSource.getRepository(InventorySyncReceipt),
      dataSource.getRepository(InventorySyncOutbox),
      { findActiveVersion: jest.fn().mockResolvedValue(null) } as never,
      { explode: jest.fn() } as never,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        JwtService,
        AuthGuard,
        SyncCreditNoteAuthGuard,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    })
      .overrideGuard(SyncTransportGuard)
      // Same override test/sales/sync-batch.e2e-spec.ts uses: the transport
      // guard's device-credential machinery is out of scope here; the REAL
      // AuthGuard, credit-note guard, ValidationPipe (production config) and
      // REAL service+DB are the system under test.
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    const jwtService = app.get(JwtService);
    app.use((req: Request, _res: Response, next: NextFunction): void => {
      (req as Request & { user?: unknown }).user = {
        tenant_id: tenantId,
        sub: 'pos-replay-user',
        email: 'pos-replay@example.test',
        role: 'owner',
      };
      next();
    });
    // EXACT production configuration (src/main.ts:49-53).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantId,
      checkRowsBeforeArming,
      checkDefAfterArming: checkRowsAfterArming[0] ?? null,
    });
  } finally {
    if (app) await app.close();
    try {
      if (queryRunner) {
        await queryRunner.release();
      }
    } catch {
      // no-op: cleanup is best effort when arming failed
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

interface PersistedBreakdownRow {
  discount_origin: {
    promotion?: number;
    manual?: number;
    loyalty?: number;
  } | null;
  discount: string;
}

describe('POS discount-origin payload replay E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'accepts the EXACT POS fixture record end to end through the production ValidationPipe and persists the breakdown',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_replay_accept',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });
          const fixtureItems =
            (posRecordPayload.invoice as unknown as Record<string, unknown>).items as Array<
              Record<string, unknown>
            >;
          const beerItem = fixtureItems.find(
            (item) => item.discountOrigin !== undefined,
          ) as Record<string, unknown>;

          // The record is the byte-captured artifact the runner persisted —
          // not rebuilt, not normalized here.
          const res = await request(app.getHttpServer())
            .post('/v1/sync/batch')
            .set('Authorization', `Bearer ${token}`)
            .send({ records: [posRecordPayload] })
            .expect(201);

          expect(res.body.status).toBe('success');
          // Production answers ACCEPTED with the inventory-outcome-aware
          // APPLIED_NO_INVENTORY_IMPACT code for this sale (no insumo
          // mappings on the fixture products).
          expect(res.body.results[0]).toEqual(
            expect.objectContaining({
              idempotencyKey: posRecordPayload.idempotencyKey,
              status: 'ACCEPTED',
              code: 'APPLIED_NO_INVENTORY_IMPACT',
            }),
          );

          // The persisted invoice_items row carries the breakdown: the
          // stored jsonb equals the payload's per-line discountOrigin and
          // the per-line discount is unchanged.
          const rows = (await dataSource.query(
            `SELECT discount_origin, discount FROM invoice_items
              WHERE id = $1 AND tenant_id = $2`,
            [beerItem.id, tenantId],
          )) as PersistedBreakdownRow[];
          expect(rows).toHaveLength(1);
          expect(rows[0].discount_origin).toEqual(beerItem.discountOrigin);
          expect(Number(rows[0].discount)).toBe(beerItem.discount as number);

          const otherItem = fixtureItems.find(
            (item) => item !== beerItem,
          ) as Record<string, unknown>;
          const otherRows = (await dataSource.query(
            `SELECT discount_origin, discount FROM invoice_items
              WHERE id = $1 AND tenant_id = $2`,
            [otherItem.id, tenantId],
          )) as PersistedBreakdownRow[];
          expect(otherRows).toHaveLength(1);
          expect(otherRows[0].discount_origin).toEqual(
            otherItem.discountOrigin,
          );
          expect(Number(otherRows[0].discount)).toBe(
            otherItem.discount as number,
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'arms chk_invoice_items_discount_origin_breakdown: synchronize alone does NOT create it, the migration class does',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_replay_arm',
        async ({ checkRowsBeforeArming, checkDefAfterArming }) => {
          // synchronize built invoice_items WITHOUT the CHECK — a schema
          // created only by synchronize silently proves nothing about it.
          expect(checkRowsBeforeArming).toHaveLength(0);
          // After applying the REAL migration class the constraint exists
          // and guards the jsonb breakdown. pg_get_constraintdef renders the
          // members inside ARRAY[...] with per-element ::text casts, so the
          // three origin names are asserted individually.
          expect(checkDefAfterArming).not.toBeNull();
          expect(checkDefAfterArming!.conname).toBe(CHECK_NAME);
          expect(checkDefAfterArming!.definition).toContain('discount_origin');
          expect(checkDefAfterArming!.definition).toContain('manual');
          expect(checkDefAfterArming!.definition).toContain('promotion');
          expect(checkDefAfterArming!.definition).toContain('loyalty');
          expect(checkDefAfterArming!.definition).toContain(
            "<> '{}'::jsonb",
          );
          expect(checkDefAfterArming!.definition).toContain(
            'jsonb_path_exists',
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  describe('the CHECK constraint bites at the DATABASE layer (no DTO, no ValidationPipe involved)', () => {
    /**
     * Persists a fresh copy of the accepted fixture sale's discounted item
     * row with an INVALID breakdown, straight through the repository: no
     * ValidationPipe, no DTO validator — the only thing that can reject is
     * the migration's CHECK (SQLSTATE 23514). The DTO-level rejections for
     * the same three shapes are already proven at the HTTP boundary by
     * test/sales/sync-batch.e2e-spec.ts ("rejects an unknown KEY / a
     * NEGATIVE amount / a ZERO amount inside the discount_origin breakdown
     * and refuses the WHOLE batch before the sync service runs") and are
     * deliberately NOT duplicated here.
     */
    async function expectCheckViolation(
      dataSource: DataSource,
      fixtureItem: Record<string, unknown>,
      tenantId: string,
      invalidBreakdown: Record<string, number>,
    ): Promise<void> {
      const persisted = await dataSource
        .getRepository(InvoiceItem)
        .findOneByOrFail({ id: fixtureItem.id as string });

      const violation = dataSource.getRepository(InvoiceItem).create({
        tenant_id: tenantId,
        invoiceId: persisted.invoiceId,
        productId: persisted.productId,
        productName: persisted.productName,
        quantity: persisted.quantity,
        unitPrice: persisted.unitPrice,
        originalTaxRate: persisted.originalTaxRate,
        appliedTaxRate: persisted.appliedTaxRate,
        taxAmount: persisted.taxAmount,
        total: persisted.total,
        discount: persisted.discount,
        discountOrigin: invalidBreakdown,
      });
      violation.id = randomUUID();

      const error = await dataSource
        .getRepository(InvoiceItem)
        .insert(violation)
        .then(
          () => null,
          (insertError: { code?: string; constraint?: string; message?: string }) =>
            insertError,
        );

      // THE CHECK produced the rejection — not a TypeScript guard: the row
      // never passed the ValidationPipe, and the failure is PostgreSQL's
      // check-violation SQLSTATE naming the migration's constraint.
      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
      expect(
        error!.constraint ?? String(error!.message),
      ).toContain(CHECK_NAME);
    }

    it(
      'rejects an UNKNOWN KEY ({bossDiscount: 5}) with SQLSTATE 23514 from the CHECK',
      async () => {
        await withIsolatedSchema(
          'e2e_pos_replay_chk_unknown',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });
            await request(app.getHttpServer())
              .post('/v1/sync/batch')
              .set('Authorization', `Bearer ${token}`)
              .send({ records: [posRecordPayload] })
              .expect(201);
            const fixtureItems =
              (posRecordPayload.invoice as unknown as Record<string, unknown>)
                .items as Array<Record<string, unknown>>;
            const beerItem = fixtureItems.find(
              (item) => item.discountOrigin !== undefined,
            ) as Record<string, unknown>;

            await expectCheckViolation(
              dataSource,
              beerItem,
              tenantId,
              { bossDiscount: 5 },
            );
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'rejects a ZERO amount ({manual: 0}) with SQLSTATE 23514 from the CHECK',
      async () => {
        await withIsolatedSchema(
          'e2e_pos_replay_chk_zero',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });
            await request(app.getHttpServer())
              .post('/v1/sync/batch')
              .set('Authorization', `Bearer ${token}`)
              .send({ records: [posRecordPayload] })
              .expect(201);
            const fixtureItems =
              (posRecordPayload.invoice as unknown as Record<string, unknown>)
                .items as Array<Record<string, unknown>>;
            const beerItem = fixtureItems.find(
              (item) => item.discountOrigin !== undefined,
            ) as Record<string, unknown>;

            await expectCheckViolation(dataSource, beerItem, tenantId, {
              manual: 0,
            });
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'rejects a NEGATIVE amount ({manual: -3}) with SQLSTATE 23514 from the CHECK',
      async () => {
        await withIsolatedSchema(
          'e2e_pos_replay_chk_negative',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const token = signIdentityJwtAccessToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });
            await request(app.getHttpServer())
              .post('/v1/sync/batch')
              .set('Authorization', `Bearer ${token}`)
              .send({ records: [posRecordPayload] })
              .expect(201);
            const fixtureItems =
              (posRecordPayload.invoice as unknown as Record<string, unknown>)
                .items as Array<Record<string, unknown>>;
            const beerItem = fixtureItems.find(
              (item) => item.discountOrigin !== undefined,
            ) as Record<string, unknown>;

            await expectCheckViolation(dataSource, beerItem, tenantId, {
              manual: -3,
            });
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  it(
    'accepts the LEGACY payload (same fixture with discountOrigin keys removed) and persists NULL — the pre-change contract byte-identical',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_replay_legacy',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          // Built IN THE TEST from the fixture — the fixture itself is never
          // edited. Distinct pinned identity so the legacy record cannot
          // collide with anything else in this schema.
          const legacyRecord: SyncBatchRecordDto = JSON.parse(
            JSON.stringify(posRecordPayload),
          );
          const legacyInvoiceId = 'e0000000-0000-4000-8000-00000000a002';
          const legacyRecordInvoice = legacyRecord.invoice as unknown as Record<
            string,
            unknown
          >;
          legacyRecordInvoice.id = legacyInvoiceId;
          legacyRecord.idempotencyKey = `sale:TERM-01:${legacyInvoiceId}`;
          // Deterministic sync sequencing stages future sequences on a fresh
          // device: the legacy record must arrive as sequence 1 to be
          // ACCEPTED (this schema holds exactly one record).
          legacyRecord.sourceSequence = 1;
          const legacyItems = legacyRecordInvoice.items as Array<
            Record<string, unknown>
          >;
          for (const [index, item] of legacyItems.entries()) {
            // THE pre-change contract: no discountOrigin key at all —
            // omitted entirely, exactly as every deployed terminal sends.
            delete item.discountOrigin;
            item.id = `e0000000-0000-4000-8000-00000000a00${index + 3}`;
          }

          const res = await request(app.getHttpServer())
            .post('/v1/sync/batch')
            .set('Authorization', `Bearer ${token}`)
            .send({ records: [legacyRecord] })
            .expect(201);

          expect(res.body.results[0]).toEqual(
            expect.objectContaining({
              idempotencyKey: legacyRecord.idempotencyKey,
              status: 'ACCEPTED',
              code: 'APPLIED_NO_INVENTORY_IMPACT',
            }),
          );

          // The persisted rows carry NULL — never an empty object, never a
          // fabricated origin (byte-identical to the pre-change contract).
          const rows = (await dataSource.query(
            `SELECT discount_origin, discount FROM invoice_items
              WHERE tenant_id = $1 ORDER BY id`,
            [tenantId],
          )) as PersistedBreakdownRow[];
          expect(rows).toHaveLength(legacyItems.length);
          for (const row of rows) {
            expect(row.discount_origin).toBeNull();
          }
          for (const [index, item] of legacyItems.entries()) {
            expect(Number(rows[index].discount)).toBe(
              item.discount as number,
            );
          }
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  // Requirement: "a payload carrying an unknown property in the same batch
  // is rejected for the WHOLE batch (400), not silently stripped" — this is
  // ALREADY PROVEN by test/sales/sync-batch.e2e-spec.ts
  // ("rejects an unknown KEY inside the discount_origin breakdown and
  // refuses the WHOLE batch before the sync service runs", with
  // forbidNonWhitelisted: true and `expect(syncBatch).not.toHaveBeenCalled()`),
  // so it is cited here and deliberately NOT duplicated.
});
