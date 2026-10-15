import { randomUUID } from 'crypto';
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import path = require('path');
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { TenantBrandAsset } from '../../src/modules/tenant/entities/tenant-brand-asset.entity';
import { CountSession } from '../../src/modules/inventory/entities/count-session.entity';
import { CountSessionEntry } from '../../src/modules/inventory/entities/count-session-entry.entity';
import { CompanyIdentityService } from '../../src/modules/tenant/services/company-identity.service';
import {
  TenantBrandAssetService,
  validateLogoUpload,
} from '../../src/modules/tenant/services/tenant-brand-asset.service';
import { CountSessionPrintableService } from '../../src/modules/inventory/services/count-session-printable.service';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';

/**
 * R19 T3 / company-identity parity P3 — HUMAN ARTIFACT PRODUCER, not a
 * regression spec.
 *
 * This spec's product is a FILE: a real, professional count-list PDF,
 * rendered through the ACTUAL read path (CountSessionPrintableService →
 * CompanyIdentityService → TenantBrandAssetService → renderCountSessionPdf)
 * against a REAL migration-built schema (createMigrationBuiltSchemaFixture)
 * with a REAL persisted session, REAL resolved identity and a REAL logo
 * original. Nothing here is judged by a test: "professional and formal" is
 * the owner's call (S14, odd/tasks/nucleo-inventario-conteo-persistente.md).
 * The assertions below are sanity rails so the artifact producer fails
 * loudly instead of silently writing a broken file — a person, not this
 * spec, decides whether the document looks right.
 *
 * Output: <repo>/odd/artifacts/r19-count-session-pdf-sample.pdf
 *
 * The logo bytes are the dashboard's real shipped PNG original
 * (apps/owner_dashboard/src/assets/logo.png), uploaded through the REAL
 * validation + storage path (validateLogoUpload → replaceWithinManager) so
 * every byte the PDF embeds comes from the real schema and the real seam.
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

/** Repo root, resolved from this spec: apps/admin_backend/test/artifacts → root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const LOGO_PATH = path.join(
  REPO_ROOT,
  'apps',
  'owner_dashboard',
  'src',
  'assets',
  'logo.png',
);
const OUTPUT_DIR = path.join(REPO_ROOT, 'odd', 'artifacts');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'r19-count-session-pdf-sample.pdf');

/** Realistic counted entries: several actors, instants, one disputed. */
const SEED_ENTRIES: ReadonlyArray<{
  name: string;
  uom: string;
  theoretical: string;
  counted: string;
  countedAt: string;
  actor: string;
  notes: string | null;
  disputed: boolean;
  approved: boolean;
}> = [
  { name: 'Harina de trigo', uom: 'kg', theoretical: '8.0000', counted: '7.5000', countedAt: '2026-10-14T09:35:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Azúcar granulada', uom: 'kg', theoretical: '10.0000', counted: '12.0000', countedAt: '2026-10-14T09:52:00Z', actor: 'Juan Pérez', notes: 'faltante en repisa B-3 — posible merma no registrada', disputed: true, approved: false },
  { name: 'Arroz parboiled', uom: 'bulto', theoretical: '24.0000', counted: '24.0000', countedAt: '2026-10-14T10:05:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Aceite vegetal 1L', uom: 'unid', theoretical: '60.0000', counted: '58.0000', countedAt: '2026-10-14T10:21:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
  { name: 'Sal de mesa', uom: 'kg', theoretical: '15.5000', counted: '15.5000', countedAt: '2026-10-14T10:33:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Leche en polvo', uom: 'unid', theoretical: '40.0000', counted: '41.0000', countedAt: '2026-10-14T10:47:00Z', actor: 'Ana Rodríguez', notes: 'sobrante del depósito secundario, integrado al conteo', disputed: false, approved: true },
  { name: 'Frijol rojo', uom: 'kg', theoretical: '22.0000', counted: '21.7500', countedAt: '2026-10-14T11:02:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Café molido 400g', uom: 'unid', theoretical: '35.0000', counted: '35.0000', countedAt: '2026-10-14T11:18:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Mantequilla lote 09', uom: 'kg', theoretical: '6.2500', counted: '6.0000', countedAt: '2026-10-14T11:30:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
  { name: 'Galletas surtidas', uom: 'caja', theoretical: '18.0000', counted: '18.0000', countedAt: '2026-10-14T11:44:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Jugo en polvo', uom: 'caja', theoretical: '50.0000', counted: '49.0000', countedAt: '2026-10-14T12:01:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Pasta corta', uom: 'kg', theoretical: '12.0000', counted: '12.2500', countedAt: '2026-10-14T12:15:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
  { name: 'Atún enlatado', uom: 'unid', theoretical: '96.0000', counted: '96.0000', countedAt: '2026-10-14T12:29:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Salsa de tomate', uom: 'unid', theoretical: '72.0000', counted: '70.0000', countedAt: '2026-10-14T12:40:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Detergente en polvo', uom: 'bulto', theoretical: '9.0000', counted: '9.0000', countedAt: '2026-10-14T12:55:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
  { name: 'Cloro 1L', uom: 'unid', theoretical: '30.0000', counted: '29.0000', countedAt: '2026-10-14T13:08:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Papel higiénico', uom: 'paquete', theoretical: '45.0000', counted: '45.0000', countedAt: '2026-10-14T13:22:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Jabón de baño', uom: 'unid', theoretical: '80.0000', counted: '82.0000', countedAt: '2026-10-14T13:37:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
  { name: 'Shampoo 400ml', uom: 'unid', theoretical: '25.0000', counted: '24.0000', countedAt: '2026-10-14T13:50:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Crema dental', uom: 'unid', theoretical: '55.0000', counted: '55.0000', countedAt: '2026-10-14T14:03:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Gas propano 25lb', uom: 'unid', theoretical: '14.0000', counted: '13.0000', countedAt: '2026-10-14T14:18:00Z', actor: 'Ana Rodríguez', notes: 'tanque devuelto vacío sin registro de salida', disputed: false, approved: true },
  { name: 'Fósforos', uom: 'caja', theoretical: '100.0000', counted: '100.0000', countedAt: '2026-10-14T14:31:00Z', actor: 'María López', notes: null, disputed: false, approved: true },
  { name: 'Velas', uom: 'caja', theoretical: '20.0000', counted: '20.0000', countedAt: '2026-10-14T14:44:00Z', actor: 'Juan Pérez', notes: null, disputed: false, approved: true },
  { name: 'Pilas AA', uom: 'paquete', theoretical: '36.0000', counted: '36.0000', countedAt: '2026-10-14T14:58:00Z', actor: 'Ana Rodríguez', notes: null, disputed: false, approved: true },
];

describe('R19 count-list PDF HUMAN ARTIFACT (real DB, real renderer, real logo)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: CountSessionPrintableService;

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

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

    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant, TenantBrandAsset, CountSession, CountSessionEntry],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    service = new CountSessionPrintableService(
      runtime,
      new CompanyIdentityService(runtime),
      new TenantBrandAssetService(runtime),
    );
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('renders the formal count-list PDF from real persisted rows and writes it to odd/artifacts', async () => {
    const logoBytes = readFileSync(LOGO_PATH);
    const upload = validateLogoUpload('image/png', logoBytes.toString('base64'));
    expect(upload.ok).toBe(true);
    expect(upload.upload).not.toBeNull();

    const tenantId = randomUUID();
    const sessionId = 'CS-2026-R19-ART';

    // Tenant with the FULL identity the formal header should carry.
    await admin.query(
      `INSERT INTO tenants (id, name, slug, ruc, address, phone, email)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        'Distribuidora Nhilos, S.A.',
        'distribuidora-nhilos-artifact',
        'J0310000187654',
        'De la Iglesia La Merced 2c al Norte, León, Nicaragua',
        '+505 2311 4500',
        'facturacion@nhilos.ni',
      ],
    );

    const session = await admin.query<Array<{ id: string }>>(
      `INSERT INTO count_sessions
         (id, tenant_id, warehouse_id, warehouse_name, status, notes,
          cutoff_at, posted_at)
       VALUES ($1, $2, 'wh-central', 'Bodega Central — Mercado Central',
               'POSTED', $3, '2026-10-14T15:00:00Z', '2026-10-14T16:05:00Z')
       RETURNING id`,
      [
        sessionId,
        tenantId,
        'Recuento quincenal de verificación, realizado al cierre de la jornada matutina.',
      ],
    );
    expect(session).toHaveLength(1);

    // One insumo per entry (FK closure) + the entries themselves, from the
    // seeded table above — real rows, real schema, real constraints.
    for (let i = 0; i < SEED_ENTRIES.length; i += 1) {
      const entry = SEED_ENTRIES[i];
      const insumoId = randomUUID();
      await admin.query(
        `INSERT INTO insumos
           (id, tenant_id, name, "purchaseUom", "consumptionUom")
         VALUES ($1, $2, $3, $4, $4)`,
        [insumoId, tenantId, entry.name, entry.uom],
      );
      await admin.query(
        `INSERT INTO count_session_entries
           (tenant_id, session_id, line_id, line_index, entry_index,
            insumo_id, insumo_name, uom, theoretical_quantity,
            counted_quantity, counted_at, actor_label, notes,
            is_disputed, is_approved)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          tenantId,
          sessionId,
          `line-${i + 1}`,
          i,
          insumoId,
          entry.name,
          entry.uom,
          entry.theoretical,
          entry.counted,
          entry.countedAt,
          entry.actor,
          entry.notes,
          entry.disputed,
          entry.approved,
        ],
      );
    }

    // The REAL logo original, through the REAL validation and storage seam.
    // The write goes through the runtime role inside a tenant-bound
    // transaction, exactly as the application writes it (the admin seeding
    // connection registers no entities).
    await runInTenantTransaction(runtime, tenantId, (manager) =>
      new TenantBrandAssetService(runtime).replaceWithinManager(
        manager,
        tenantId,
        upload.upload!,
      ),
    );

    // The artifact itself: the REAL production render (compressed).
    const artifact = await service.buildPrintableCountList(tenantId, sessionId);
    expect(artifact.buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');

    // Sanity render, uncompressed, so the printed text can be checked and
    // the true page count read off the page objects.
    const check = await service.buildPrintableCountList(tenantId, sessionId, {
      compress: false,
    });
    const text = extractPrintedText(check.buffer);
    expect(text).toContain('Distribuidora Nhilos, S.A.');
    expect(text).toContain('J0310000187654');
    expect(text).toContain('María López');
    expect(text).toContain('posible merma no registrada');
    const pages = (check.buffer.toString('latin1').match(/\/Type \/Page[^s]/g) ?? [])
      .length;
    expect(pages).toBeGreaterThanOrEqual(1);

    // THE PRODUCT: write the artifact for a human to judge.
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_PATH, artifact.buffer);

    const stat = statSync(OUTPUT_PATH);
    // eslint-disable-next-line no-console
    console.log(
      `[artifact] ${OUTPUT_PATH} — ${pages} page(s), ${stat.size} bytes, sha256 ${createHash('sha256').update(artifact.buffer).digest('hex')}`,
    );
    expect(stat.size).toBeGreaterThan(10000);
  });
});

/**
 * Printed-text extractor for buffers rendered with `compress: false`.
 * Same technique as count-session-pdf.renderer.spec.ts and
 * count-session-printable.service.db.spec.ts, with the same WinAnsi caveat.
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
