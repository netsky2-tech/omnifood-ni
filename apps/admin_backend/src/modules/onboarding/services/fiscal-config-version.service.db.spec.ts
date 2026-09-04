import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { FiscalRegime } from '../dto/fiscal-setup.dto';
import { ConflictException } from '@nestjs/common';

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

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: { dataSource: DataSource; schema: string }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [Tenant, SystemParametersConfig, FiscalConfigRevision],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    await assertion({ dataSource, schema });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

async function seedTenant(
  dataSource: DataSource,
  tenantId: string,
  name: string,
  ruc: string | null = null,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO tenants (id, name, ruc, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())`,
    [tenantId, name, ruc],
  );
}

async function seedFiscalParams(
  dataSource: DataSource,
  tenantId: string,
  regime: FiscalRegime,
  taxRate: number,
  pricesIncludeTax: boolean,
  commercialFxSpread: number,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO sys_parametros_config (tenant_id, param_key, param_value, version, effective_from, is_active, created_at)
     VALUES ($1, 'FISCAL_REGIME', $2, 1, now(), true, now()),
            ($1, 'TAX_RATE_IVA', $3, 1, now(), true, now()),
            ($1, 'PRICES_INCLUDE_TAX', $4, 1, now(), true, now()),
            ($1, 'COMMERCIAL_FX_SPREAD', $5, 1, now(), true, now())`,
    [
      tenantId,
      JSON.stringify(regime),
      taxRate,
      pricesIncludeTax,
      commercialFxSpread,
    ],
  );
}

describe('FiscalConfigVersionService — Real PostgreSQL Persistence', () => {
  it('initializes baseline revision 1 with canonical fingerprint in real database', async () => {
    await withIsolatedSchema('fiscal_rev_init', async ({ dataSource }) => {
      const tenantId = randomUUID();
      await seedTenant(
        dataSource,
        tenantId,
        'Tortillería Doña Haydee',
        'J0310000000001',
      );
      await seedFiscalParams(
        dataSource,
        tenantId,
        FiscalRegime.CUOTA_FIJA,
        0.0,
        true,
        0.5,
      );

      const service = new FiscalConfigVersionService(
        dataSource.getRepository(FiscalConfigRevision),
        dataSource.getRepository(Tenant),
        dataSource.getRepository(SystemParametersConfig),
        dataSource,
      );

      const snapshot = await service.getFiscalConfigSnapshot(tenantId);

      expect(snapshot.configVersion.revision).toBe(1);
      expect(snapshot.configVersion.fingerprint).toHaveLength(64);
      expect(snapshot.businessName).toBe('Tortillería Doña Haydee');
      expect(snapshot.taxRate).toBe(0.0);

      // Verify row in real DB table
      const rows = await dataSource.query(
        `SELECT * FROM fiscal_config_revisions WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].revision).toBe(1);
      expect(rows[0].fingerprint).toBe(snapshot.configVersion.fingerprint);
    });
  });

  it('strictly increments revision only upon material changes, and is idempotent otherwise', async () => {
    await withIsolatedSchema('fiscal_rev_monotonic', async ({ dataSource }) => {
      const tenantId = randomUUID();
      await seedTenant(
        dataSource,
        tenantId,
        'Fritanga El Madroño',
        'J0310000000002',
      );
      await seedFiscalParams(
        dataSource,
        tenantId,
        FiscalRegime.CUOTA_FIJA,
        0.0,
        true,
        0.5,
      );

      const service = new FiscalConfigVersionService(
        dataSource.getRepository(FiscalConfigRevision),
        dataSource.getRepository(Tenant),
        dataSource.getRepository(SystemParametersConfig),
        dataSource,
      );

      // 1. Initial revision 1
      const rev1 = await service.recordRevisionChange(tenantId);
      expect(rev1.revision).toBe(1);

      // 2. Idempotent call without config changes => same revision 1
      const rev1Again = await service.recordRevisionChange(tenantId);
      expect(rev1Again.revision).toBe(1);
      expect(rev1Again.fingerprint).toBe(rev1.fingerprint);

      let count = await dataSource.query(
        `SELECT COUNT(*) as count FROM fiscal_config_revisions WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(Number(count[0].count)).toBe(1);

      // 3. Update tax rate in DB (material change)
      await dataSource.query(
        `UPDATE sys_parametros_config SET param_value = '0.15' WHERE tenant_id = $1 AND param_key = 'TAX_RATE_IVA'`,
        [tenantId],
      );

      const rev2 = await service.recordRevisionChange(tenantId);
      expect(rev2.revision).toBe(2);
      expect(rev2.fingerprint).not.toBe(rev1.fingerprint);

      count = await dataSource.query(
        `SELECT COUNT(*) as count FROM fiscal_config_revisions WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(Number(count[0].count)).toBe(2);

      // 4. Update regime (another material change)
      await dataSource.query(
        `UPDATE sys_parametros_config SET param_value = '"REGIMEN_GENERAL"' WHERE tenant_id = $1 AND param_key = 'FISCAL_REGIME'`,
        [tenantId],
      );

      const rev3 = await service.recordRevisionChange(tenantId);
      expect(rev3.revision).toBe(3);
      expect(rev3.fingerprint).not.toBe(rev2.fingerprint);
    });
  });

  it('detects and enforces INTEGRITY_CONFLICT when revision has mismatched fingerprint', async () => {
    await withIsolatedSchema('fiscal_rev_conflict', async ({ dataSource }) => {
      const tenantId = randomUUID();
      await seedTenant(dataSource, tenantId, 'Comedor La Bendición', null);
      await seedFiscalParams(
        dataSource,
        tenantId,
        FiscalRegime.CUOTA_FIJA,
        0.0,
        true,
        0.5,
      );

      const service = new FiscalConfigVersionService(
        dataSource.getRepository(FiscalConfigRevision),
        dataSource.getRepository(Tenant),
        dataSource.getRepository(SystemParametersConfig),
        dataSource,
      );

      const rev1 = await service.recordRevisionChange(tenantId);

      // Matching revision & fingerprint -> passes
      await expect(
        service.validateIntegrity(tenantId, 1, rev1.fingerprint),
      ).resolves.toBeUndefined();

      // Mismatched fingerprint on same revision -> throws INTEGRITY_CONFLICT
      await expect(
        service.validateIntegrity(
          tenantId,
          1,
          'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb',
        ),
      ).rejects.toThrow(ConflictException);

      try {
        await service.validateIntegrity(
          tenantId,
          1,
          'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb',
        );
      } catch (err: any) {
        expect(err.message).toContain('INTEGRITY_CONFLICT');
      }
    });
  });

  it('enforces multi-tenant isolation across fiscal configuration revisions', async () => {
    await withIsolatedSchema('fiscal_rev_isolation', async ({ dataSource }) => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();

      await seedTenant(
        dataSource,
        tenantA,
        'Tenant A Negocio',
        'J031000000000A',
      );
      await seedTenant(
        dataSource,
        tenantB,
        'Tenant B Negocio',
        'J031000000000B',
      );

      await seedFiscalParams(
        dataSource,
        tenantA,
        FiscalRegime.CUOTA_FIJA,
        0.0,
        true,
        0.5,
      );
      await seedFiscalParams(
        dataSource,
        tenantB,
        FiscalRegime.REGIMEN_GENERAL,
        0.15,
        false,
        1.0,
      );

      const service = new FiscalConfigVersionService(
        dataSource.getRepository(FiscalConfigRevision),
        dataSource.getRepository(Tenant),
        dataSource.getRepository(SystemParametersConfig),
        dataSource,
      );

      const snapA = await service.getFiscalConfigSnapshot(tenantA);
      const snapB = await service.getFiscalConfigSnapshot(tenantB);

      expect(snapA.tenantId).toBe(tenantA);
      expect(snapB.tenantId).toBe(tenantB);
      expect(snapA.configVersion.fingerprint).not.toBe(
        snapB.configVersion.fingerprint,
      );

      const rowsA = await dataSource.query(
        `SELECT * FROM fiscal_config_revisions WHERE tenant_id = $1`,
        [tenantA],
      );
      const rowsB = await dataSource.query(
        `SELECT * FROM fiscal_config_revisions WHERE tenant_id = $1`,
        [tenantB],
      );

      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0].tenant_id).toBe(tenantA);
      expect(rowsB[0].tenant_id).toBe(tenantB);
    });
  });
});
