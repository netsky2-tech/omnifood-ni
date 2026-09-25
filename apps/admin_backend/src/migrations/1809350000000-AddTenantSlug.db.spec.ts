import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { AddTenantSlug1809350000000 } from './1809350000000-AddTenantSlug';

/**
 * Real-PostgreSQL contract for the OD-03 tenant slug migration (issue #556,
 * slice 11, founder design): the backfill normalization, deterministic
 * collision resolution, the unique index, NOT NULL enforcement, and
 * reversibility of the derived column.
 *
 * The migration is exercised in isolation against a scratch schema holding
 * the pre-migration `tenants` shape, so the spec proves the migration's own
 * behavior without depending on the full bootstrap ledger.
 */

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const PRE_MIGRATION_TENANTS_DDL = (schema: string) => `
  CREATE TABLE "${schema}".tenants (
    id varchar PRIMARY KEY,
    name varchar NOT NULL,
    ruc varchar,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
`;

const INSERT_TENANT_SQL = (schema: string) => `
  INSERT INTO "${schema}".tenants (id, name, created_at, updated_at)
  VALUES ($1, $2, $3, $3)
`;

async function withFreshSchema(
  work: (dataSource: DataSource, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `tenant_slug_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  let dataSource: DataSource | null = null;
  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(PRE_MIGRATION_TENANTS_DDL(schema));

    // search_path is pinned per connection via connection options (the same
    // recipe as invoices.service.db.spec.ts): pooled connections and
    // migration QueryRunners all resolve the unqualified `tenants` in the
    // migration SQL to the scratch schema.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();

    await work(dataSource, schema);
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

const runUp = (dataSource: DataSource) =>
  new AddTenantSlug1809350000000().up(dataSource.createQueryRunner());

const runDown = (dataSource: DataSource) =>
  new AddTenantSlug1809350000000().down(dataSource.createQueryRunner());

const readSlugs = (dataSource: DataSource, schema: string) =>
  dataSource.query(
    `SELECT id, name, slug FROM "${schema}".tenants ORDER BY created_at, id`,
  );

describe('AddTenantSlug1809350000000 (db)', () => {
  it('backfills slugs with the canonical normalization rule', async () => {
    await withFreshSchema(async (dataSource, schema) => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const tenantC = randomUUID();
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        tenantA,
        'Mi Negocio',
        new Date(),
      ]);
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        tenantB,
        'Café El Nica!',
        new Date(),
      ]);
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        tenantC,
        'Q80 Food   Park 2024',
        new Date(),
      ]);

      await runUp(dataSource);

      const slugs = await readSlugs(dataSource, schema);
      const byId = new Map(slugs.map((row) => [row.id, row.slug]));
      expect(byId.get(tenantA)).toBe('mi-negocio');
      expect(byId.get(tenantB)).toBe('caf-el-nica');
      expect(byId.get(tenantC)).toBe('q80-food-park-2024');
    });
  }, 30000);

  it('resolves normalization collisions deterministically with -2 suffixes', async () => {
    await withFreshSchema(async (dataSource, schema) => {
      const first = randomUUID();
      const second = randomUUID();
      const insertedAt = new Date();
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        first,
        'Mi Negocio',
        insertedAt,
      ]);
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        second,
        'MI   NEGOCIO',
        new Date(insertedAt.getTime() + 1),
      ]);

      await runUp(dataSource);

      const slugs = await readSlugs(dataSource, schema);
      const byId = new Map(slugs.map((row) => [row.id, row.slug]));
      expect(byId.get(first)).toBe('mi-negocio');
      expect(byId.get(second)).toBe('mi-negocio-2');
    });
  }, 30000);

  it('enforces NOT NULL and global uniqueness after the backfill', async () => {
    await withFreshSchema(async (dataSource, schema) => {
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        randomUUID(),
        'Mi Negocio',
        new Date(),
      ]);
      await runUp(dataSource);

      await expect(
        dataSource.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [
          randomUUID(),
          'Slugless Tenant',
        ]),
      ).rejects.toBeInstanceOf(QueryFailedError);
      await expect(
        dataSource.query(
          'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
          [randomUUID(), 'Other Tenant', 'mi-negocio'],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });
  }, 30000);

  it('is reversible and re-derives identical slugs on a fresh up()', async () => {
    await withFreshSchema(async (dataSource, schema) => {
      const tenantId = randomUUID();
      await dataSource.query(INSERT_TENANT_SQL(schema), [
        tenantId,
        'Mi Negocio',
        new Date(),
      ]);
      await runUp(dataSource);
      const afterUp = await readSlugs(dataSource, schema);

      await runDown(dataSource);

      const columns = await dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'tenants' AND column_name = 'slug'`,
      );
      expect(columns).toHaveLength(0);

      await runUp(dataSource);
      const afterRerun = await readSlugs(dataSource, schema);
      expect(afterRerun).toEqual(afterUp);
    });
  }, 30000);
});
