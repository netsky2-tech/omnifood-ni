import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { FiscalSetupService, FiscalRegime } from './fiscal-setup.service';
import { FiscalSetupDto } from '../dto/fiscal-setup.dto';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';

/**
 * Company identity parity P1 (odd/tasks/identidad-empresa-paridad.md, S3) —
 * the WRITE side of the absence discipline, pinned against a MIGRATION-BUILT
 * schema.
 *
 * Why this spec exists. `fiscal-setup.service.spec.ts` proves
 * `applyIdentityColumn` against a MOCKED EntityManager, and
 * `test/onboarding/onboarding-sale-ready-acquisition.db.e2e-spec.ts` proves
 * the happy path end to end. Neither proves the absence discipline through
 * the REAL `configureFiscalSetup` UPDATE against the schema the migrations
 * actually build: undefined asserts NOTHING (a previously stored value
 * survives), an explicit null CLEARS the column, a whitespace-only string
 * CLEARS it too — and the column lands as SQL NULL, never as ''.
 *
 * The fixture runs the FULL migration set into a scratch schema
 * (`synchronize` stays off), so if migration
 * 1809970000000-AddCompanyIdentityFieldsToTenants were deleted the columns
 * would not exist and these tests would FAIL — a `synchronize: true`
 * fixture would silently recreate them from the entity and keep passing.
 *
 * Every assertion reads the ROW back through the superuser admin connection
 * with a fresh raw query — never through the in-memory entity the service
 * mutated, so what is pinned is what the database actually holds.
 *
 * Entity-registration trap (shrinkage.service.db.spec.ts): the runtime
 * DataSource must list the RELATION CLOSURE of everything
 * `configureFiscalSetup` touches:
 *   Tenant (no relations);
 *   SystemParametersConfig -> Tenant (ManyToOne, and it is inserted by
 *     `upsertParameter` — append-only supersession);
 *   SystemParametersConfigActiveView (security_invoker view read back for
 *     the POST response and by `upsertParameter`).
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

/** The identity fields this spec exercises, with their per-field fixtures. */
const IDENTITY_FIELDS = ['phone', 'address', 'email'] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

const STORED_VALUES: Record<IdentityField, string> = {
  phone: '+505 2278 9012',
  address: 'Carretera a Masaya km 5, Managua',
  email: 'facturacion@paridad.ni',
};

const REAL_VALUES: Record<IdentityField, string> = {
  phone: '   +505 8888-0000   ',
  address: '  De la rotonda El Güegüense 2c al sur  ',
  email: '  hola@cafeparidad.ni  ',
};

const TRIMMED_VALUES: Record<IdentityField, string> = {
  phone: '+505 8888-0000',
  address: 'De la rotonda El Güegüense 2c al sur',
  email: 'hola@cafeparidad.ni',
};

describe('FiscalSetupService.configureFiscalSetup identity writes (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: FiscalSetupService;

  const seedTenant = async (input: {
    label: string;
    phone?: string | null;
    address?: string | null;
    email?: string | null;
  }): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      `INSERT INTO tenants (id, name, slug, phone, address, email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        input.label,
        normalizeTenantSlug(input.label),
        input.phone ?? null,
        input.address ?? null,
        input.email ?? null,
      ],
    );
    return tenantId;
  };

  /**
   * FRESH read of the identity columns through the bypassing admin role —
   * a new query against the row, never the in-memory entity.
   */
  const storedIdentityColumns = async (
    tenantId: string,
  ): Promise<Record<IdentityField, string | null>> => {
    const rows = await admin.query<Array<Record<IdentityField, string | null>>>(
      `SELECT phone, address, email FROM tenants WHERE id = $1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  /** Base DTO with none of the optional identity fields. The business name
   * is unique per tenant because the migrated schema enforces
   * `uq_tenants_name` and `configureFiscalSetup` writes `tenant.name`. */
  const baseDto = (tenantId: string): FiscalSetupDto => ({
    regime: FiscalRegime.CUOTA_FIJA,
    businessName: `Café Identidad Paridad ${tenantId.slice(0, 8)}`,
    ruc: 'J0310000012345',
    commercialFxSpread: 36.5,
    pricesIncludeTax: true,
  });

  /** Builds the DTO and then REMOVES the named keys, so they are truly
   * absent (undefined), never present-but-null. */
  const dtoOmitting = (
    tenantId: string,
    ...keys: readonly string[]
  ): FiscalSetupDto => {
    const dto = baseDto(tenantId);
    for (const key of keys) {
      delete dto[key as keyof FiscalSetupDto];
    }
    return dto;
  };

  const configureIdentity = async (
    tenantId: string,
    identity: Partial<Pick<FiscalSetupDto, 'phone' | 'address' | 'email'>>,
    omitted: readonly string[] = [],
  ): Promise<FiscalSetupDto> => {
    const dto = dtoOmitting(tenantId, ...omitted);
    Object.assign(dto, identity);
    await service.configureFiscalSetup(tenantId, dto);
    return dto;
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    // Superuser connection: seeding and raw read-back only (bypasses the
    // FORCEd row-level security; `tenants` itself carries no tenant
    // policies, but the parameter tables the service writes do).
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

    // Application-shaped connection: the fixture's runtime role
    // (NOSUPERUSER NOBYPASSRLS, owner of nothing) — the same shape
    // production runs with. Entities are registered ONLY so TypeORM can
    // resolve repository metadata; the schema comes from the migrations.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [
        Tenant,
        SystemParametersConfig,
        SystemParametersConfigActiveView,
      ],
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    service = new FiscalSetupService(
      runtime.getRepository(Tenant),
      new EventEmitter2(),
      runtime,
    );
    // The optional collaborators stay undefined, exactly as in production
    // wiring for this path: recordRevisionChange, onboarding sessions and
    // state reconciliation are out of scope here.
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  describe.each([...IDENTITY_FIELDS])('%s', (field: IdentityField) => {
    it('undefined asserts NOTHING: a previously stored value survives untouched', async () => {
      const tenantId = await seedTenant({
        label: `paridad-undefined-${field}`,
        [field]: STORED_VALUES[field],
      });

      // The seed really landed before the call, so "untouched" below means
      // the UPDATE preserved it — not that it was never there.
      expect((await storedIdentityColumns(tenantId))[field]).toBe(
        STORED_VALUES[field],
      );

      await configureIdentity(tenantId, {}, [field]);

      const row = await storedIdentityColumns(tenantId);
      expect(row[field]).toBe(STORED_VALUES[field]);
    });

    it('an explicit null CLEARS the column to SQL NULL', async () => {
      const tenantId = await seedTenant({
        label: `paridad-null-${field}`,
        [field]: STORED_VALUES[field],
      });

      await configureIdentity(tenantId, { [field]: null });

      const row = await storedIdentityColumns(tenantId);
      expect(row[field]).toBeNull();
    });

    it('a whitespace-only string CLEARS to SQL NULL and never stores an empty string', async () => {
      const tenantId = await seedTenant({
        label: `paridad-blank-${field}`,
        [field]: STORED_VALUES[field],
      });

      await configureIdentity(tenantId, { [field]: '   ' });

      const row = await storedIdentityColumns(tenantId);
      // S3: absence is NULL, declared downstream — never ''.
      expect(row[field]).toBeNull();
      expect(row[field]).not.toBe('');
    });

    it('a real value is trimmed and stored exactly', async () => {
      const tenantId = await seedTenant({
        label: `paridad-trim-${field}`,
      });

      await configureIdentity(tenantId, { [field]: REAL_VALUES[field] });

      const row = await storedIdentityColumns(tenantId);
      expect(row[field]).toBe(TRIMMED_VALUES[field]);
    });
  });

  it('the three disciplines coexist in ONE request: undefined keeps, null clears, blank clears, real value trims', async () => {
    const tenantId = await seedTenant({
      label: 'paridad-mixed-r19',
      phone: STORED_VALUES.phone,
      address: STORED_VALUES.address,
      email: STORED_VALUES.email,
    });

    // phone: absent (no-op) · address: explicit null (clear) ·
    // email: real value (trim & store).
    await configureIdentity(
      tenantId,
      { address: null, email: REAL_VALUES.email },
      ['phone'],
    );

    const row = await storedIdentityColumns(tenantId);
    expect(row.phone).toBe(STORED_VALUES.phone);
    expect(row.address).toBeNull();
    expect(row.address).not.toBe('');
    expect(row.email).toBe(TRIMMED_VALUES.email);
  });
});
