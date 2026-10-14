import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';
import { Batch } from './entities/batch.entity';
import { Insumo } from './entities/insumo.entity';
import { InsumoMarketPrice } from './entities/insumo-market-price.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Product } from './entities/product.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { InventoryValuationService } from './inventory-valuation.service';

/**
 * R-01 (Ley 822 art. 44) + S9 (L33): the lower-of-cost-or-market writedown and
 * the TWO variants its reference can come from, pinned against a
 * MIGRATION-BUILT schema.
 *
 * The law requires inventory to be valued at the LOWER of acquisition cost or
 * market price. The owner's decision (L33) makes the market price a
 * first-class, dated input the client owns, and keeps the last purchase cost
 * only as a DECLARED fallback for when the client defined none.
 *
 * What each case pins:
 *   1. A defined market price WINS over the fallback, and the price in force at
 *      the closing date is the one used — a LATER price must not be reached
 *      forward into an earlier period.
 *   2. With no market price the fallback runs, and the row SAYS it did.
 *   3. Valuing the same period twice must not lose value twice.
 *   4. A cost at or below the reference is not touched.
 *   5. No market price AND no purchase is NOT a reason to invent a reference.
 *
 * Like every DB spec here, this drives the real service through the fixture's
 * runtime role (`NOSUPERUSER NOBYPASSRLS`), so the migrated constraints, the
 * FORCEd row-level security and the running-balance trigger all apply exactly
 * as they do in production. Assertions are on OBSERVABLE OUTCOME — the ledger
 * row, its recorded basis, and the projection the valuation report reads — and
 * never on "a repository method was called".
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
  source_document_id: string | null;
  valuation_basis: string | null;
  occurred_at: Date | string;
}

describe('InventoryValuationService lower-of-cost-or-market (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: InventoryValuationService;

  const CLOSING_DAY = '2026-10-31';

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * An insumo holding stock, plus the ledger row that OPENED it.
   *
   * The opening row is not optional: `trg_inventory_kardex_running_balance`
   * requires `stock_before` to equal the latest `stock_after` for the
   * (tenant, insumo) pair — COALESCEd to 0 for a first movement — so seeding
   * a stock column with no movement makes every later insert fail with
   * `inventory_kardex balance invariant violated` before anything this spec is
   * about ever runs.
   *
   * The opening movement IS the purchase, and that is deliberate: it is both
   * the row that satisfies the balance trigger and the ledger row the fallback
   * reference reads. `cppNio` is then seeded ABOVE the last purchase cost,
   * which is exactly the situation a writedown exists for — an average cost
   * that has climbed past what the item is actually worth.
   */
  const seedInsumoWithPurchase = async (input: {
    tenantId: string;
    name: string;
    stock: number;
    cppNio: number;
    lastPurchaseUnitCostNio: number;
  }): Promise<{ insumoId: string; purchaseMovementId: string }> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, $5)`,
      [insumoId, input.tenantId, input.name, input.stock, input.cppNio],
    );

    // The kardex PK is a BIGINT sequence, never a uuid: the fixture must let
    // the sequence assign it and read it back with RETURNING. Supplying a uuid
    // fails with `invalid input syntax for type bigint` — inside the seed,
    // where it masks the behaviour under test instead of testing it.
    const inserted = (await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'ENTRADA_COMPRA', $3, $4, $5, 0.0000, $3,
               'PURCHASE', 'purchase-seed', '2026-10-10T12:00:00Z')
       RETURNING id`,
      [
        input.tenantId,
        insumoId,
        input.stock,
        input.lastPurchaseUnitCostNio,
        input.stock * input.lastPurchaseUnitCostNio,
      ],
    )) as Array<{ id: string }>;

    return { insumoId, purchaseMovementId: String(inserted[0].id) };
  };

  /** An insumo holding stock that has NO purchase in the ledger at all. */
  const seedInsumoWithoutPurchase = async (input: {
    tenantId: string;
    name: string;
    stock: number;
    cppNio: number;
  }): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom",
          stock, existencia_actual, costo_promedio_nio)
       VALUES ($1, $2, $3, 'kg', 'kg', $4, $4, $5)`,
      [insumoId, input.tenantId, input.name, input.stock, input.cppNio],
    );
    await admin.query(
      `INSERT INTO inventory_kardex
         (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
          total_cost_nio, stock_before, stock_after, source_document_type,
          source_document_id, occurred_at)
       VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED',
               'seed-initial', '2026-10-01T12:00:00Z')`,
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

  const readCpp = async (tenantId: string, insumoId: string): Promise<number> => {
    const rows = (await admin.query(
      `SELECT costo_promedio_nio FROM insumos WHERE tenant_id = $1 AND id = $2`,
      [tenantId, insumoId],
    )) as Array<{ costo_promedio_nio: string }>;
    return Number(rows[0].costo_promedio_nio);
  };

  const readWritedownRows = async (
    tenantId: string,
    insumoId: string,
  ): Promise<KardexRow[]> =>
    (await admin.query(
      `SELECT movement_type, quantity, unit_cost_nio, total_cost_nio,
              stock_before, stock_after, source_document_id, valuation_basis,
              occurred_at
         FROM inventory_kardex
        WHERE tenant_id = $1 AND insumo_id = $2
          AND movement_type = 'VALUATION_WRITEDOWN'
        ORDER BY id`,
      [tenantId, insumoId],
    )) as KardexRow[];

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

    // RELATION CLOSURE of everything the valuation service touches. A missing
    // entity here is an EntityMetadataNotFoundError naming it; the closure is
    // spelled out because no spec can know tomorrow's dependency, which is why
    // this list lives in a helper elsewhere (see R8).
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        Tenant,
        Insumo,
        InsumoMarketPrice,
        InventoryMovement,
        Batch,
        Product,
        UomConversion,
      ],
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await runtime.initialize();

    service = new InventoryValuationService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('uses the market price IN FORCE at the closing date and never reaches forward to a later one', async () => {
    const tenantId = await seedTenant('R18 market price');
    const { insumoId } = await seedInsumoWithPurchase({
      tenantId,
      name: 'Harina (precio de mercado)',
      stock: 100,
      cppNio: 200,
      lastPurchaseUnitCostNio: 150,
    });

    // Two prices, one BEFORE the closing date and one AFTER it. Only the first
    // may resolve the reference: a price that did not exist yet cannot have
    // valued an inventory at that date.
    const priceInForce = await service.setMarketPrice({
      tenantId,
      insumoId,
      marketPriceNio: 130,
      effectiveDate: '2026-10-15',
      sourceNote: 'lista de proveedor',
      createdByUserId: 'user-1',
    });
    await service.setMarketPrice({
      tenantId,
      insumoId,
      marketPriceNio: 90,
      effectiveDate: '2026-11-15',
    });

    const result = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });

    expect(result.totalWritedownNio).toBe(7000); // 100 x (200 - 130)
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].variant).toBe('MARKET_PRICE');
    expect(result.lines[0].referenceNio).toBe(130);
    expect(result.lines[0].referenceDate).toBe('2026-10-15');
    expect(result.lines[0].originId).toBe(priceInForce.id);

    // The projection the valuation report reads moved with the ledger.
    expect(await readCpp(tenantId, insumoId)).toBe(130);

    const rows = await readWritedownRows(tenantId, insumoId);
    expect(rows).toHaveLength(1);

    // The close is stamped with the CLOSING instant, not with the moment this
    // test ran. `occurred_at` is a `@CreateDateColumn`, whose default job is to
    // stamp the INSERT time — so without the explicit enforcement in the
    // service the writedown would silently carry the run date instead of the
    // period it closes. This assertion is what decides which behaviour won.
    expect(new Date(rows[0].occurred_at).toISOString()).toBe(
      `${CLOSING_DAY}T23:59:59.999Z`,
    );

    expect(Number(rows[0].quantity)).toBe(0); // value moved, quantity did not
    expect(Number(rows[0].total_cost_nio)).toBe(-7000);
    expect(Number(rows[0].stock_before)).toBe(100);
    expect(Number(rows[0].stock_after)).toBe(100);
    expect(rows[0].source_document_id).toBe(
      `valuation-writedown:${CLOSING_DAY}:${insumoId}`,
    );

    const basis = JSON.parse(rows[0].valuation_basis as string);
    expect(basis.variant).toBe('MARKET_PRICE');
    expect(basis.referenceDate).toBe('2026-10-15');
    expect(basis.originId).toBe(priceInForce.id);
  });

  it('falls back to the last purchase cost and RECORDS that it did', async () => {
    const tenantId = await seedTenant('R18 fallback');
    const { insumoId, purchaseMovementId } = await seedInsumoWithPurchase({
      tenantId,
      name: 'Arroz (sin precio de mercado)',
      stock: 100,
      cppNio: 200,
      lastPurchaseUnitCostNio: 150,
    });

    const result = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });

    expect(result.totalWritedownNio).toBe(5000); // 100 x (200 - 150)
    expect(result.lines[0].variant).toBe('LAST_PURCHASE_COST_FALLBACK');
    expect(result.lines[0].referenceNio).toBe(150);
    expect(result.lines[0].originId).toBe(purchaseMovementId);

    const rows = await readWritedownRows(tenantId, insumoId);
    expect(rows).toHaveLength(1);
    const basis = JSON.parse(rows[0].valuation_basis as string);
    // The approximation is DECLARED, so no report can present it as a market
    // price.
    expect(basis.variant).toBe('LAST_PURCHASE_COST_FALLBACK');
    expect(basis.referenceNio).toBe(150);
  });

  it('is idempotent per closing date: valuing the same period twice does not lose value twice', async () => {
    const tenantId = await seedTenant('R18 idempotencia');
    const { insumoId } = await seedInsumoWithPurchase({
      tenantId,
      name: 'Azucar',
      stock: 100,
      cppNio: 200,
      lastPurchaseUnitCostNio: 150,
    });

    const first = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });
    expect(first.totalWritedownNio).toBe(5000);

    const second = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });
    expect(second.totalWritedownNio).toBe(0);
    expect(second.lines).toHaveLength(0);
    expect(second.skippedExisting).toContain(insumoId);

    // One row, and the projection still holds the reference — not a second
    // discount on top of the first.
    expect(await readWritedownRows(tenantId, insumoId)).toHaveLength(1);
    expect(await readCpp(tenantId, insumoId)).toBe(150);
  });

  it('leaves a cost at or below the reference alone', async () => {
    const tenantId = await seedTenant('R18 sin castigo');
    const { insumoId } = await seedInsumoWithPurchase({
      tenantId,
      name: 'Frijol (ya por debajo)',
      stock: 100,
      cppNio: 100,
      lastPurchaseUnitCostNio: 150,
    });

    const result = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });

    expect(result.totalWritedownNio).toBe(0);
    expect(result.lines).toHaveLength(0);
    expect(result.notAboveReference).toContain(insumoId);
    expect(await readWritedownRows(tenantId, insumoId)).toHaveLength(0);
    expect(await readCpp(tenantId, insumoId)).toBe(100);
  });

  it('refuses to invent a reference when there is no market price AND no purchase', async () => {
    const tenantId = await seedTenant('R18 sin referencia');
    const insumoId = await seedInsumoWithoutPurchase({
      tenantId,
      name: 'Insumo sin historia de compra',
      stock: 100,
      cppNio: 200,
    });

    const result = await service.applyLowerOfCostWritedown({
      tenantId,
      asOfDate: CLOSING_DAY,
    });

    expect(result.totalWritedownNio).toBe(0);
    expect(result.lines).toHaveLength(0);
    expect(result.withoutReference).toContain(insumoId);
    expect(await readWritedownRows(tenantId, insumoId)).toHaveLength(0);
    // Doing nothing is the honest outcome: there is no reference to compare
    // against, and a fabricated one would be worse than no writedown.
    expect(await readCpp(tenantId, insumoId)).toBe(200);
  });
});
