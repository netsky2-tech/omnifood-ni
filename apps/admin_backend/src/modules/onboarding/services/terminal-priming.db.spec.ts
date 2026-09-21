import { randomUUID } from 'crypto';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Product } from '../../inventory/entities/product.entity';
import { CatalogValue } from '../../catalog/entities/catalog-value.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import type { Insumo } from '../../inventory/entities/insumo.entity';
import type { Recipe } from '../../inventory/entities/recipe.entity';
import type { RecipeVersion } from '../../inventory/entities/recipe-version.entity';
import type { RecipeDetail } from '../../inventory/entities/recipe-detail.entity';
import type { User } from '../../identity/entities/user.entity';
import { InboundSyncService } from '../../sales/services/inbound-sync.service';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import {
  TerminalPrimingService,
  TERMINAL_PRIMING_REQUESTED_TYPES,
} from './terminal-priming.service';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { resolveTenantRlsPredicate } from '../../../core/database/tenant-rls-policy';

/**
 * Real-database coverage for the L1-10a terminal priming path's tenant
 * isolation (issue #469).
 *
 * The unit specs prove the mapping and the permission metadata, but the
 * actual isolation mechanism is PostgreSQL row-level security under
 * `runInTenantTransaction`. This spec proves that mechanism against a real
 * PostgreSQL database:
 *
 * - A fresh per-run scratch SCHEMA inside the database the runner provides
 *   via DB_* env vars, dropped afterwards. Random suffixes make concurrent
 *   runs safe, and a stale-run cleanup removes leftovers from crashed runs
 *   sharing the `term_priming` prefix.
 * - Tables come from the real entities via synchronize (the
 *   activation-device-provisioning db spec pattern), so the tenant columns
 *   carry the shapes TypeORM actually maps: products and catalog_values get
 *   uuid tenant columns through their ManyToOne joins, and
 *   fiscal_config_revisions declares its uuid column directly. The row-level
 *   policies are applied with the SAME production resolver the migrations
 *   use (`resolveTenantRlsPredicate`), so the predicates are the production
 *   uuid-cast predicates, not hand-written ones.
 * - All service reads run through a dedicated per-run NOSUPERUSER NOBYPASSRLS
 *   role (the ohac-publication fixture pattern): a superuser would bypass
 *   RLS entirely and prove nothing. The admin (superuser) connection is used
 *   only for provisioning and seeding, which is what makes cross-tenant
 *   seeding possible under FORCED RLS.
 * - Fidelity of the RLS surface mirrors production for this path:
 *   `catalog_values` and `fiscal_config_revisions` are ENABLE + FORCED with
 *   tenant policies (fiscal revisions also get the tenant INSERT policy the
 *   production baseline auto-initialization writes through); `products`
 *   carries NO row-level security in production, exactly as here, so its
 *   isolation comes from the explicit tenant filter.
 * - Every priming call opens a COLD restricted pool. This is a determinism
 *   choice, documented where it is used: it guarantees the control reads in
 *   the catalog and fiscal specs observe a session state the test pinned,
 *   instead of inheriting whatever earlier runs left in a shared pool.
 * - Every value seeded is synthetic (test tenant names, fake RUCs, fake pin
 *   hashes). No real identifier, PIN, password or secret enters this file.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer');
  }
  return port;
}

// Resolved lazily (inside the fixture), not at module scope, so that the
// `itDb` skip convention below can engage cleanly when DB_PASSWORD is absent
// in environments without PostgreSQL.
function postgresConnection() {
  return {
    host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
    port: readPostgresPort(),
    username: process.env.DB_USERNAME?.trim() ?? 'postgres',
    password: getRequiredEnv('DB_PASSWORD'),
    database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
  };
}

const SCHEMA_PREFIX = 'term_priming';

const schemaEntities = [
  Tenant,
  Product,
  CatalogValue,
  FiscalConfigRevision,
  SystemParametersConfig,
  SystemParametersConfigActiveView,
];

interface IsolatedRlsContext {
  admin: DataSource;
  schema: string;
  roleName: string;
  rolePassword: string;
  /**
   * Opens a cold restricted DataSource (NOSUPERSUER NOBYPASSRLS role, empty
   * connection pool). The caller MUST destroy it: `openRestricted` exists so
   * each service call and each control read can pin which session state its
   * connection is in — the app's real pool is shared and warm.
   */
  openRestricted: () => Promise<DataSource>;
  /** Runs `run` with a cold restricted DataSource, destroying it after. */
  withRestricted: <T>(run: (restricted: DataSource) => Promise<T>) => Promise<T>;
}

async function applyTenantRls(
  runner: QueryRunner,
  table: string,
  commands: ReadonlyArray<'select' | 'insert'>,
): Promise<void> {
  await runner.query(
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
  );
  await runner.query(
    `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
  );
  // The real production predicate resolver: the same code the migrations use
  // to emit the policy predicate for the column's actual type.
  const predicate = await resolveTenantRlsPredicate(runner, table);
  for (const command of commands) {
    await runner.query(
      `CREATE POLICY ${table}_tenant_${command} ON "${table}" FOR ${command.toUpperCase()} ` +
        (command === 'insert'
          ? `WITH CHECK (${predicate})`
          : `USING (${predicate})`),
    );
  }
}

async function withIsolatedRlsSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedRlsContext) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({
    type: 'postgres',
    ...postgresConnection(),
  });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const roleName = `${schemaPrefix}_rls_${randomUUID().replace(/-/g, '')}`;
  const rolePassword = randomUUID();
  let admin: DataSource | null = null;

  const openRestricted = (): Promise<DataSource> => {
    const restricted = new DataSource({
      type: 'postgres',
      ...postgresConnection(),
      username: roleName,
      password: rolePassword,
      schema,
      entities: schemaEntities,
      synchronize: false,
      extra: { max: 4 },
    });
    return restricted.initialize();
  };

  const withRestricted = async <T>(
    run: (restricted: DataSource) => Promise<T>,
  ): Promise<T> => {
    const restricted = await openRestricted();
    try {
      return await run(restricted);
    } finally {
      if (restricted.isInitialized) await restricted.destroy();
    }
  };

  try {
    await bootstrap.initialize();

    // Stale-run cleanup: drop leftovers from crashed runs sharing the prefix
    // so a failed run never accumulates schemas or roles. Underscores are
    // escaped so the pattern matches literally; backends are terminated
    // first so DROP ROLE cannot fail on live sessions.
    await bootstrap.query(`
      DO $stale_cleanup$
      DECLARE
        stale record;
      BEGIN
        PERFORM pg_terminate_backend(pid)
          FROM pg_stat_activity
         WHERE usename LIKE 'term\\_priming\\_%' ESCAPE '\\'
           AND pid <> pg_backend_pid();
        FOR stale IN
          SELECT nspname AS name FROM pg_namespace
           WHERE nspname LIKE 'term\\_priming\\_%' ESCAPE '\\'
        LOOP
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', stale.name);
        END LOOP;
        FOR stale IN
          SELECT rolname AS name FROM pg_roles
           WHERE rolname LIKE 'term\\_priming\\_%' ESCAPE '\\'
             AND rolname <> current_user
        LOOP
          EXECUTE format('DROP ROLE IF EXISTS %I', stale.name);
        END LOOP;
      END
      $stale_cleanup$;
    `);

    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection(),
      schema,
      entities: schemaEntities,
      synchronize: true,
      extra: { max: 2 },
    });
    await admin.initialize();

    const ddl = admin.createQueryRunner();
    try {
      await ddl.connect();
      await ddl.query(`SET search_path TO "${schema}", public`);

      // The active-config view is owned by migration 1784000000000
      // (synchronize: false on the view entity); create it with the same DDL
      // the fiscal config reads resolve their governing version through.
      await ddl.query(`
        CREATE OR REPLACE VIEW v_sys_parametros_config_active
        WITH (security_invoker = true)
        AS
        SELECT DISTINCT ON (tenant_id, param_key)
          id,
          tenant_id,
          param_key,
          param_value,
          version,
          effective_from,
          effective_to,
          is_active,
          created_by,
          created_at
        FROM sys_parametros_config
        WHERE is_active = true
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY tenant_id, param_key, version DESC, effective_from, effective_to;
      `);

      // Minimal fixture staff tables, deliberately hand-built (the ohac
      // fixture pattern): the priming path never reads them. They exist only
      // so the payload-purity assertion is exercised against a tenant that
      // actually holds users with security profiles carrying PIN material.
      await ddl.query(`
        CREATE TABLE IF NOT EXISTS users (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          email varchar(255) NOT NULL,
          role varchar(32) NOT NULL,
          is_active boolean NOT NULL DEFAULT true
        );
        CREATE TABLE IF NOT EXISTS security_profiles (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL UNIQUE REFERENCES users(id),
          pin_hash varchar NULL
        );
      `);

      // Production RLS surface for this read path, via the real resolver:
      // catalog_values and fiscal_config_revisions are FORCED; fiscal
      // revisions also carry the tenant INSERT policy the production
      // baseline auto-initialization writes through. products deliberately
      // gets no RLS: it has none in production.
      await applyTenantRls(ddl, 'catalog_values', ['select']);
      await applyTenantRls(ddl, 'fiscal_config_revisions', [
        'select',
        'insert',
      ]);
    } finally {
      await ddl.release();
    }

    await bootstrap.query(
      `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${rolePassword}'`,
    );
    await bootstrap.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${roleName}"`);
    await bootstrap.query(
      `GRANT SELECT ON "${schema}".products,
                        "${schema}".catalog_values,
                        "${schema}".fiscal_config_revisions,
                        "${schema}".tenants,
                        "${schema}".sys_parametros_config,
                        "${schema}".v_sys_parametros_config_active
         TO "${roleName}"`,
    );
    await bootstrap.query(
      `GRANT INSERT ON "${schema}".fiscal_config_revisions TO "${roleName}"`,
    );
    // Role-level search_path: raw SQL in the production paths ignores
    // TypeORM's schema option, exactly like the restricted role in
    // scripts/verify-schema-build.sh.
    await bootstrap.query(
      `ALTER ROLE "${roleName}" SET search_path TO "${schema}", public`,
    );

    await assertion({ admin, schema, roleName, rolePassword, openRestricted, withRestricted });
  } finally {
    if (admin?.isInitialized) await admin.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.query(`DROP ROLE IF EXISTS "${roleName}"`);
      await bootstrap.destroy();
    }
  }
}

async function seedTenant(
  admin: DataSource,
  schema: string,
  tenantId: string,
  name: string,
  ruc: string,
): Promise<void> {
  await admin.query(
    `INSERT INTO "${schema}".tenants (id, name, ruc, is_active) VALUES ($1, $2, $3, true)`,
    [tenantId, name, ruc],
  );
}

async function seedProduct(
  admin: DataSource,
  schema: string,
  tenantId: string,
  name: string,
  uom: string,
): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO "${schema}".products (id, tenant_id, name, uom) VALUES ($1, $2, $3, $4)`,
    [id, tenantId, name, uom],
  );
  return id;
}

async function seedCatalogValue(
  admin: DataSource,
  schema: string,
  tenantId: string,
  catalogType: string,
  code: string,
  label: string,
): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO "${schema}".catalog_values (id, tenant_id, catalog_type, code, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, tenantId, catalogType, code, label],
  );
  return id;
}

async function seedStaffWithPin(
  admin: DataSource,
  schema: string,
  tenantId: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const userId = randomUUID();
    await admin.query(
      `INSERT INTO "${schema}".users (id, tenant_id, email, role, is_active)
       VALUES ($1, $2, $3, 'CASHIER', true)`,
      [userId, tenantId, `${userId}@priming-fixture.test`],
    );
    await admin.query(
      `INSERT INTO "${schema}".security_profiles (id, user_id, pin_hash)
       VALUES ($1, $2, $3)`,
      [randomUUID(), userId, 'test-only-pin-hash-not-a-real-secret'],
    );
  }
}

/**
 * Builds the priming service exactly as the OnboardingModule wires it, but
 * on the given restricted (NOBYPASSRLS) DataSource so every read it issues
 * is subject to the FORCED row-level security. Repositories for delta types
 * priming never requests are unused stubs: the requested types are
 * `TERMINAL_PRIMING_REQUESTED_TYPES` (products, catalogvalues, fiscal).
 */
function buildPrimingService(restricted: DataSource): TerminalPrimingService {
  const unusedInsumoRepo = {} as unknown as Repository<Insumo>;
  const unusedRecipeRepo = {} as unknown as Repository<Recipe>;
  const unusedRecipeVersionRepo = {} as unknown as Repository<RecipeVersion>;
  const unusedRecipeDetailRepo = {} as unknown as Repository<RecipeDetail>;
  const unusedUserRepo = {} as unknown as Repository<User>;
  const fiscalService = new FiscalConfigVersionService(
    restricted.getRepository(FiscalConfigRevision),
    restricted.getRepository(Tenant),
    restricted,
  );
  const inboundSyncService = new InboundSyncService(
    restricted.getRepository(Product),
    restricted.getRepository(CatalogValue),
    unusedInsumoRepo,
    unusedRecipeRepo,
    unusedRecipeVersionRepo,
    unusedRecipeDetailRepo,
    unusedUserRepo,
    fiscalService,
  );
  return new TerminalPrimingService(inboundSyncService, restricted);
}

/**
 * Runs one real priming call against a COLD restricted pool.
 *
 * The cold pool pins the session state the control reads observe. Observed
 * sequencing inside one call: the fiscal sub-read opens its own bound
 * transaction (binds, commits, releases its session back to the pool), the
 * product read then runs (no RLS on products, unaffected), and the catalog
 * read lands on the just-released, already-bound session — where
 * `current_setting('app.tenant_id', true)` returns '' (the placeholder
 * survives the commit) and the uuid-cast policy predicate raises
 * `invalid input syntax for type uuid: ""`. On a never-bound session the
 * same policy predicate would instead silently deny. Both modes are the
 * same defect — the catalog read does not run on the connection
 * `runInTenantTransaction` bound — and the contract assertions below state
 * what the path MUST return once that is fixed.
 */
async function primeWithColdPool(
  context: IsolatedRlsContext,
  tenantId: string,
): Promise<Awaited<ReturnType<TerminalPrimingService['getPrimingPayload']>>> {
  return context.withRestricted((restricted) =>
    buildPrimingService(restricted).getPrimingPayload(tenantId),
  );
}

describe('TerminalPrimingService tenant isolation (db)', () => {
  // Skip convention shared with the existing db specs: without DB_PASSWORD
  // (no database available), the suite skips cleanly instead of failing.
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'returns each tenant only its own products by id, with identical product names across tenants',
    async () => {
      await withIsolatedRlsSchema(
        `${SCHEMA_PREFIX}_products`,
        async (context) => {
          const { admin, schema } = context;
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          await seedTenant(admin, schema, tenantA, 'Tenant Alfa (test)', 'RUC-TEST-000000000001');
          await seedTenant(admin, schema, tenantB, 'Tenant Bravo (test)', 'RUC-TEST-000000000002');

          const productA1 = await seedProduct(admin, schema, tenantA, 'Fanta Naranja 500ml', 'UN');
          const productA2 = await seedProduct(admin, schema, tenantA, 'Pinolero 1L', 'UN');
          // Same name in both tenants: neither may appear in the other's payload.
          const productB1 = await seedProduct(admin, schema, tenantB, 'Fanta Naranja 500ml', 'UN');

          const payloadA = await primeWithColdPool(context, tenantA);
          expect(payloadA.status).toBe('success');
          expect(payloadA.deltas.products.map((p) => p.id).sort()).toEqual(
            [productA1, productA2].sort(),
          );
          expect(payloadA.deltas.products.map((p) => p.id)).not.toContain(productB1);

          const payloadB = await primeWithColdPool(context, tenantB);
          expect(payloadB.deltas.products.map((p) => p.id).sort()).toEqual(
            [productB1].sort(),
          );
          expect(payloadB.deltas.products.map((p) => p.id)).not.toContain(productA1);
          expect(payloadB.deltas.products.map((p) => p.id)).not.toContain(productA2);
        },
      );
    },
  );

  itDb(
    'returns each tenant only its own catalog values by id under FORCED RLS, with identical catalog codes across tenants',
    async () => {
      await withIsolatedRlsSchema(
        `${SCHEMA_PREFIX}_catalog`,
        async (context) => {
          const { admin, schema } = context;
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          await seedTenant(admin, schema, tenantA, 'Tenant Alfa (test)', 'RUC-TEST-000000000001');
          await seedTenant(admin, schema, tenantB, 'Tenant Bravo (test)', 'RUC-TEST-000000000002');

          const catalogA1 = await seedCatalogValue(admin, schema, tenantA, 'uom', 'CAT-TEST-001', 'Bebidas (Alfa)');
          const catalogA2 = await seedCatalogValue(admin, schema, tenantA, 'uom', 'CAT-TEST-002', 'Snacks (Alfa)');
          // Same code in both tenants: neither may appear in the other's payload.
          const catalogB1 = await seedCatalogValue(admin, schema, tenantB, 'uom', 'CAT-TEST-001', 'Bebidas (Bravo)');

          // Control 1: an unbound read on a never-bound session sees nothing —
          // FORCED RLS is real in this schema, not decorative.
          await context.withRestricted(async (restricted) => {
            const unboundRows = await restricted.query(
              `SELECT id FROM "${schema}".catalog_values`,
            );
            expect(unboundRows).toHaveLength(0);
          });

          // Control 2: through the same runInTenantTransaction binding the
          // service is documented to use, the tenant's own rows are visible.
          await context.withRestricted(async (restricted) => {
            const boundRows = await runInTenantTransaction(
              restricted,
              tenantA,
              (manager) =>
                manager.query(
                  `SELECT id FROM "${schema}".catalog_values WHERE tenant_id = $1`,
                  [tenantA],
                ),
            );
            expect(
              boundRows.map((row: { id: string }) => row.id).sort(),
            ).toEqual([catalogA1, catalogA2].sort());
          });

          // Control 3: the pool-taint failure mode. After a committed
          // binding, the same session's current_setting returns '' (the
          // placeholder survives the commit), so the uuid-cast policy
          // predicate raises instead of silently denying. In the app the
          // pool is shared and warm, so the service's catalog read — which
          // does not run on the bound transaction connection — can hit a
          // session in exactly this state.
          await context.withRestricted(async (restricted) => {
            const runner = restricted.createQueryRunner();
            try {
              await runner.connect();
              await runner.query('BEGIN');
              await runner.query(
                "SELECT set_config('app.tenant_id', $1, true)",
                [tenantA],
              );
              await runner.query('COMMIT');
              await expect(
                runner.query(`SELECT id FROM "${schema}".catalog_values`),
              ).rejects.toThrow(/invalid input syntax for type uuid/);
            } finally {
              await runner.release();
            }
          });

          // The service read must ride the same binding the controls proved
          // and return the tenant's own rows by id, never the other
          // tenant's.
          const payloadA = await primeWithColdPool(context, tenantA);
          expect(payloadA.deltas.catalogValues.map((c) => c.id).sort()).toEqual(
            [catalogA1, catalogA2].sort(),
          );
          expect(payloadA.deltas.catalogValues.map((c) => c.id)).not.toContain(catalogB1);

          const payloadB = await primeWithColdPool(context, tenantB);
          expect(payloadB.deltas.catalogValues.map((c) => c.id).sort()).toEqual(
            [catalogB1].sort(),
          );
          expect(payloadB.deltas.catalogValues.map((c) => c.id)).not.toContain(catalogA1);
          expect(payloadB.deltas.catalogValues.map((c) => c.id)).not.toContain(catalogA2);
        },
      );
    },
  );

  itDb(
    'resolves the fiscal snapshot per tenant through the tenant-bound transaction under FORCED RLS',
    async () => {
      await withIsolatedRlsSchema(
        `${SCHEMA_PREFIX}_fiscal`,
        async (context) => {
          const { admin, schema } = context;
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          const nameA = 'Tenant Alfa (test)';
          const nameB = 'Tenant Bravo (test)';
          await seedTenant(admin, schema, tenantA, nameA, 'RUC-TEST-000000000001');
          await seedTenant(admin, schema, tenantB, nameB, 'RUC-TEST-000000000002');

          // Control: without the transaction-local binding, FORCED RLS on
          // fiscal_config_revisions default-denies every row for the
          // restricted role — so whatever the service returns below, it can
          // only come from a tenant-bound transaction.
          await context.withRestricted(async (restricted) => {
            const unboundRows = await restricted.query(
              `SELECT id FROM "${schema}".fiscal_config_revisions`,
            );
            expect(unboundRows).toHaveLength(0);
          });

          const payloadA = await primeWithColdPool(context, tenantA);
          expect(payloadA.deltas.fiscalConfig).toBeDefined();
          expect(payloadA.deltas.fiscalConfig?.businessName).toBe(nameA);
          expect(payloadA.fiscalConfig?.businessName).toBe(nameA);
          expect(payloadA.deltas.fiscalConfig?.configVersion).toBeDefined();

          const payloadB = await primeWithColdPool(context, tenantB);
          expect(payloadB.deltas.fiscalConfig?.businessName).toBe(nameB);
          expect(payloadB.fiscalConfig?.businessName).toBe(nameB);
          expect(payloadB.deltas.fiscalConfig?.businessName).not.toBe(nameA);
        },
      );
    },
  );

  itDb(
    'never serializes a users array or pin material even when the tenant has users with security profiles',
    async () => {
      await withIsolatedRlsSchema(
        `${SCHEMA_PREFIX}_purity`,
        async (context) => {
          const { admin, schema } = context;
          const tenantA = randomUUID();
          await seedTenant(admin, schema, tenantA, 'Tenant Alfa (test)', 'RUC-TEST-000000000001');
          const productA1 = await seedProduct(admin, schema, tenantA, 'Fanta Naranja 500ml', 'UN');
          // Staff with security profiles carrying PIN material exist for the
          // tenant, and the full inbound envelope CAN carry them (its user
          // deltas include security profiles) — the priming surface must not.
          await seedStaffWithPin(admin, schema, tenantA, 2);

          const payload = await primeWithColdPool(context, tenantA);

          // The payload is non-trivial: the product rows are present.
          expect(payload.deltas.products.map((p) => p.id)).toContain(productA1);

          // The requested-types negotiation must not surface a users array.
          expect(TERMINAL_PRIMING_REQUESTED_TYPES).toBe('products,catalogvalues,fiscal');
          expect(payload.deltas).not.toHaveProperty('users');

          const serialized = JSON.stringify(payload);
          expect(serialized).not.toContain('"users"');
          expect(serialized).not.toContain('pinHash');
          expect(serialized).not.toContain('pin_hash');
          expect(serialized).not.toContain('test-only-pin-hash-not-a-real-secret');
        },
      );
    },
  );
});
