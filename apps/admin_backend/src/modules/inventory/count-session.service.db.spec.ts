import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../test/support/migration-built-schema.helper';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';
import { CountSessionService } from './count-session.service';
import { CountSessionDocumentDto } from './dto/count-session-document.dto';
import { Batch } from './entities/batch.entity';
import { CountSession } from './entities/count-session.entity';
import { CountSessionEntry } from './entities/count-session-entry.entity';
import { Insumo } from './entities/insumo.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { UomConversion } from './entities/uom-conversion.entity';

/**
 * R19 (odd/tasks/nucleo-inventario-conteo-persistente.md, S12/S13): the
 * physical count session stops being discarded, pinned against a
 * MIGRATION-BUILT schema.
 *
 * Why this spec exists. Until now `replayCountSession` applied the VARIANCE
 * (stock + kardex) and threw the document away: who counted, when, and who
 * disputed a line had no home in the cloud. Without the persisted document
 * the system cannot produce the signed year-end lists the Reglamento
 * (Decreto 01-2013 art. 33) requires — `R-05`/`R-06` of
 * docs/inventario_marco_normativo.md.
 *
 * The assertions are on OBSERVABLE OUTCOME through the real service and the
 * real database (rows in count_sessions / count_session_entries), never on
 * "a repository method was called". The schema comes from the FULL migration
 * set into a scratch schema, and the service runs through the fixture's
 * runtime role — NOSUPERUSER NOBYPASSRLS, owner of nothing — so the migrated
 * constraints and the FORCEd row-level security apply exactly as in
 * production.
 *
 * Entity-registration trap (see shrinkage.service.db.spec.ts): the DataSource
 * below must list the RELATION CLOSURE of every entity the exercised code
 * touches, or TypeORM throws EntityMetadataNotFoundError.
 *   Insumo -> Tenant, UomConversion; UomConversion -> Tenant, Insumo
 *   InventoryMovement, CountSession, CountSessionEntry -> Tenant
 *   CountSessionEntry -> CountSession
 *   Batch is listed because a NEGATIVE variance draws batch outflow; these
 *   tests keep the variance positive, but the metadata must resolve anyway.
 *
 * T1 expects this spec RED for exactly one reason: the service does not
 * persist the session (count_sessions stays empty). T2 (persisting the
 * session inside the existing transaction/idempotency) turns it green
 * WITHOUT touching these assertions.
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

describe('CountSessionService persistence contract (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  const INSUMO_STOCK = 100;
  const INSUMO_CPP_NIO = 100;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, normalizeTenantSlug(label)],
    );
    return tenantId;
  };

  /**
   * Same seeding contract as shrinkage.service.db.spec.ts: the opening
   * balance MUST be a ledger row, because
   * `trg_inventory_kardex_running_balance` requires `stock_before` to equal
   * the latest `stock_after` for the (tenant, insumo) pair — every variance
   * movement this service writes would otherwise fail the balance invariant
   * before the assertions under test ever run.
   */
  const seedInsumo = async (input: {
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
   * The DTO name is DELIBERATELY different from the insumos.name seeded in
   * the database: S12 freezes the line identity as the signed sheet printed
   * it, so a later rename of the insumo must NOT leak into the evidence. If
   * the persisted `insumo_name` ever equals the seeded name instead of this
   * DTO string, the freeze is broken.
   */
  const buildDocument = (insumoId: string): CountSessionDocumentDto => ({
    id: randomUUID(),
    warehouseId: randomUUID(),
    warehouseName: 'Bodega central (R19)',
    cutoffAt: '2026-10-14T06:00:00.000Z',
    status: 'approved',
    createdAt: '2026-10-14T04:00:00.000Z',
    updatedAt: '2026-10-14T06:30:00.000Z',
    postedAt: '2026-10-14T07:00:00.000Z',
    notes: 'R19: conteo nocturno con testigos',
    movementReferences: ['MOV-R19-1'],
    lines: [
      {
        id: 'line-r19-1',
        insumoId,
        insumoName: 'Harina de trigo — nombre congelado en la hoja (R19)',
        uom: 'kg',
        theoreticalQuantity: 10,
        approvedEntryIndex: 1,
        entries: [
          {
            countedQuantity: 9,
            countedAt: '2026-10-14T05:10:00.000Z',
            actorLabel: 'María Contadora',
            notes: 'R19: bulto abierto, se marco en disputa',
            disputed: true,
          },
          {
            countedQuantity: 12,
            countedAt: '2026-10-14T05:40:00.000Z',
            actorLabel: 'María Contadora',
            disputed: false,
          },
        ],
      },
    ],
  });

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection: seeding only. It bypasses the FORCEd row-level
    // security, which is what makes it usable as the fixture seeder.
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

    // Application-shaped connection: the fixture's runtime role. The schema
    // comes from the migration set (synchronize stays off); the entity
    // classes are registered ONLY so TypeORM can resolve repository
    // metadata — they never define DDL. See the closure note in the header.
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
        Batch,
        CountSession,
        CountSessionEntry,
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

  const buildService = (): CountSessionService =>
    new CountSessionService(runtime, { create: jest.fn() } as never);

  it('S12: persists the session and every counted entry with actor label, counted-at, disputed flag and the FROZEN line identity', async () => {
    const tenantId = await seedTenant('r19-count-session-persist');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Harina de trigo (nombre vivo en el catalogo)',
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });
    const document = buildDocument(insumoId);

    const result = await buildService().replayCountSession({
      tenantId,
      document,
    });

    expect(result.skippedExisting).toBe(false);

    // The header exists and is the document itself, keyed by the same id the
    // variance movement points back at (S13: sourceDocumentId = sessionId).
    const headers = await admin.query<
      Array<{
        id: string;
        tenant_id: string;
        warehouse_id: string;
        warehouse_name: string;
        status: string;
        notes: string | null;
        cutoff_at: Date;
        posted_at: Date | null;
        movement_references: string[] | null;
      }>
    >(
      `SELECT id, tenant_id, warehouse_id, warehouse_name, status, notes,
              cutoff_at, posted_at, movement_references
         FROM count_sessions WHERE tenant_id = $1`,
      [tenantId],
    );

    expect(headers).toHaveLength(1);
    const header = headers[0];
    expect(header.id).toBe(document.id);
    expect(header.warehouse_id).toBe(document.warehouseId);
    expect(header.warehouse_name).toBe(document.warehouseName);
    expect(header.status).toBe(document.status);
    expect(header.notes).toBe(document.notes);
    expect(new Date(header.cutoff_at).toISOString()).toBe(document.cutoffAt);
    expect(new Date(header.posted_at).toISOString()).toBe(document.postedAt);
    expect(header.movement_references).toEqual(document.movementReferences);

    // One row per counted entry, in document order.
    const entries = await admin.query<
      Array<{
        session_id: string;
        line_id: string;
        line_index: number;
        entry_index: number;
        insumo_id: string;
        insumo_name: string;
        uom: string;
        theoretical_quantity: string;
        counted_quantity: string;
        counted_at: Date | null;
        actor_label: string | null;
        notes: string | null;
        is_disputed: boolean;
        is_approved: boolean;
      }>
    >(
      `SELECT session_id, line_id, line_index, entry_index, insumo_id,
              insumo_name, uom, theoretical_quantity, counted_quantity,
              counted_at, actor_label, notes, is_disputed, is_approved
         FROM count_session_entries
        WHERE tenant_id = $1
        ORDER BY line_index, entry_index`,
      [tenantId],
    );

    expect(entries).toHaveLength(2);

    const [first, second] = entries;
    expect(first.session_id).toBe(document.id);
    expect(first.line_id).toBe(document.lines[0].id);
    expect(first.line_index).toBe(0);
    expect(first.entry_index).toBe(0);
    expect(first.insumo_id).toBe(insumoId);

    // FROZEN identity (S12): the sheet's name/uom/theoretical, NOT the
    // catalog's. The seeded catalog name differs on purpose.
    expect(first.insumo_name).toBe(document.lines[0].insumoName);
    expect(first.uom).toBe(document.lines[0].uom);
    expect(Number(first.theoretical_quantity)).toBe(
      document.lines[0].theoreticalQuantity,
    );

    // The legal core of R-05: who counted, when, who disputed.
    expect(first.counted_quantity).toBe('9.0000');
    expect(first.counted_at).toBeTruthy();
    expect(new Date(first.counted_at).toISOString()).toBe(
      document.lines[0].entries[0].countedAt,
    );
    expect(first.actor_label).toBe(document.lines[0].entries[0].actorLabel);
    expect(first.notes).toBe(document.lines[0].entries[0].notes);
    expect(first.is_disputed).toBe(true);
    expect(first.is_approved).toBe(false);

    expect(second.counted_quantity).toBe('12.0000');
    expect(new Date(second.counted_at).toISOString()).toBe(
      document.lines[0].entries[1].countedAt,
    );
    expect(second.actor_label).toBe(document.lines[0].entries[1].actorLabel);
    expect(second.notes).toBeNull();
    expect(second.is_disputed).toBe(false);
    // approvedEntryIndex = 1 marks THIS entry as the approved one.
    expect(second.is_approved).toBe(true);

    // S13: the session is persisted on the SAME write path — the variance
    // the count produced still lands on the ledger, under the same id.
    const movements = await admin.query<Array<{ source_document_id: string }>>(
      `SELECT source_document_id FROM inventory_kardex
        WHERE tenant_id = $1 AND source_document_type = 'AJUSTE_CONTEO'`,
      [tenantId],
    );
    expect(movements).toHaveLength(1);
    expect(movements[0].source_document_id).toBe(document.id);
  });

  // A-01: the count says IN WHICH LOT the stock it found is. A positive
  // variance is stock that APPEARS; without a lot it would enter the
  // aggregate alone and the next sale would find the aggregate and the lots
  // disagreeing. The industry does the same: cycle counts include lot
  // checks, not just quantity.
  it('A-01: a positive variance enters the lot it was counted in, and without a lot the count is refused', async () => {
    const tenantId = await seedTenant('a01-count-lot');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Leche entera',
      stock: 50,
      cppNio: 12,
    });
    const batchId = randomUUID();
    await admin.query(
      `INSERT INTO batches
         (id, tenant_id, insumo_id, batch_number, received_date,
          expiration_date, remaining_stock, cost)
       VALUES ($1, $2, $3, 'LOTE-A01', CURRENT_DATE, CURRENT_DATE + 30,
               50.0000, 12.0000)`,
      [batchId, tenantId, insumoId],
    );

    const document = buildDocument(insumoId);
    // The observation says which lot it was made in.
    document.lines[0].entries[1].batchId = batchId;
    document.lines[0].entries[1].batchNumber = 'LOTE-A01';

    await buildService().replayCountSession({ tenantId, document });

    // The physical truth entered ITS lot (the count found 12 where the system
    // had 10 ⇒ +2): the aggregate and the lots agree again.
    const lots = await admin.query<Array<{ remaining_stock: string }>>(
      'SELECT remaining_stock FROM batches WHERE id = $1',
      [batchId],
    );
    expect(Number(lots[0].remaining_stock)).toBe(52);

    const aggregate = await admin.query<Array<{ stock: string }>>(
      'SELECT stock FROM insumos WHERE id = $1',
      [insumoId],
    );
    expect(Number(aggregate[0].stock)).toBe(52);
  });

  it('A-01: a positive variance on a lot-managed insumo is refused until the operator says in which lot', async () => {
    const tenantId = await seedTenant('a01-count-nolot');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Leche entera (sin lote declarado)',
      stock: 50,
      cppNio: 12,
    });
    await admin.query(
      `INSERT INTO batches
         (id, tenant_id, insumo_id, batch_number, received_date,
          expiration_date, remaining_stock, cost)
       VALUES ($1, $2, $3, 'LOTE-A01B', CURRENT_DATE, CURRENT_DATE + 30,
               50.0000, 12.0000)`,
      [randomUUID(), tenantId, insumoId],
    );

    const document = buildDocument(insumoId);
    // No lot on the approved entry.

    await expect(
      buildService().replayCountSession({ tenantId, document }),
    ).rejects.toThrow(/EN QUÉ LOTE/);
  });

  it('S13: re-sending the identical document does not duplicate the session, its entries, nor the ledger effect', async () => {
    const tenantId = await seedTenant('r19-count-session-idempotent');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Azucar morena (R19)',
      stock: INSUMO_STOCK,
      cppNio: INSUMO_CPP_NIO,
    });
    const document = buildDocument(insumoId);
    const service = buildService();

    await service.replayCountSession({ tenantId, document });

    // The header must EXIST after the first replay before the retry means
    // anything. (Before T2 this fails for the same root reason as the test
    // above: the service does not persist the session.)
    const headersBefore = await admin.query<Array<{ id: string }>>(
      `SELECT id FROM count_sessions WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(headersBefore).toHaveLength(1);

    const result = await service.replayCountSession({ tenantId, document });
    expect(result.skippedExisting).toBe(true);

    const headers = await admin.query<Array<{ id: string }>>(
      `SELECT id FROM count_sessions WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(headers).toHaveLength(1);
    expect(headers[0].id).toBe(document.id);

    const entries = await admin.query<Array<{ id: string }>>(
      `SELECT id FROM count_session_entries WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(entries).toHaveLength(2);

    const movements = await admin.query<Array<{ id: string }>>(
      `SELECT id FROM inventory_kardex
        WHERE tenant_id = $1 AND source_document_type = 'AJUSTE_CONTEO'`,
      [tenantId],
    );
    expect(movements).toHaveLength(1);
  });
});
