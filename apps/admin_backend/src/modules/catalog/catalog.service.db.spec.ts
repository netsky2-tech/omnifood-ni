import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { CatalogValue } from './entities/catalog-value.entity';
import { CatalogService, DEFAULT_CATALOG_SEED } from './catalog.service';
import { CATALOG_TYPE, CatalogType } from './catalog-type';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ChangeLogService } from '../audit/change-log.service';

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
      entities: [Tenant, CatalogValue],
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

async function seedTenant(dataSource: DataSource, tenantId: string, name: string): Promise<void> {
  await dataSource.query(
    `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
    [tenantId, name],
  );
}

function createService(dataSource: DataSource): CatalogService {
  return new CatalogService(dataSource, { log: jest.fn() } as unknown as ChangeLogService);
}

describe('CatalogService — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  describe('CRUD operations', () => {
    it(
      'creates and retrieves a catalog value by id',
      async () => {
        await withIsolatedSchema('catalog_crud', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant CRUD');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Kilogramo',
          });

          expect(created.id).toBeDefined();
          expect(created.code).toBe('kg');
          expect(created.name).toBe('Kilogramo');
          expect(created.catalog_type).toBe(CATALOG_TYPE.UOM);
          expect(created.is_active).toBe(true);
          expect(created.sort_order).toBe(0);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'lists catalog values filtered by type',
      async () => {
        await withIsolatedSchema('catalog_list_type', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Type');

          await service.create(CATALOG_TYPE.UOM, tenantId, { code: 'kg', name: 'Kilogramo' });
          await service.create(CATALOG_TYPE.UOM, tenantId, { code: 'un', name: 'Unidad' });
          await service.create(CATALOG_TYPE.INVENTORY_CATEGORY, tenantId, { code: 'CARNES', name: 'Carnes' });

          const uomList = await service.list(CATALOG_TYPE.UOM, tenantId);
          const catList = await service.list(CATALOG_TYPE.INVENTORY_CATEGORY, tenantId);

          expect(uomList).toHaveLength(2);
          expect(uomList.map((v) => v.code).sort()).toEqual(['kg', 'un']);
          expect(catList).toHaveLength(1);
          expect(catList[0].code).toBe('CARNES');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'excludes inactive catalog values by default, includes with includeInactive=true',
      async () => {
        await withIsolatedSchema('catalog_inactive', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Inactive');

          const v1 = await service.create(CATALOG_TYPE.UOM, tenantId, { code: 'kg', name: 'Kilogramo' });
          await service.create(CATALOG_TYPE.UOM, tenantId, { code: 'un', name: 'Unidad' });
          await service.deactivate(CATALOG_TYPE.UOM, v1.id, tenantId);

          const activeOnly = await service.list(CATALOG_TYPE.UOM, tenantId);
          expect(activeOnly).toHaveLength(1);
          expect(activeOnly[0].code).toBe('un');

          const includeInactive = await service.list(CATALOG_TYPE.UOM, tenantId, true);
          expect(includeInactive).toHaveLength(2);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'updates catalog value fields',
      async () => {
        await withIsolatedSchema('catalog_update', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Update');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Old Name',
            sort_order: 5,
          });

          const updated = await service.update(CATALOG_TYPE.UOM, created.id, tenantId, {
            name: 'New Name',
            sort_order: 10,
          });

          expect(updated.name).toBe('New Name');
          expect(updated.sort_order).toBe(10);
          expect(updated.code).toBe('kg');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'deactivates catalog value (soft-delete)',
      async () => {
        await withIsolatedSchema('catalog_deactivate', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Deactivate');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Kilogramo',
          });

          await service.deactivate(CATALOG_TYPE.UOM, created.id, tenantId);

          const list = await service.list(CATALOG_TYPE.UOM, tenantId);
          expect(list).toHaveLength(0);

          const all = await service.list(CATALOG_TYPE.UOM, tenantId, true);
          expect(all).toHaveLength(1);
          expect(all[0].is_active).toBe(false);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'throws ConflictException on duplicate code for same type and tenant',
      async () => {
        await withIsolatedSchema('catalog_conflict', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Conflict');

          await service.create(CATALOG_TYPE.UOM, tenantId, { code: 'kg', name: 'Kilogramo' });

          await expect(
            service.create(CATALOG_TYPE.UOM, tenantId, { code: 'kg', name: 'Kilogramo Duplicado' }),
          ).rejects.toThrow(ConflictException);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'throws NotFoundException for nonexistent catalog value',
      async () => {
        await withIsolatedSchema('catalog_notfound', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant NotFound');

          await expect(
            service.update(CATALOG_TYPE.UOM, randomUUID(), tenantId, { name: 'Nope' }),
          ).rejects.toThrow(NotFoundException);

          await expect(
            service.deactivate(CATALOG_TYPE.UOM, randomUUID(), tenantId),
          ).rejects.toThrow(NotFoundException);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'throws UnauthorizedException for empty tenant',
      async () => {
        await withIsolatedSchema('catalog_notenant', async ({ dataSource }) => {
          const service = createService(dataSource);

          await expect(service.list(CATALOG_TYPE.UOM, '   ')).rejects.toThrow(UnauthorizedException);
          await expect(
            service.create(CATALOG_TYPE.UOM, '  ', { code: 'x', name: 'X' }),
          ).rejects.toThrow(UnauthorizedException);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'trims whitespace from code and name on create',
      async () => {
        await withIsolatedSchema('catalog_trim', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Trim');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: '  kg  ',
            name: '  Kilogramo  ',
          });

          expect(created.code).toBe('kg');
          expect(created.name).toBe('Kilogramo');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'trims whitespace on update',
      async () => {
        await withIsolatedSchema('catalog_trim_update', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Trim Update');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Original',
          });

          const updated = await service.update(CATALOG_TYPE.UOM, created.id, tenantId, {
            name: '  Trimmed  ',
          });

          expect(updated.name).toBe('Trimmed');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'creates with all optional fields',
      async () => {
        await withIsolatedSchema('catalog_all_fields', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant AllFields');

          const created = await service.create(CATALOG_TYPE.INVENTORY_CATEGORY, tenantId, {
            code: 'CARNES',
            name: 'Carnes',
            is_active: true,
            sort_order: 3,
          });

          expect(created.code).toBe('CARNES');
          expect(created.name).toBe('Carnes');
          expect(created.catalog_type).toBe(CATALOG_TYPE.INVENTORY_CATEGORY);
          expect(created.is_active).toBe(true);
          expect(created.sort_order).toBe(3);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'update only touches mentioned fields',
      async () => {
        await withIsolatedSchema('catalog_partial_update', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Partial');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Keep Name',
            sort_order: 5,
          });

          const updated = await service.update(CATALOG_TYPE.UOM, created.id, tenantId, {
            sort_order: 10,
          });

          expect(updated.name).toBe('Keep Name');
          expect(updated.code).toBe('kg');
          expect(updated.sort_order).toBe(10);
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('RLS / tenant isolation', () => {
    it(
      'enforces tenant isolation — tenant A cannot see tenant B catalog values',
      async () => {
        await withIsolatedSchema('catalog_rls_isolation', async ({ dataSource }) => {
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantA, 'Tenant A RLS');
          await seedTenant(dataSource, tenantB, 'Tenant B RLS');

          await service.create(CATALOG_TYPE.UOM, tenantB, { code: 'kg', name: 'Secreto' });

          const listA = await service.list(CATALOG_TYPE.UOM, tenantA);
          expect(listA).toHaveLength(0);

          const listB = await service.list(CATALOG_TYPE.UOM, tenantB);
          expect(listB).toHaveLength(1);
          expect(listB[0].code).toBe('kg');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'same code allowed across different tenants',
      async () => {
        await withIsolatedSchema('catalog_rls_cross_tenant', async ({ dataSource }) => {
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantA, 'Tenant A Cross');
          await seedTenant(dataSource, tenantB, 'Tenant B Cross');

          const createdA = await service.create(CATALOG_TYPE.UOM, tenantA, { code: 'kg', name: 'Kilogramo A' });
          const createdB = await service.create(CATALOG_TYPE.UOM, tenantB, { code: 'kg', name: 'Kilogramo B' });

          expect(createdA.tenant_id).toBe(tenantA);
          expect(createdB.tenant_id).toBe(tenantB);

          const listA = await service.list(CATALOG_TYPE.UOM, tenantA);
          const listB = await service.list(CATALOG_TYPE.UOM, tenantB);
          expect(listA).toHaveLength(1);
          expect(listA[0].name).toBe('Kilogramo A');
          expect(listB).toHaveLength(1);
          expect(listB[0].name).toBe('Kilogramo B');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'deactivate is idempotent',
      async () => {
        await withIsolatedSchema('catalog_deactivate_idempotent', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Idempotent');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Kilogramo',
          });

          await service.deactivate(CATALOG_TYPE.UOM, created.id, tenantId);
          await service.deactivate(CATALOG_TYPE.UOM, created.id, tenantId);

          const all = await service.list(CATALOG_TYPE.UOM, tenantId, true);
          expect(all).toHaveLength(1);
          expect(all[0].is_active).toBe(false);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'update only touches mentioned fields',
      async () => {
        await withIsolatedSchema('catalog_rls_partial_update', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Partial RLS');

          const created = await service.create(CATALOG_TYPE.UOM, tenantId, {
            code: 'kg',
            name: 'Keep Name',
            sort_order: 5,
          });

          const updated = await service.update(CATALOG_TYPE.UOM, created.id, tenantId, {
            sort_order: 10,
          });

          expect(updated.name).toBe('Keep Name');
          expect(updated.code).toBe('kg');
          expect(updated.sort_order).toBe(10);
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('seedDefaults', () => {
    it(
      'seeds all default catalog values for a tenant',
      async () => {
        await withIsolatedSchema('catalog_seed', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Seed');

          const inserted = await service.seedDefaults(tenantId);

          const totalDefaults = Object.values(DEFAULT_CATALOG_SEED).reduce(
            (sum, arr) => sum + arr.length,
            0,
          );
          expect(inserted).toBe(totalDefaults);

          for (const type of Object.keys(DEFAULT_CATALOG_SEED) as CatalogType[]) {
            const list = await service.list(type, tenantId);
            expect(list).toHaveLength(DEFAULT_CATALOG_SEED[type].length);
          }
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'seedDefaults is idempotent — second call inserts zero',
      async () => {
        await withIsolatedSchema('catalog_seed_idempotent', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Seed Idempotent');

          const first = await service.seedDefaults(tenantId);
          const second = await service.seedDefaults(tenantId);

          expect(first).toBeGreaterThan(0);
          expect(second).toBe(0);

          for (const type of Object.keys(DEFAULT_CATALOG_SEED) as CatalogType[]) {
            const list = await service.list(type, tenantId);
            expect(list).toHaveLength(DEFAULT_CATALOG_SEED[type].length);
          }
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'seedDefaults preserves tenant edits on re-run',
      async () => {
        await withIsolatedSchema('catalog_seed_preserve', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Seed Preserve');

          await service.seedDefaults(tenantId);

          const uomList = await service.list(CATALOG_TYPE.UOM, tenantId);
          const kgValue = uomList.find((v) => v.code === 'kg');
          expect(kgValue).toBeDefined();
          await service.update(CATALOG_TYPE.UOM, kgValue!.id, tenantId, { name: 'Mi Kilogramo' });

          const secondInsert = await service.seedDefaults(tenantId);
          expect(secondInsert).toBe(0);

          const afterRerun = await service.list(CATALOG_TYPE.UOM, tenantId);
          const kgAfter = afterRerun.find((v) => v.code === 'kg');
          expect(kgAfter!.name).toBe('Mi Kilogramo');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'seedDefaults only seeds the requested tenant',
      async () => {
        await withIsolatedSchema('catalog_seed_tenant', async ({ dataSource }) => {
          const tenantA = randomUUID();
          const tenantB = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantA, 'Tenant A Seed');
          await seedTenant(dataSource, tenantB, 'Tenant B Seed');

          await service.seedDefaults(tenantA);

          const listA = await service.list(CATALOG_TYPE.UOM, tenantA);
          const listB = await service.list(CATALOG_TYPE.UOM, tenantB);
          expect(listA.length).toBeGreaterThan(0);
          expect(listB).toHaveLength(0);
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
