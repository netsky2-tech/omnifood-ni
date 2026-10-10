import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
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
import type { SyncBatchRecordDto } from '../../src/modules/sales/dto/sync-batch.dto';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

/**
 * THE POS's REAL sync payload with a populated modifier line, replayed
 * against the REAL backend over a REAL PostgreSQL database — the missing
 * end-to-end verification for the modifier-quantity work (SOHO P3).
 *
 * THE TWO-LAYER DEFECT THIS SPEC LOCKS SHUT:
 *
 *   LAYER 1 (wire): the POS's modifier map on the wire is
 *   {name, extraPrice, quantity} (apps/pos_app/lib/data/mappers/
 *   sales_mapper.dart:713-718), while CreateModifierDto declared only name
 *   and extraPrice. With the production pipe config (src/main.ts:49-53,
 *   whitelist + forbidNonWhitelisted), one unknown `quantity` key is a 400
 *   for the WHOLE batch — and the POS leaves those records pending forever,
 *   re-sending the same poisoned batch on every pass.
 *
 *   LAYER 2 (persistence): invoice_item_modifiers had only
 *   id / invoice_item_id / name / extra_price; the sale path upserts the
 *   whole DTO item (spreading its `modifiers` array, which the upsert
 *   silently ignores — the @OneToMany cascade only applies to `save`, not
 *   `upsert`), so modifier lines never landed in the cloud at all.
 *
 * FIXTURE PROVENANCE (option B — produced through the REAL POS chain):
 *
 *   - Producer: `apps/pos_app/lib/data/services/activation_controlled_sale_runner.dart`,
 *     the idempotent rebuild path — the payload is the queued batch record
 *     the runner persists for sync (the VERIFICATION_SALE outbox envelope),
 *     built from the PERSISTED SQLite rows through the exact production wire
 *     builder: `SalesMapper.toSyncJson` + `SyncService.buildSalesSyncRecord`.
 *   - Scenario: a REAL checkout of one "Cerveza Preparada" whose cart line
 *     carries a REAL Modifier ("Michelada Extra", extraPrice 30.00,
 *     quantity 2) driven through `SaleViewModel.processSale` (real fiscal
 *     calculator — the line amount includes extraPrice * quantity), persisted
 *     through the REAL `SalesRepositoryImpl.saveSale` with only the sale's
 *     identity (ids/timestamps) pinned for reproducibility.
 *   - DEVIATION CLOSED (SOHO P3 POS-side repair): the push path no longer
 *     drops the cart's modifiers. The rebuild (and the normal push path in
 *     lib/data/repositories/sales/sales_repository_impl.dart) now loads the
 *     persisted invoice_item_modifiers rows (one batched query,
 *     InvoiceItemDao.getModifierRowsByInvoiceId) and passes them through
 *     SalesMapper.toItemDomain, so the envelope genuinely carries the REAL
 *     modifier list the sale was checked out with — the former capture seam
 *     (test-side re-attach of `modifiers`) is REMOVED. This fixture is now
 *     produced by the real chain END TO END with no test-side shaping: the
 *     capturing test asserts the production payload PRODUCTION-NATIVE and
 *     pins the fixture bytes byte for byte.
 *   - Capturing test (the two apps are bound by this one artifact):
 *     `apps/pos_app/test/data/services/activation_controlled_sale_runner_test.dart`,
 *     group "SOHO P3 cross-app fixture — REAL producer chain for the modifier
 *     wire payload", test "producer + pin: the persisted VERIFICATION_SALE
 *     payload PRODUCTION-NATIVE equals the committed backend fixture
 *     EXACTLY".
 *     Re-capture with `POS_CAPTURE_MODIFIER_FIXTURE=1 flutter test
 *     --concurrency=1 test/data/services/activation_controlled_sale_runner_test.dart`
 *     — two consecutive captures produce byte-identical bytes
 *     (sha256 1d8d8cb8416789fc28db450dff60b0a6faa161f3b022856dee3574bbdbf374b2).
 *
 * Loaded with `require` (not an ES import) because the backend tsconfig does
 * not enable `resolveJsonModule` (same as the discount-origin fixture spec).
 *
 * NOTE ON THE `quantity` COLUMN: this spec relies on `synchronize: true`
 * building invoice_item_modifiers from the ENTITY (which carries the
 * quantity column with its NOT NULL DEFAULT 1) — the same way the sibling
 * discount-origin spec relies on synchronize for the jsonb column. The
 * migration that arms PRODUCTION databases
 * (1809640000000-AddQuantityToInvoiceItemModifiers) is pinned exactly —
 * SQL string for SQL string — by its own unit spec
 * (src/migrations/1809640000000-AddQuantityToInvoiceItemModifiers.spec.ts).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- fixture JSON cannot be imported statically (resolveJsonModule is off) and prettier's reflow pushes the call past a next-line directive */
const posRecordPayload = require('../fixtures/sales/pos-modifier-payload.json') as SyncBatchRecordDto;
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
 * Isolated throwaway schema per run (same pattern as
 * test/sales/pos-payload-discount-origin.db.e2e-spec.ts): `synchronize: true`
 * builds the columns from the entities. The schema is dropped (CASCADE) in
 * the finally block.
 */
async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication<App>;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
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

    const tenantId = randomUUID();
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        id: tenantId,
        name: `POS Modifier Replay ${schemaPrefix}`,
        slug: `pos-modifier-replay-${schemaPrefix}-${randomUUID().slice(0, 8)}`,
      }),
    );

    // The REAL InvoicesService over the REAL (schema-isolated) DataSource —
    // the same construction the sibling discount-origin replay spec uses;
    // only the recipe/BOM collaborators are stubs (this sale carries no
    // recipe version bindings).
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
      // Same override the sibling replay spec uses: the transport guard's
      // device-credential machinery is out of scope here; the REAL AuthGuard,
      // credit-note guard, ValidationPipe (production config) and REAL
      // service+DB are the system under test.
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

interface PersistedModifierRow {
  name: string;
  extra_price: string;
  quantity: number;
}

describe('POS modifier payload replay E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'accepts the EXACT POS fixture record end to end through the production ValidationPipe and persists the modifier rows with quantity',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_modifier_replay_accept',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          // The record is the byte-captured artifact the runner persisted
          // (with the documented seam re-attach) — not rebuilt, not
          // normalized here.
          const res = await request(app.getHttpServer())
            .post('/v1/sync/batch')
            .set('Authorization', `Bearer ${token}`)
            .send({ records: [posRecordPayload] })
            .expect(201);

          expect(res.body.status).toBe('success');
          // Production answers ACCEPTED with the inventory-outcome-aware
          // APPLIED_NO_INVENTORY_IMPACT code for this sale (no insumo
          // mappings on the fixture product).
          expect(res.body.results[0]).toEqual(
            expect.objectContaining({
              idempotencyKey: posRecordPayload.idempotencyKey,
              status: 'ACCEPTED',
              code: 'APPLIED_NO_INVENTORY_IMPACT',
            }),
          );

          // THE LAYER-2 PROOF: the modifier rows are persisted with the
          // payload's name, extra_price AND quantity — not silently dropped
          // the way the item upsert used to drop them.
          const fixtureInvoice = posRecordPayload.invoice as unknown as Record<
            string,
            unknown
          >;
          const fixtureItems = fixtureInvoice.items as Array<
            Record<string, unknown>
          >;
          const fixtureModifiers = fixtureItems[0].modifiers as Array<
            Record<string, unknown>
          >;
          expect(fixtureModifiers).toHaveLength(1);

          const rows = (await dataSource.query(
            `SELECT m.name, m.extra_price, m.quantity
               FROM invoice_item_modifiers m
              WHERE m.invoice_item_id = $1`,
            [fixtureItems[0].id],
          )) as unknown as PersistedModifierRow[];
          expect(rows).toHaveLength(1);
          expect(rows[0].name).toBe(fixtureModifiers[0].name);
          expect(Number(rows[0].extra_price)).toBe(
            fixtureModifiers[0].extraPrice,
          );
          expect(rows[0].quantity).toBe(fixtureModifiers[0].quantity);

          // Fiscal integrity of the enclosing sale is untouched by the
          // modifier persistence.
          const invoiceRows = (await dataSource.query(
            `SELECT total FROM invoices WHERE id = $1 AND tenant_id = $2`,
            [fixtureInvoice.id, tenantId],
          )) as Array<{ total: string }>;
          expect(invoiceRows).toHaveLength(1);
          expect(Number(invoiceRows[0].total)).toBe(fixtureInvoice.total);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'accepts a LEGACY payload (same fixture with the quantity keys removed IN THE TEST) and persists quantity 1',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_modifier_replay_legacy',
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
          const legacyInvoiceId = 'd0000000-0000-4000-8000-00000000d002';
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
          const legacyInvoice = legacyRecordInvoice as unknown as Record<
            string,
            unknown
          >;
          legacyInvoice.id = legacyInvoiceId;
          const legacyItems = legacyInvoice.items as Array<
            Record<string, unknown>
          >;
          legacyItems[0].id = 'd0000000-0000-4000-8000-00000000d012';
          const legacyPayments = legacyInvoice.payments as Array<
            Record<string, unknown>
          >;
          legacyPayments[0].id = 'd0000000-0000-4000-8000-00000000d022';

          for (const item of legacyItems) {
            const modifiers = item.modifiers as Array<Record<string, unknown>>;
            for (const modifier of modifiers) {
              // THE pre-change wire contract: no quantity key at all —
              // omitted entirely, exactly as older deployed terminals send.
              delete modifier.quantity;
            }
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

          // The persisted row carries quantity 1 — the honest default: a
          // modifier line without a quantity IS one unit (the POS's own
          // local default, invoice_item_modifier_entity.dart:30).
          const rows = (await dataSource.query(
            `SELECT name, extra_price, quantity
               FROM invoice_item_modifiers
              WHERE invoice_item_id = $1`,
            [legacyItems[0].id],
          )) as unknown as PersistedModifierRow[];
          expect(rows).toHaveLength(1);
          expect(rows[0].name).toBe('Michelada Extra');
          expect(Number(rows[0].extra_price)).toBe(30.0);
          expect(rows[0].quantity).toBe(1);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects quantity 0 with a named error and never persists a 0 (or any) modifier row',
    async () => {
      await withIsolatedSchema(
        'e2e_pos_modifier_replay_zero',
        async ({ app, dataSource, jwtService, tenantId }) => {
          const token = signIdentityJwtAccessToken(jwtService, {
            role: UserRole.OWNER,
            tenant_id: tenantId,
          });

          const zeroRecord: SyncBatchRecordDto = JSON.parse(
            JSON.stringify(posRecordPayload),
          );
          const zeroInvoiceId = 'd0000000-0000-4000-8000-00000000d003';
          const zeroInvoice = zeroRecord.invoice as unknown as Record<
            string,
            unknown
          >;
          zeroInvoice.id = zeroInvoiceId;
          zeroRecord.idempotencyKey = `sale:TERM-01:${zeroInvoiceId}`;
          zeroRecord.sourceSequence = 1;
          const zeroItems = zeroInvoice.items as Array<
            Record<string, unknown>
          >;
          zeroItems[0].id = 'd0000000-0000-4000-8000-00000000d013';
          const zeroModifiers = zeroItems[0].modifiers as Array<
            Record<string, unknown>
          >;
          zeroModifiers[0].quantity = 0;

          // With the production pipe config the rejection is a 400 for the
          // WHOLE batch, carrying the named constraint (min) on the quantity
          // property — the payload never reaches the service.
          const res = await request(app.getHttpServer())
            .post('/v1/sync/batch')
            .set('Authorization', `Bearer ${token}`)
            .send({ records: [zeroRecord] })
            .expect(400);

          const messages: string[] = Array.isArray(res.body.message)
            ? res.body.message
            : [res.body.message];
          expect(
            messages.some((message) => message.includes('quantity')),
          ).toBe(true);
          expect(
            messages.some(
              (message) =>
                message.includes('must not be less than 1') ||
                message.includes('must be an integer'),
            ),
          ).toBe(true);

          // NOTHING was persisted: no invoice, no items, no modifier rows —
          // the zero quantity can never survive as a persisted 0.
          const modifierRows = (await dataSource.query(
            `SELECT quantity FROM invoice_item_modifiers
              WHERE invoice_item_id = $1`,
            [zeroItems[0].id],
          )) as unknown as PersistedModifierRow[];
          expect(modifierRows).toHaveLength(0);
          const invoiceRows = (await dataSource.query(
            `SELECT id FROM invoices WHERE id = $1`,
            [zeroInvoiceId],
          )) as Array<{ id: string }>;
          expect(invoiceRows).toHaveLength(0);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
