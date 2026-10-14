import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { CompanyIdentityService } from '../../tenant/services/company-identity.service';
import { CountSession } from '../entities/count-session.entity';
import { CountSessionEntry } from '../entities/count-session-entry.entity';
import { CountSessionPrintableService } from './count-session-printable.service';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * R19 T4 (S10-S12) — the printable count-list READ path, pinned against a
 * MIGRATION-BUILT schema and the fixture's NOBYPASSRLS runtime role.
 *
 * Why this spec exists. `count-session-printable.service.spec.ts` fakes the
 * tenant binding at the DataSource boundary, so the platform-level claim —
 * a tenant cannot read another tenant's count list — is asserted nowhere
 * against the real row-level security. `SELECT` on count_sessions /
 * count_session_entries is exactly what an unproven binding gets wrong.
 *
 * The fixture (test/support/migration-built-schema.helper.ts) runs the FULL
 * migration set into a scratch schema and hands over a runtime role that is
 * NOSUPERUSER NOBYPASSRLS and owns NOTHING (the migration role owns the
 * objects), so the FORCEd RLS policies apply exactly as they do in
 * production. If this service ever read through an owner/superuser
 * connection, the isolation test below would fail loudly instead of the
 * suite silently passing around the protection.
 *
 * Assertions are on OBSERVABLE OUTCOME — a produced PDF whose printed text
 * carries the seeded frozen rows — never on "a repository method was
 * called". The renderer's structure is unit-tested
 * (count-session-pdf.renderer.spec.ts); here the document only has to prove
 * WHICH rows fed it.
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

describe('CountSessionPrintableService read path (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let unboundRuntime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: CountSessionPrintableService;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, label, label.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
    );
    return tenantId;
  };

  /**
   * Only tenant_id, name, purchaseUom and consumptionUom are NOT NULL
   * without a default on `insumos` (see shrinkage.service.db.spec.ts). The
   * row exists to satisfy `fk_count_session_entries_insumo`, which
   * references `insumos (tenant_id, id)`.
   */
  const seedInsumo = async (input: {
    tenantId: string;
    name: string;
  }): Promise<string> => {
    const insumoId = randomUUID();
    await admin.query(
      `INSERT INTO insumos
         (id, tenant_id, name, "purchaseUom", "consumptionUom")
       VALUES ($1, $2, $3, 'kg', 'kg')`,
      [insumoId, input.tenantId, input.name],
    );
    return insumoId;
  };

  const seedCountSession = async (input: {
    tenantId: string;
    sessionId: string;
    warehouseName: string;
    insumoId: string;
    insumoName: string;
  }): Promise<void> => {
    await admin.query(
      `INSERT INTO count_sessions
         (id, tenant_id, warehouse_id, warehouse_name, status, notes,
          cutoff_at, posted_at)
       VALUES ($1, $2, 'wh-1', $3, 'POSTED', NULL,
               '2026-10-14T15:00:00Z', '2026-10-14T16:00:00Z')`,
      [input.sessionId, input.tenantId, input.warehouseName],
    );
    // Two counted entries so the read path demonstrably reads the ENTRIES,
    // not just the header. The uniqueness guard is
    // (tenant_id, session_id, line_id, entry_index).
    await admin.query(
      `INSERT INTO count_session_entries
         (tenant_id, session_id, line_id, line_index, entry_index,
          insumo_id, insumo_name, uom, theoretical_quantity,
          counted_quantity, counted_at, actor_label, notes,
          is_disputed, is_approved)
       VALUES
         ($1, $2, 'line-1', 0, 0, $3, $4, 'kg', 8.0000, 7.5000,
          '2026-10-14T09:35:00Z', 'María López', NULL, false, true),
         ($1, $2, 'line-2', 1, 0, $3, $4, 'kg', 10.0000, 12.0000,
          '2026-10-14T09:52:00Z', 'Juan Pérez', 'faltante en repisa',
          true, false)`,
      [input.tenantId, input.sessionId, input.insumoId, input.insumoName],
    );
  };

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

    // Application-shaped connection: the fixture's runtime role, the role
    // the service under test runs as. The schema comes from the migration
    // set (synchronize stays off); the entity classes are registered ONLY
    // so TypeORM can resolve repository metadata, never to define DDL.
    //
    // The list is the RELATION CLOSURE of what the exercised code touches
    // (the EntityMetadataNotFoundError trap documented in
    // shrinkage.service.db.spec.ts):
    //   CountSession -> Tenant
    //   CountSessionEntry -> Tenant, CountSession
    //   Tenant declares no relations, which is what closes the graph.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant, CountSession, CountSessionEntry],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // Real collaborators on the real connection: the identity read shares
    // the printable service's transaction (S4), so it must be the REAL
    // CompanyIdentityService over the SAME runtime DataSource, not a stub.
    service = new CountSessionPrintableService(
      runtime,
      new CompanyIdentityService(runtime),
    );

    // A second runtime-role connection that is NEVER tenant-bound, used only
    // by the fail-closed assertion. It cannot share `runtime`'s pool: a
    // session that has once carried a transaction-local `app.tenant_id`
    // keeps the custom-GUC placeholder and reports '' (not NULL) from
    // `current_setting(..., true)` afterwards — the uuid cast then DENIES
    // the read by raising, instead of by returning zero rows. Both modes
    // deny the read; this spec pins the silent one on a pristine session.
    unboundRuntime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant, CountSession, CountSessionEntry],
      ...poolCleanupExtra,
    });
    await unboundRuntime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (unboundRuntime?.isInitialized) await unboundRuntime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('runs the service as a role that owns nothing, so the RLS policies bind it', async () => {
    // The isolation claim below is only probative if the connection the
    // service uses cannot bypass row-level security. This pins the fixture
    // property that guarantees it: the runtime role is not the migration
    // role, and the migration role owns the tables (FORCE RLS therefore
    // applies to every read the service makes).
    expect(fixture.runtimeRoleName).not.toBe(fixture.migrationRoleName);
    const owners = await admin.query<Array<{ tableowner: string }>>(
      `SELECT tableowner FROM pg_tables
        WHERE schemaname = $1 AND tablename = 'count_sessions'`,
      [fixture.schema],
    );
    expect(owners).toHaveLength(1);
    expect(owners[0].tableowner).toBe(fixture.migrationRoleName);
  });

  it('reads the seeded session, its entries and the resolved identity, and renders them into the PDF', async () => {
    const tenantId = await seedTenant('Conteo Happy Path SA');
    const insumoId = await seedInsumo({
      tenantId,
      name: 'Harina de trigo (T4 happy)',
    });
    // An id with characters outside [A-Za-z0-9._-], so the returned filename
    // proves the seeded session id flowed through the sanitizer.
    const sessionId = 'CS/2026-001 A';

    await seedCountSession({
      tenantId,
      sessionId,
      warehouseName: 'Bodega Central T4',
      insumoId,
      insumoName: 'Harina de trigo (T4 happy)',
    });

    // Full identity, so the header provably carries the RESOLVED identity
    // read inside the same tenant-bound transaction (S4/S14).
    await admin.query(
      `UPDATE tenants
          SET ruc = 'J0310001234567', address = 'Barrio El Huente, León',
              phone = '+505 2512 3456', email = 'facturacion@conteo.ni'
        WHERE id = $1`,
      [tenantId],
    );

    const result = await service.buildPrintableCountList(tenantId, sessionId, {
      compress: false,
    });

    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('conteo-fisico-CS-2026-001-A.pdf');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');

    // What the document PROVES is tied to the seeded session: the printed
    // text carries the session id, the seeded warehouse and the FROZEN
    // entry fields (S12) read back from the rows — not anything the service
    // could have invented without the DB read. Same extraction technique as
    // count-session-pdf.renderer.spec.ts (the content streams are rendered
    // uncompressed above), WinAnsi/Latin-1 caveat included.
    const text = extractPrintedText(result.buffer);
    expect(text).toContain('Conteo Happy Path SA');
    expect(text).toContain('J0310001234567');
    expect(text).toContain('CS/2026-001 A');
    expect(text).toContain('Bodega Central T4');
    expect(text).toContain('Harina de trigo (T4 happy)');
    expect(text).toContain('María López');
    expect(text).toContain('Juan Pérez');
    expect(text).toContain('faltante en repisa');
  });

  it('REFUSES to print another tenant’s session: tenant B’s document exists, tenant A’s context cannot read it', async () => {
    const tenantA = await seedTenant('Aislamiento Inquilino A');
    const tenantB = await seedTenant('Aislamiento Inquilino B');
    const insumoB = await seedInsumo({
      tenantId: tenantB,
      name: 'Azúcar estándar (T4 B)',
    });
    const sessionB = 'CS/2026-999 B';

    await seedCountSession({
      tenantId: tenantB,
      sessionId: sessionB,
      warehouseName: 'Bodega de B',
      insumoId: insumoB,
      insumoName: 'Azúcar estándar (T4 B)',
    });

    // Control, via ADMIN (RLS-bypassing): tenant B's session really is
    // persisted. The refusal below therefore comes from the tenant
    // isolation, not from a missing row.
    const persisted = await admin.query<Array<{ id: string }>>(
      `SELECT id FROM count_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantB, sessionB],
    );
    expect(persisted).toHaveLength(1);

    // And tenant B's OWN context can print its session — proving the
    // service, the read path and the seeding all work for the rightful
    // tenant.
    const ownDocument = await service.buildPrintableCountList(
      tenantB,
      sessionB,
      { compress: false },
    );
    expect(ownDocument.buffer.length).toBeGreaterThan(0);

    // THE CORE: under tenant A's context, tenant B's session is
    // indistinguishable from a missing one. The service fails the way the
    // code actually fails — the RLS-filtered read finds no row and the
    // service raises NotFoundException (`count-session-printable.service.ts`
    // `if (!session) throw new NotFoundException(...)`).
    await expect(
      service.buildPrintableCountList(tenantA, sessionB),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters count_sessions and count_session_entries to the bound tenant even WITHOUT a WHERE clause', async () => {
    // The service-level refusal above is necessary but not sufficient: its
    // own `where: { tenant_id: tenantA, ... }` would hide tenant B's rows
    // even with row-level security broken. THE platform claim — SELECT on
    // these tables is tenant-scoped by the database itself — is asserted
    // directly here, through the runtime role and the migrated policies.
    const tenantA = await seedTenant('Rls Sin Where A');
    const tenantB = await seedTenant('Rls Sin Where B');
    const insumoA = await seedInsumo({
      tenantId: tenantA,
      name: 'Café molido (RLS A)',
    });
    await seedCountSession({
      tenantId: tenantA,
      sessionId: 'CS/RLS-001',
      warehouseName: 'Bodega RLS A',
      insumoId: insumoA,
      insumoName: 'Café molido (RLS A)',
    });
    const insumoB = await seedInsumo({
      tenantId: tenantB,
      name: 'Café molido (RLS B)',
    });
    await seedCountSession({
      tenantId: tenantB,
      sessionId: 'CS/RLS-002',
      warehouseName: 'Bodega RLS B',
      insumoId: insumoB,
      insumoName: 'Café molido (RLS B)',
    });

    // Bound context, NO tenant predicate in the SQL: only the bound
    // tenant's rows come back, for the header and for the entries.
    const boundSessions = await runInTenantTransaction(
      runtime,
      tenantA,
      (manager) =>
        manager.query(
          `SELECT id, tenant_id::text AS tenant FROM count_sessions`,
        ),
    );
    expect(boundSessions).toHaveLength(1);
    expect(boundSessions[0].id).toBe('CS/RLS-001');
    expect(boundSessions[0].tenant).toBe(tenantA);

    const boundEntries = await runInTenantTransaction(
      runtime,
      tenantA,
      (manager) =>
        manager.query(`SELECT session_id FROM count_session_entries`),
    );
    expect(boundEntries).toHaveLength(2);
    for (const entry of boundEntries) {
      expect(entry.session_id).toBe('CS/RLS-001');
    }

    // No context ever bound on this pristine session: the missing setting
    // resolves to NULL in the predicate and the policies DENY everything
    // (fail closed, zero rows). Verified against the server: a FRESH
    // session's `current_setting('app.tenant_id', true)` is NULL; only a
    // session that once carried a local binding reports '' instead, which
    // denies by raising on the uuid cast — also a denial, not relied on
    // here (see the unboundRuntime note in beforeAll).
    const unbound = await unboundRuntime.query(`SELECT id FROM count_sessions`);
    expect(unbound).toHaveLength(0);
  });
});

/**
 * Local copy of the renderer spec's printed-text extractor (it lives in a
 * unit spec file that a DB run must not execute as a side effect of the
 * import). Valid ONLY for buffers rendered with `compress: false`; see the
 * full technique and its caveats in count-session-pdf.renderer.spec.ts.
 */
const extractPrintedText = (buffer: Buffer): string => {
  const raw = buffer.toString('latin1');
  let out = '';
  const operator =
    /\[((?:<[^>]*>|-?\d+(?:\.\d+)?|\s)*)\]\s*TJ|\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = operator.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      const hexes = match[1].match(/<([^>]*)>/g) ?? [];
      for (const hex of hexes) {
        out += Buffer.from(hex.slice(1, -1), 'hex').toString('latin1');
      }
    } else if (match[2] !== undefined) {
      out += match[2].replace(/\\([()\\])/g, '$1');
    }
  }
  return out;
};
