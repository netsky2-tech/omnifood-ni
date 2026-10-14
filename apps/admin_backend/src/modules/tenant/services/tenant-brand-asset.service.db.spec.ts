import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { deflateSync } from 'zlib';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { Tenant } from '../entities/tenant.entity';
import { TenantBrandAsset } from '../entities/tenant-brand-asset.entity';
import {
  TenantBrandAssetService,
  validateLogoUpload,
  ValidatedLogoUpload,
  MAX_LOGO_BYTES,
} from './tenant-brand-asset.service';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * Company identity parity P3, slice 1 (S5) — the logo ORIGINAL storage
 * round trip, pinned against a MIGRATION-BUILT schema and the fixture's
 * NOBYPASSRLS runtime role.
 *
 * Why this spec exists. The brand-asset storage claims three things that a
 * unit spec faking the persistence layer cannot see:
 *
 *   1. the bytes SURVIVE the round trip exactly (a bytea column through
 *      TypeORM and Postgres, not a jsonb/base64 path that could re-encode),
 *      with the sha256 of the DECODED bytes as stored;
 *   2. an upload REPLACES the single row per tenant in place — one row, new
 *      sha — and a REJECTED upload never touches the previous logo;
 *   3. the table is tenant-scoped under the FORCEd RLS the migration
 *      installs: another tenant's logo is indistinguishable from no logo.
 *
 * The fixture (test/support/migration-built-schema.helper.ts) runs the FULL
 * migration set into a scratch schema and hands over a runtime role that is
 * NOSUPERUSER NOBYPASSRLS and owns NOTHING, so the SIU policies of
 * 1809980000000 apply exactly as they do in production.
 *
 * Assertions are on OBSERVABLE OUTCOME — the stored row's bytes/hash, the
 * declared absence, the replaced row — never on "a repository method was
 * called". The pure upload validation is exercised here too, because a
 * rejected upload leaving the previous logo untouched is only provable
 * against a row that was already stored.
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

/** Builds a structurally valid 2x1 RGB PNG (IHDR + IDAT + IEND, CRCs set). */
const buildTestPng = (left: number, right: number): Buffer => {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (data: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // One filtered scanline: filter byte 0, then 2 pixels x 3 bytes.
  const raw = Buffer.from([0, left, 128, 64, right, 200, 90]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

describe('TenantBrandAssetService storage round trip (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: TenantBrandAssetService;

  const seedTenant = async (label: string): Promise<string> => {
    const tenantId = randomUUID();
    await admin.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [tenantId, label, `p3-${randomUUID().slice(0, 8)}`],
    );
    return tenantId;
  };

  /** The production upload shape: validate FIRST, then replace in-transaction. */
  const uploadFor = async (tenantId: string, bytes: Buffer): Promise<void> => {
    const validation = validateLogoUpload(
      'image/png',
      bytes.toString('base64'),
    );
    const upload: ValidatedLogoUpload | null = validation.upload;
    if (!upload) {
      throw new Error(`test PNG rejected: ${validation.reason}`);
    }
    await runInTenantTransaction(runtime, tenantId, (manager) =>
      service.replaceWithinManager(manager, tenantId, upload),
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
    // the service under test runs as. Entity classes are registered ONLY so
    // TypeORM resolves metadata — the schema comes from the migrations (the
    // relation closure of what this spec touches: TenantBrandAsset -> Tenant,
    // and Tenant declares no relations, which closes the graph).
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      schema: fixture.schema,
      entities: [Tenant, TenantBrandAsset],
      synchronize: false,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    service = new TenantBrandAssetService(runtime);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    await fixture.close();
  });

  it('stores the decoded bytes and reads them back byte-exact, with the sha256 of the decoded payload', async () => {
    const tenantId = await seedTenant('Brand Round Trip');
    const png = buildTestPng(10, 20);
    await uploadFor(tenantId, png);

    await runInTenantTransaction(runtime, tenantId, async (manager) => {
      const logo = await service.resolveWithinManager(manager, tenantId);
      if (!logo.present) throw new Error('logo should be present after upload');
      expect(logo.contentType).toBe('image/png');
      expect(logo.bytes.equals(png)).toBe(true);
      expect(logo.sha256).toBe(createHash('sha256').update(png).digest('hex'));

      // The REFERENCE the fiscal snapshot carries resolves from the same row.
      const sha = await service.resolveShaWithinManager(manager, tenantId);
      expect(sha).toBe(logo.sha256);
    });

    const rows: Array<{ byte_length: number; content_type: string }> =
      await admin.query(
        'SELECT byte_length, content_type FROM tenant_brand_assets WHERE tenant_id = $1',
        [tenantId],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].byte_length).toBe(png.length);
    expect(rows[0].content_type).toBe('image/png');
  });

  it('declares absence for a tenant with no logo (never an empty buffer)', async () => {
    const tenantId = await seedTenant('Brand Absence');
    await runInTenantTransaction(runtime, tenantId, async (manager) => {
      const logo = await service.resolveWithinManager(manager, tenantId);
      expect(logo.present).toBe(false);
      const sha = await service.resolveShaWithinManager(manager, tenantId);
      expect(sha).toBeNull();
    });
  });

  it('replaces the single row in place: one row, new sha, new bytes', async () => {
    const tenantId = await seedTenant('Brand Replace');
    const first = buildTestPng(10, 20);
    const second = buildTestPng(200, 30);
    await uploadFor(tenantId, first);
    await uploadFor(tenantId, second);

    await runInTenantTransaction(runtime, tenantId, async (manager) => {
      const logo = await service.resolveWithinManager(manager, tenantId);
      if (!logo.present)
        throw new Error('logo should be present after replace');
      expect(logo.bytes.equals(second)).toBe(true);
      expect(logo.bytes.equals(first)).toBe(false);
      expect(logo.sha256).toBe(
        createHash('sha256').update(second).digest('hex'),
      );
    });

    const rows: unknown[] = await admin.query(
      'SELECT id FROM tenant_brand_assets WHERE tenant_id = $1',
      [tenantId],
    );
    expect(rows).toHaveLength(1);
  });

  it('a REJECTED upload leaves the previous logo untouched', async () => {
    const tenantId = await seedTenant('Brand Rejection');
    const png = buildTestPng(10, 20);
    await uploadFor(tenantId, png);

    // Valid base64, accepted content type, but NOT a decodable PNG: the
    // payload is truncated after the signature.
    const truncated = png.subarray(0, 12);
    const rejected = validateLogoUpload(
      'image/png',
      truncated.toString('base64'),
    );
    expect(rejected.upload).toBeNull();
    expect(rejected.reason).toBeTruthy();

    // And an invalid base64 payload is rejected before decoding matters.
    const notBase64 = validateLogoUpload('image/png', 'not base64!!!');
    expect(notBase64.upload).toBeNull();

    // The stored logo is byte-identical to what the FIRST upload wrote.
    await runInTenantTransaction(runtime, tenantId, async (manager) => {
      const logo = await service.resolveWithinManager(manager, tenantId);
      if (!logo.present) throw new Error('previous logo must survive');
      expect(logo.bytes.equals(png)).toBe(true);
    });
  });

  it('enforces the size ceiling and the content-type allowlist', () => {
    const oversize = validateLogoUpload(
      'image/png',
      Buffer.alloc(MAX_LOGO_BYTES + 1, 1).toString('base64'),
    );
    expect(oversize.upload).toBeNull();

    const wrongType = validateLogoUpload('image/webp', 'AAAA');
    expect(wrongType.upload).toBeNull();
  });

  it('isolates tenants under the FORCEd RLS: another tenant reads absence', async () => {
    const tenantA = await seedTenant('Brand Isolation A');
    const tenantB = await seedTenant('Brand Isolation B');
    await uploadFor(tenantA, buildTestPng(1, 2));

    // Tenant B's binding sees its own (empty) brand asset, not A's.
    await runInTenantTransaction(runtime, tenantB, async (manager) => {
      const logo = await service.resolveWithinManager(manager, tenantB);
      expect(logo.present).toBe(false);
    });

    // And the raw catalog holds exactly one row for these two tenants,
    // owned by A (other tests in this suite seed their own tenants, so the
    // count is scoped to this test's pair).
    const rows: Array<{ tenant_id: string }> = await admin.query(
      'SELECT tenant_id FROM tenant_brand_assets WHERE tenant_id IN ($1, $2)',
      [tenantA, tenantB],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantA);
  });
});
