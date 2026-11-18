import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { Product } from '../../inventory/entities/product.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import { InboundSyncService } from './inbound-sync.service';
import type { InboundSyncQueryDto } from '../dto/inbound-sync.dto';

/**
 * R3-002 (review finding): the recipe-version validity window is pinned by
 * BEHAVIOUR against a MIGRATION-BUILT schema, not by asserting the literal
 * SQL predicate. The unit spec's `toHaveBeenCalledWith('(rv.fecha_inicio_vigencia
 * IS NULL OR ...')` was deleted: any equivalent rewrite (a `.where` group,
 * COALESCE, a query-builder restructure) would have broken it with no
 * observable change. What the contract actually is:
 *
 * A recipe version that is PUBLISHED, active, and inside its validity window
 * must be delivered by the inbound delta — and `fecha_inicio_vigencia` NULL
 * means valid (issue #985). Before the fix the NULL-start version was
 * silently dropped by SQL three-valued logic (`NULL <= :now` is not true),
 * so the terminal had no local recipe, the sale posted as
 * `APPLIED_INVENTORY_PENDING`, and no kardex row was ever written.
 *
 * The window pinned here, in three cases:
 *   1. NULL start + no end        -> PRESENT (with its insumo closure)
 *   2. future start               -> ABSENT
 *   3. past end                   -> ABSENT, while an in-window version
 *                                    (start in the past, end in the future)
 *                                    stays PRESENT
 *
 * Harness follows `sync-batch-deltas.db.spec.ts`: the full migration set
 * builds a scratch schema; the service runs as the fixture's dedicated
 * runtime role (NOSUPERUSER, NOBYPASSRLS) through
 * `runInTenantTransaction`, so the read is the real RLS-bound production
 * path, not a mock. Stubs at constructor positions 2, 4 and 7
 * (catalogValues / recipes / users repositories) are collaborators the
 * `recipeversions` delta never consults; everything participating in this
 * contract is real.
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

const TEST_TIMEOUT_MS = 180000;

describe('InboundSyncService recipe-version validity window (db - Real PostgreSQL, migration-built schema, RLS enforced)', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);

  const tenantId = randomUUID();

  // One product per version: `idx_recipe_versions_active_product` enforces a
  // single active version per (tenant, product), and the service itself
  // rejects two fetched active versions of the same product as ambiguous.
  const productNullId = randomUUID(); // version with NULL start (issue #985)
  const productFutureId = randomUUID(); // version starting in the future
  const productExpiredId = randomUUID(); // version that already ended
  const productInsideId = randomUUID(); // version inside its window

  const versionNullId = randomUUID();
  const versionFutureId = randomUUID();
  const versionExpiredId = randomUUID();
  const versionInsideId = randomUUID();

  const insumoNullId = randomUUID(); // component closure of the NULL-start version
  const insumoInsideId = randomUUID(); // component closure of the in-window version

  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  /** Superuser connection: seeds fixtures and asserts raw row state. */
  let bootstrap: DataSource;
  /** The application-like connection: NOSUPERUSER, NOBYPASSRLS. */
  let runtime: DataSource;
  let service: InboundSyncService;

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    bootstrap = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await bootstrap.initialize();

    // Seed as superuser: the migration-built RLS policies bind the runtime
    // role tenant-wise, and seeding is fixture preparation, not the
    // behaviour under test.
    await bootstrap.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, 'R3-002 recipe window', normalizeTenantSlug('r3-002-window')],
    );

    await bootstrap.query(
      `INSERT INTO products (id, tenant_id, name, uom) VALUES
         ($1, $5, 'Producto vigencia NULL',    'ud'),
         ($2, $5, 'Producto vigencia futura',  'ud'),
         ($3, $5, 'Producto vigencia vencida', 'ud'),
         ($4, $5, 'Producto vigencia activa',  'ud')`,
      [productNullId, productFutureId, productExpiredId, productInsideId, tenantId],
    );

    await bootstrap.query(
      `INSERT INTO insumos (id, tenant_id, name, "purchaseUom", "consumptionUom") VALUES
         ($1, $3, 'Insumo de vigencia NULL',  'KG', 'G'),
         ($2, $3, 'Insumo de vigencia activa','KG', 'G')`,
      [insumoNullId, insumoInsideId, tenantId],
    );

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    await bootstrap.query(
      `INSERT INTO recipe_versions (
         id, tenant_id, product_id, version_number, is_active,
         publication_state, fecha_inicio_vigencia, fecha_fin_vigencia,
         product_name
       ) VALUES
         ($1, $5, $9,  1, true, 'PUBLISHED', NULL,               NULL,                'Vigencia NULL'),
         ($2, $5, $10, 1, true, 'PUBLISHED', $6,                 NULL,                'Vigencia futura'),
         ($3, $5, $11, 1, true, 'PUBLISHED', $7,                 $8,                  'Vigencia vencida'),
         ($4, $5, $12, 1, true, 'PUBLISHED', $7,                 $6,                  'Vigencia activa')`,
      [
        versionNullId,
        versionFutureId,
        versionExpiredId,
        versionInsideId,
        tenantId,
        new Date(now + 7 * DAY_MS), // future bound
        new Date(now - 30 * DAY_MS), // past start
        new Date(now - 1 * DAY_MS), // expired end (yesterday)
        productNullId,
        productFutureId,
        productExpiredId,
        productInsideId,
      ],
    );

    await bootstrap.query(
      `INSERT INTO recipe_details (id, tenant_id, recipe_version_id, insumo_id, quantity) VALUES
         ($1, $5, $3, $6, 0.5000),
         ($2, $5, $4, $7, 0.2500)`,
      [
        randomUUID(), // component of the NULL-start version
        randomUUID(), // component of the in-window version
        versionNullId,
        versionInsideId,
        tenantId,
        insumoNullId,
        insumoInsideId,
      ],
    );

    // The service must run exactly like the deployed app: an ordinary
    // non-owner, non-bypassing role against the migration-built schema.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant, Product, UomConversion, Insumo, RecipeVersion, RecipeDetail],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // Positions matter (see sync-batch-deltas.db.spec.ts): the repositories
    // this delta path consults ride the tenant-bound manager, so the pooled
    // ones below are never used by the `recipeversions` request under test.
    const unusedRepository = {} as never;
    service = new InboundSyncService(
      runtime.getRepository(Product),
      unusedRepository, // 2 catalogValueRepository (not requested)
      runtime.getRepository(Insumo),
      unusedRepository, // 4 recipeRepository (not requested)
      runtime.getRepository(RecipeVersion),
      runtime.getRepository(RecipeDetail),
      unusedRepository, // 7 userRepository (not requested)
    );
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (bootstrap?.isInitialized) await bootstrap.destroy();
    if (fixture) await fixture.close();
  });

  /** The public entry point, with the tenant-bound manager production uses. */
  const pullRecipeVersions = async (): Promise<string[]> => {
    const response = await runInTenantTransaction(
      runtime,
      tenantId,
      (manager) =>
        service.getInboundDeltas(
          tenantId,
          { types: 'recipeversions' } as InboundSyncQueryDto,
          undefined,
          manager,
        ),
    );
    return response.deltas.recipeVersions.map((version) => version.id);
  };

  it(
    'delivers a published recipe version whose effective start date is NULL, with its insumo closure (issue #985 / R3-002)',
    async () => {
      const deliveredIds = await pullRecipeVersions();

      expect(deliveredIds).toContain(versionNullId);

      // Read the delivered version through the public response shape, not the
      // query builder: the insumo closure must have come through too.
      const response = await runInTenantTransaction(runtime, tenantId, (manager) =>
        service.getInboundDeltas(
          tenantId,
          { types: 'recipeversions' } as InboundSyncQueryDto,
          undefined,
          manager,
        ),
      );
      const delivered = response.deltas.recipeVersions.find(
        (version) => version.id === versionNullId,
      );
      expect(delivered).toBeDefined();
      expect(delivered.publicationState).toBe('PUBLISHED');
      expect(delivered.effectiveAt).toBeNull();
      expect(delivered.effectiveUntil).toBeNull();
      expect(delivered.isActive).toBe(true);

      expect(delivered.components).toHaveLength(1);
      expect(delivered.components[0].insumoId).toBe(insumoNullId);

      expect(delivered.insumos).toHaveLength(1);
      expect(delivered.insumos[0]).toMatchObject({
        id: insumoNullId,
        tenantId,
        uom: 'G',
        isActive: true,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does NOT deliver a published recipe version whose effective start date is in the future',
    async () => {
      const deliveredIds = await pullRecipeVersions();

      expect(deliveredIds).not.toContain(versionFutureId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'does NOT deliver a version already past its end date, while one inside its window stays delivered',
    async () => {
      const deliveredIds = await pullRecipeVersions();

      expect(deliveredIds).not.toContain(versionExpiredId);
      expect(deliveredIds).toContain(versionInsideId);
    },
    TEST_TIMEOUT_MS,
  );
});
