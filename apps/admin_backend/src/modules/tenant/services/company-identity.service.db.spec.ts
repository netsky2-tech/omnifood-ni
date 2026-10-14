import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { Tenant } from '../entities/tenant.entity';
import {
  CompanyIdentityService,
  resolveCompanyIdentity,
} from './company-identity.service';

/**
 * R19 T4 — the company identity RESOLVER, pinned against the MIGRATION-BUILT
 * schema and the fixture's NOBYPASSRLS runtime role.
 *
 * Why this spec exists. `company-identity.service.spec.ts` proves the
 * resolver's 32 present/absent combinations against in-memory rows; nothing
 * proves the DB-level counterpart: that a nullable identity column which was
 * never configured — the schema's REAL absence state, `NULL` by design
 * (migration 1809970000000, S3 absence discipline) — resolves as DECLARED
 * ABSENCE (`{ present: false }`), never as an empty string handed to a
 * formal, signable document (S15).
 *
 * The fixture (test/support/migration-built-schema.helper.ts) runs the full
 * migration set into a scratch schema; the runtime role is NOSUPERUSER
 * NOBYPASSRLS and owns nothing, and `service.resolve` opens its own
 * tenant-bound transaction (`runInTenantTransaction`), so the read path is
 * the production read path end to end.
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

describe('CompanyIdentityService resolution (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: CompanyIdentityService;

  const seedTenant = async (input: {
    name: string;
    ruc?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  }): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug, ruc, address, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        input.name,
        input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        input.ruc ?? null,
        input.address ?? null,
        input.phone ?? null,
        input.email ?? null,
      ],
    );
    return tenantId;
  };

  /** Reads the identity columns back through the bypassing admin role. */
  const storedIdentityColumns = async (
    tenantId: string,
  ): Promise<{
    ruc: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  }> => {
    const rows = await admin.query<
      Array<{
        ruc: string | null;
        address: string | null;
        phone: string | null;
        email: string | null;
      }>
    >(`SELECT ruc, address, phone, email FROM tenants WHERE id = $1`, [
      tenantId,
    ]);
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection: seeding only (bypasses RLS; `tenants` is global
    // anyway — 1809370000000 documents it carries no tenant policies).
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

    // Application-shaped connection: the fixture's runtime role. `Tenant`
    // declares no relations, so it alone closes the metadata graph — but it
    // MUST be present or `manager.getRepository(Tenant)` throws
    // EntityMetadataNotFoundError (the trap documented in
    // shrinkage.service.db.spec.ts).
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    service = new CompanyIdentityService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('resolves an unconfigured tenant as declared absence, not as empty strings', async () => {
    const tenantId = await seedTenant({ name: 'Sin Datos SA (T4)' });

    // The schema really holds the absence state this test is about: the
    // identity columns were never configured, so they are NULL.
    const stored = await storedIdentityColumns(tenantId);
    expect(stored.ruc).toBeNull();
    expect(stored.address).toBeNull();
    expect(stored.phone).toBeNull();
    expect(stored.email).toBeNull();

    const identity = await service.resolve(tenantId);

    // `name` is NOT NULL in the migrated schema, so it resolves present.
    expect(identity.name).toEqual({
      present: true,
      value: 'Sin Datos SA (T4)',
    });

    // Every unconfigured field is DECLARED absent (the union's discriminant
    // is `present: false`), never `{ present: true, value: '' }` and never a
    // bare '' leaking through.
    expect(identity.ruc).toEqual({ present: false });
    expect(identity.address).toEqual({ present: false });
    expect(identity.phone).toEqual({ present: false });
    expect(identity.email).toEqual({ present: false });
  });

  it('resolves a fully configured tenant with every field present and exact', async () => {
    const tenantId = await seedTenant({
      name: 'Identidad Completa SA (T4)',
      ruc: 'J0310000456789',
      address: 'Carretera a Masaya km 5, Managua',
      phone: '+505 2278 9012',
      email: 'facturacion@completa.ni',
    });

    const identity = await service.resolve(tenantId);

    expect(identity.name).toEqual({
      present: true,
      value: 'Identidad Completa SA (T4)',
    });
    expect(identity.ruc).toEqual({ present: true, value: 'J0310000456789' });
    expect(identity.address).toEqual({
      present: true,
      value: 'Carretera a Masaya km 5, Managua',
    });
    expect(identity.phone).toEqual({ present: true, value: '+505 2278 9012' });
    expect(identity.email).toEqual({
      present: true,
      value: 'facturacion@completa.ni',
    });
  });

  it('resolves per field: a configured column is present while its NULL siblings stay absent', async () => {
    // Mixed persistence state, the case the 32-combination matrix is about:
    // one field configured, one holding whitespace (a real state a nullable
    // varchar can carry), the rest NULL.
    const tenantId = await seedTenant({
      name: 'Identidad Parcial SA (T4)',
      ruc: '   ',
      phone: '+505 2345 6789',
    });

    const identity = await service.resolve(tenantId);

    expect(identity.name).toEqual({
      present: true,
      value: 'Identidad Parcial SA (T4)',
    });
    expect(identity.phone).toEqual({ present: true, value: '+505 2345 6789' });
    // Whitespace-only text is ABSENCE by the resolver's single rule — the
    // trim happens against the value the database actually returned.
    expect(identity.ruc).toEqual({ present: false });
    expect(identity.address).toEqual({ present: false });
    expect(identity.email).toEqual({ present: false });

    // And the pure function agrees with the service over the SAME row, so
    // the DB spec and the unit matrix test one resolver, not two.
    const stored = await storedIdentityColumns(tenantId);
    expect(
      resolveCompanyIdentity({ ...stored, name: 'Identidad Parcial SA (T4)' }),
    ).toEqual(identity);
  });
});
