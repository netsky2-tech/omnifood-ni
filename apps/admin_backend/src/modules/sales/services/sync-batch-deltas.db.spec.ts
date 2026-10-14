import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Batch } from '../../inventory/entities/batch.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { InvoicesService } from './invoices.service';

/**
 * R2 (odd/tasks/nucleo-inventario-paridad-contrato.md): the kardex write
 * contract for the SYNC BATCH inventory-delta path, pinned against a
 * MIGRATION-BUILT schema.
 *
 * Why this spec exists. `docs/audits/inventory-core-flow-truth-v1.md` §4
 * lists, as the third reachable broken insert,
 * `invoices.service.ts:1892` — `appendInventoryDeltas` sets
 * `sourceDocumentType: record.documentType` but never `sourceDocumentId`,
 * while `inventory_kardex.source_document_id` is `NOT NULL` since the ledger
 * foundation (`1766000000000-BohInventoryLedgerFoundation.ts:19`).
 *
 * The sibling suite `invoices.service.db.spec.ts` also runs against real
 * PostgreSQL, and it CANNOT see this defect for a structural reason worth
 * recording: its `createService` helper passes `unusedRepository`
 * (`{} as never`) at constructor positions 2, 3, 4 and **6**, and position 6
 * is `movementRepository` — the very repository the delta insert uses. None of
 * its records carry `movements[]`, so the delta branch returns early and the
 * stub never runs; if it ever did, `this.movementRepository.create(...)` on
 * `{}` would throw before reaching the database. This spec supplies the REAL
 * repositories at positions 1 and 6 instead.
 *
 * `recipeService` and `bomExplosionService` are the only stubs here, and they
 * are legitimately out of the contract under test: this record carries no
 * invoice, so `validateInvoiceRecipeVersions` and `syncInvoices` are skipped
 * and the delta path never consults them. Every collaborator that PARTICIPATES
 * in the contract is real.
 *
 * Asserts OBSERVABLE OUTCOME (the record is ACCEPTED and a kardex row with its
 * required columns exists), never that a repository method was called. It is
 * expected to FAIL until R5 lands the fix.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = {
  extra: { max: 2, allowExitOnIdle: true },
} as const;

interface KardexRow {
  movement_type: string;
  quantity: string;
  unit_cost_nio: string;
  total_cost_nio: string;
  stock_before: string;
  stock_after: string;
  source_document_type: string | null;
  source_document_id: string | null;
}

describe('sync batch inventory deltas kardex write contract (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const INSUMO_STOCK = 100;
  const INSUMO_CPP_NIO = 100;
  const DELTA = -5;

  /** The device the POS authenticates as in this rig. */
  const DEVICE_ID = 'RIG-TERMINAL-1';

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * The opening balance must be a ledger row, not just a column value:
   * `trg_inventory_kardex_running_balance` requires `stock_before` to equal the
   * latest `stock_after` for the (tenant, insumo) pair. See
   * `shrinkage.service.db.spec.ts` for the same fixture rule.
   */
  const seedInsumo = async (input: {
    tenantId: string;
    stock: number;
    cppNio: number;
  }): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, $5)`,
      [
        insumoId,
        input.tenantId,
        'Insumo de deltas (R2)',
        input.stock,
        input.cppNio,
      ],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED',
               'seed-initial', NOW())`,
      [
        input.tenantId,
        insumoId,
        input.stock,
        input.cppNio,
        input.stock * input.cppNio,
      ],
    );
    return insumoId;
  };

  /**
   * Reproduces the SALES flow's bookkeeping for one source sequence: a
   * zero-quantity row that CLAIMS `(tenant, device, sequence)` in the kardex
   * namespace, exactly as a real sale's movement does. The shape is not
   * invented — the live rig produced a `SALE` row carrying
   * `source_device_id = 'RIG-TERMINAL-1'` and `source_sequence = '1'` (T5).
   *
   * Its only job here is to hold the sequence:
   * `uq_inventory_kardex_source_sequence` is on
   * `(tenant_id, source_device_id, source_sequence)` and ignores every other
   * column, including the flow.
   */
  const claimSourceSequence = async (input: {
    tenantId: string;
    insumoId: string;
    sequence: string;
    stockAtClaim: number;
  }): Promise<void> => {
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, source_device_id, source_sequence, occurred_at)
       VALUES ($1, $2, 'SALE', 0.0000, $3, 0.0000, $4, $4, 'SALE',
               'invoice:sequence-claim', $5, $6, NOW())`,
      [
        input.tenantId,
        input.insumoId,
        INSUMO_CPP_NIO,
        input.stockAtClaim,
        DEVICE_ID,
        input.sequence,
      ],
    );
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    // Entity list is the RELATION CLOSURE of the entities this path touches:
    // Insumo -> Tenant, UomConversion; InventoryMovement -> Tenant;
    // InventorySyncReceipt and InventorySyncOutbox declare no relations,
    // which is what closes the graph.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        Tenant,
        Insumo,
        UomConversion,
        InventoryMovement,
        InventorySyncReceipt,
        InventorySyncOutbox,
        // R13: the delta branch now draws the outflow from the batches, so the
        // Batch metadata has to be registered here too.
        Batch,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  /**
   * Positional wiring matters: the arguments are positional in the constructor
   * (`invoices.service.ts:198-223`), so a stub at the wrong index silently
   * disarms the path. Position 6 is `movementRepository`.
   */
  const buildService = (): InvoicesService => {
    const unusedRepository = {} as never;
    return new InvoicesService(
      runtime,
      unusedRepository, // 2 invoiceRepository  (record carries no invoice)
      unusedRepository, // 3 itemRepository     (unused)
      unusedRepository, // 4 paymentRepository  (unused)
      unusedRepository, // 5 userRepository     (unused)
      runtime.getRepository(InventoryMovement), // 6 movementRepository — REAL
      runtime.getRepository(InventorySyncReceipt), // 7
      runtime.getRepository(InventorySyncOutbox), // 8
      unusedRepository, // 9 recipeService      (no invoice -> skipped)
      unusedRepository, // 10 bomExplosionService (delta path never uses it)
    );
  };

  it('applies an inventory delta as a kardex movement that satisfies every NOT NULL column and moves stock', async () => {
    const tenantId = await seedTenant('r2-sync-deltas');
    const insumoId = await seedInsumo({
      tenantId,
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });

    const result = await buildService().syncBatch(tenantId, [
      {
        idempotencyKey: 'r2-delta-1',
        sourceDeviceId: DEVICE_ID,
        sourceSequence: 1,
        flowType: 'inventory',
        documentType: 'ADJUSTMENT',
        movements: [{ insumoId, quantity: DELTA }],
      },
    ]);

    // The record must be applied, not rejected: a rejected record means the
    // delta never reached the ledger.
    expect(result.results[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(result.processed).toBe(1);

    const movements = await admin.query<KardexRow[]>(
      `SELECT movement_type, quantity, unit_cost_nio, total_cost_nio,
              stock_before, stock_after, source_document_type, source_document_id
         FROM inventory_kardex
        WHERE tenant_id = $1 AND movement_type = 'ADJUSTMENT'
        ORDER BY id`,
      [tenantId],
    );

    expect(movements).toHaveLength(1);
    const movement = movements[0];

    expect(Number(movement.quantity)).toBe(DELTA);
    expect(Number(movement.stock_before)).toBe(INSUMO_STOCK);
    expect(Number(movement.stock_after)).toBe(INSUMO_STOCK + DELTA);
    expect(Number(movement.unit_cost_nio)).toBe(INSUMO_CPP_NIO);
    expect(Number(movement.total_cost_nio)).toBe(
      Math.abs(DELTA) * INSUMO_CPP_NIO,
    );

    // The column the broken insert omits.
    expect(movement.source_document_type).toBe('ADJUSTMENT');
    expect(movement.source_document_id).toBeTruthy();

    const [insumo] = await admin.query<Array<{ stock: string }>>(
      `SELECT stock FROM insumos WHERE id = $1`,
      [insumoId],
    );
    expect(Number(insumo.stock)).toBe(INSUMO_STOCK + DELTA);
  });

  it('applies an inventory delta whose sequence number is already claimed by ANOTHER flow', async () => {
    const tenantId = await seedTenant('r14-sequence-namespace');
    const insumoId = await seedInsumo({
      tenantId,
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });

    // The sales flow got there first. Each flow keeps its OWN contiguous
    // counter, so the two streams are independent by design — but in the
    // KARDEX both wrote into one namespace keyed by the device alone, so the
    // inventory flow could never emit sequence 1 on a device that had already
    // sold anything. That is H-R13, and it is why a POS shrinkage never
    // reaches the cloud today.
    await claimSourceSequence({
      tenantId,
      insumoId,
      sequence: '1',
      stockAtClaim: INSUMO_STOCK,
    });

    const result = await buildService().syncBatch(tenantId, [
      {
        idempotencyKey: 'r14-delta-same-sequence',
        sourceDeviceId: DEVICE_ID,
        sourceSequence: 1,
        flowType: 'inventory',
        documentType: 'ADJUSTMENT',
        movements: [{ insumoId, quantity: DELTA }],
      },
    ]);

    // A red for an UNKNOWN reason is not evidence: surface the rejection —
    // its `code` and `message` — before asserting the outcome. Kept in the
    // spec on purpose, so the NEXT person who sees this fail reads the reason
    // instead of guessing it.
    if (result.results[0].status !== 'ACCEPTED') {
      throw new Error(
        `Delta was not accepted: ${JSON.stringify(result.results[0])}`,
      );
    }

    expect(result.results[0].status).toBe('ACCEPTED');
    expect(result.processed).toBe(1);

    const movements = await admin.query<KardexRow[]>(
      `SELECT movement_type, quantity, unit_cost_nio, total_cost_nio,
              stock_before, stock_after, source_document_type, source_document_id
         FROM inventory_kardex
        WHERE tenant_id = $1 AND movement_type = 'ADJUSTMENT'
        ORDER BY id`,
      [tenantId],
    );

    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(DELTA);
    expect(Number(movements[0].stock_after)).toBe(INSUMO_STOCK + DELTA);
    expect(movements[0].source_document_id).toBeTruthy();

    const [insumo] = await admin.query<Array<{ stock: string }>>(
      `SELECT stock FROM insumos WHERE id = $1`,
      [insumoId],
    );
    expect(Number(insumo.stock)).toBe(INSUMO_STOCK + DELTA);
  });

  it('still rejects a duplicate sequence WITHIN the same flow', async () => {
    const tenantId = await seedTenant('r14-within-flow');
    const insumoId = await seedInsumo({
      tenantId,
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });

    await claimSourceSequence({
      tenantId,
      insumoId,
      sequence: '1',
      stockAtClaim: INSUMO_STOCK,
    });

    // Loosening the namespace must not neuter the guarantee: the fix exists to
    // let TWO FLOWS reuse a number, not to let one flow write the same source
    // record twice. Without this assertion the previous test would also pass if
    // the index had simply been dropped.
    await expect(
      claimSourceSequence({
        tenantId,
        insumoId,
        sequence: '1',
        stockAtClaim: INSUMO_STOCK,
      }),
    ).rejects.toThrow(/uq_inventory_kardex_source_sequence/);
  });
});
