import { randomUUID } from 'crypto';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CatalogService, DEFAULT_CATALOG_SEED } from './catalog.service';
import { CatalogValue } from './entities/catalog-value.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { CATALOG_TYPE, type CatalogType } from './catalog-type';

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

async function createTestHarness() {
  const schema = `catalog_test_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  await bootstrap.query(`
    CREATE TABLE "${schema}".tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      ruc varchar,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await bootstrap.query(`
    CREATE TABLE "${schema}".catalog_values (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id text NOT NULL,
      catalog_type varchar NOT NULL,
      code varchar NOT NULL,
      label varchar NOT NULL,
      description varchar,
      is_active boolean NOT NULL DEFAULT true,
      sort_order int NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (tenant_id, catalog_type, code)
    )
  `);

  const clientDs = new DataSource({
    type: 'postgres',
    ...postgresConnection,
    schema,
    entities: [CatalogValue, Tenant],
    extra: { max: 2 },
  });
  await clientDs.initialize();

  const service = new CatalogService(clientDs);

  return {
    service,
    clientDs,
    bootstrap,
    schema,
    destroy: async () => {
      await clientDs.destroy();
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    },
  };
}

describe('CatalogService — DB integration', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness?.destroy();
  });

  describe('create + list', () => {
    it('creates a catalog value and retrieves it', async () => {
      const { service } = harness;

      const created = await service.create(CATALOG_TYPE.UOM, 'tenant-db-1', {
        code: 'kg',
        name: 'Kilogramo',
      });

      expect(created.id).toBeDefined();
      expect(created.code).toBe('kg');
      expect(created.name).toBe('Kilogramo');
      expect(created.tenant_id).toBe('tenant-db-1');
      expect(created.is_active).toBe(true);

      const list = await service.list(CATALOG_TYPE.UOM, 'tenant-db-1');
      expect(list).toHaveLength(1);
      expect(list[0]!.code).toBe('kg');
    });

    it('creates with optional fields', async () => {
      const { service } = harness;

      const created = await service.create(CATALOG_TYPE.UOM, 'tenant-db-opts', {
        code: 'lb',
        name: 'Libra',
        is_active: false,
        sort_order: 5,
      });

      expect(created.is_active).toBe(false);
      expect(created.sort_order).toBe(5);
    });

    it('throws ConflictException on duplicate (tenant, type, code)', async () => {
      const { service } = harness;

      await expect(
        service.create(CATALOG_TYPE.UOM, 'tenant-db-dup', {
          code: 'un',
          name: 'Unidad',
        }),
      ).resolves.toBeDefined();

      await expect(
        service.create(CATALOG_TYPE.UOM, 'tenant-db-dup', {
          code: 'un',
          name: 'Unidad duplicada',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('different tenants can share the same code', async () => {
      const { service } = harness;

      await service.create(CATALOG_TYPE.UOM, 'tenant-shared-a', {
        code: 'gal',
        name: 'Galón A',
      });
      const b = await service.create(CATALOG_TYPE.UOM, 'tenant-shared-b', {
        code: 'gal',
        name: 'Galón B',
      });

      expect(b.tenant_id).toBe('tenant-shared-b');

      const listA = await service.list(CATALOG_TYPE.UOM, 'tenant-shared-a');
      expect(listA).toHaveLength(1);

      const listB = await service.list(CATALOG_TYPE.UOM, 'tenant-shared-b');
      expect(listB).toHaveLength(1);
    });
  });

  describe('list', () => {
    it('returns only active values by default', async () => {
      const { service } = harness;
      const t = 'tenant-db-list';

      await service.create(CATALOG_TYPE.INVENTORY_CATEGORY, t, {
        code: 'ACTIVE',
        name: 'Active',
      });
      const inactive = await service.create(
        CATALOG_TYPE.INVENTORY_CATEGORY,
        t,
        { code: 'INACTIVE', name: 'Inactive', is_active: false },
      );

      const activeOnly = await service.list(CATALOG_TYPE.INVENTORY_CATEGORY, t);
      expect(activeOnly.every((v) => v.is_active)).toBe(true);
      expect(activeOnly).toHaveLength(1);

      const all = await service.list(CATALOG_TYPE.INVENTORY_CATEGORY, t, true);
      expect(all).toHaveLength(2);
    });

    it('returns empty array for tenant with no values', async () => {
      const { service } = harness;
      const list = await service.list(CATALOG_TYPE.UOM, 'tenant-empty');
      expect(list).toEqual([]);
    });

    it('orders by sort_order ASC then name ASC', async () => {
      const { service } = harness;
      const t = 'tenant-db-order';

      await service.create(CATALOG_TYPE.UOM, t, {
        code: 'z',
        name: 'Zebra',
        sort_order: 2,
      });
      await service.create(CATALOG_TYPE.UOM, t, {
        code: 'a',
        name: 'Alpha',
        sort_order: 1,
      });
      await service.create(CATALOG_TYPE.UOM, t, {
        code: 'm',
        name: 'Middle',
        sort_order: 1,
      });

      const list = await service.list(CATALOG_TYPE.UOM, t);
      expect(list.map((v) => v.code)).toEqual(['a', 'm', 'z']);
    });

    it('isolates by catalog_type', async () => {
      const { service } = harness;
      const t = 'tenant-db-type';

      await service.create(CATALOG_TYPE.UOM, t, { code: 'kg', name: 'Kg' });
      await service.create(CATALOG_TYPE.INVENTORY_CATEGORY, t, {
        code: 'LACTEOS',
        name: 'Lácteos',
      });

      const uom = await service.list(CATALOG_TYPE.UOM, t);
      expect(uom).toHaveLength(1);
      expect(uom[0]!.code).toBe('kg');

      const cat = await service.list(CATALOG_TYPE.INVENTORY_CATEGORY, t);
      expect(cat).toHaveLength(1);
      expect(cat[0]!.code).toBe('LACTEOS');
    });
  });

  describe('update', () => {
    it('updates name, is_active, and sort_order', async () => {
      const { service } = harness;
      const t = 'tenant-db-update';

      const created = await service.create(CATALOG_TYPE.UOM, t, {
        code: 'oz',
        name: 'Onza',
      });

      const updated = await service.update(CATALOG_TYPE.UOM, created.id, t, {
        name: 'Onzas',
        is_active: false,
        sort_order: 10,
      });

      expect(updated.name).toBe('Onzas');
      expect(updated.is_active).toBe(false);
      expect(updated.sort_order).toBe(10);
      expect(updated.code).toBe('oz'); // code never changes
    });

    it('does not allow changing the code', async () => {
      const { service } = harness;
      const t = 'tenant-db-nocode';

      const created = await service.create(CATALOG_TYPE.UOM, t, {
        code: 'lb',
        name: 'Libra',
      });

      const updated = await service.update(CATALOG_TYPE.UOM, created.id, t, {
        name: 'Libras actualizado',
      });

      expect(updated.code).toBe('lb');
    });

    it('throws NotFoundException for nonexistent id', async () => {
      const { service } = harness;
      await expect(
        service.update(CATALOG_TYPE.UOM, randomUUID(), 'tenant-x', {
          name: 'Nope',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot update values from a different tenant', async () => {
      const { service } = harness;

      const created = await service.create(CATALOG_TYPE.UOM, 'tenant-iso-a', {
        code: 'ml',
        name: 'Mililitro',
      });

      await expect(
        service.update(CATALOG_TYPE.UOM, created.id, 'tenant-iso-b', {
          name: 'Hacked',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('soft-deactivates instead of hard-deleting', async () => {
      const { service } = harness;
      const t = 'tenant-db-deact';

      const created = await service.create(CATALOG_TYPE.UOM, t, {
        code: 'gal',
        name: 'Galón',
      });

      await service.deactivate(CATALOG_TYPE.UOM, created.id, t);

      const list = await service.list(CATALOG_TYPE.UOM, t, true);
      expect(list).toHaveLength(1);
      expect(list[0]!.is_active).toBe(false);

      // Gone from active-only list
      const activeList = await service.list(CATALOG_TYPE.UOM, t, false);
      expect(activeList).toHaveLength(0);
    });

    it('throws NotFoundException for nonexistent id', async () => {
      const { service } = harness;
      await expect(
        service.deactivate(CATALOG_TYPE.UOM, randomUUID(), 'tenant-x'),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot deactivate values from a different tenant', async () => {
      const { service } = harness;

      const created = await service.create(CATALOG_TYPE.UOM, 'tenant-deact-a', {
        code: 'doc',
        name: 'Docena',
      });

      await expect(
        service.deactivate(CATALOG_TYPE.UOM, created.id, 'tenant-deact-b'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('seedDefaults', () => {
    it('inserts all default catalog values for a fresh tenant', async () => {
      const { service } = harness;
      const t = 'tenant-db-seed-fresh';

      const inserted = await service.seedDefaults(t);

      const expectedCount =
        DEFAULT_CATALOG_SEED.UOM.length +
        DEFAULT_CATALOG_SEED.INVENTORY_CATEGORY.length +
        DEFAULT_CATALOG_SEED.INVENTORY_TYPE.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_CATEGORY.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_TYPE.length;

      expect(inserted).toBe(expectedCount);

      // Verify each catalog type has the right count
      for (const type of Object.keys(DEFAULT_CATALOG_SEED) as CatalogType[]) {
        const list = await service.list(type, t);
        expect(list).toHaveLength(DEFAULT_CATALOG_SEED[type].length);
      }
    });

    it('is idempotent — re-seeding inserts nothing', async () => {
      const { service } = harness;
      const t = 'tenant-db-seed-idempotent';

      const first = await service.seedDefaults(t);
      const second = await service.seedDefaults(t);

      expect(second).toBe(0);

      // Still has the original count
      const uomList = await service.list(CATALOG_TYPE.UOM, t);
      expect(uomList).toHaveLength(DEFAULT_CATALOG_SEED.UOM.length);
    });

    it('skips existing codes but inserts new ones', async () => {
      const { service } = harness;
      const t = 'tenant-db-seed-partial';

      // Pre-create one UOM value
      await service.create(CATALOG_TYPE.UOM, t, {
        code: 'kg',
        name: 'Kilogramo custom',
      });

      const inserted = await service.seedDefaults(t);

      // Should insert all defaults minus the 1 existing 'kg'
      const expectedCount =
        (DEFAULT_CATALOG_SEED.UOM.length - 1) +
        DEFAULT_CATALOG_SEED.INVENTORY_CATEGORY.length +
        DEFAULT_CATALOG_SEED.INVENTORY_TYPE.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_CATEGORY.length +
        DEFAULT_CATALOG_SEED.SALES_PRODUCT_TYPE.length;

      expect(inserted).toBe(expectedCount);

      // 'kg' still has the custom name (not overwritten)
      const uomList = await service.list(CATALOG_TYPE.UOM, t, true);
      const kg = uomList.find((v) => v.code === 'kg');
      expect(kg?.name).toBe('Kilogramo custom');
    });
  });

  describe('resolveType', () => {
    it('returns the type for a known catalog type', () => {
      expect(CatalogService.resolveType('UOM')).toBe(CATALOG_TYPE.UOM);
      expect(CatalogService.resolveType('INVENTORY_CATEGORY')).toBe(
        CATALOG_TYPE.INVENTORY_CATEGORY,
      );
    });

    it('throws NotFoundException for an unknown type', () => {
      expect(() => CatalogService.resolveType('NOPE')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('tenant isolation (RLS-level)', () => {
    it('each tenant sees only their own values', async () => {
      const { service } = harness;

      await service.create(CATALOG_TYPE.UOM, 'tenant-rls-a', {
        code: 'kg',
        name: 'Kilogramo A',
      });
      await service.create(CATALOG_TYPE.UOM, 'tenant-rls-b', {
        code: 'kg',
        name: 'Kilogramo B',
      });

      const listA = await service.list(CATALOG_TYPE.UOM, 'tenant-rls-a');
      expect(listA).toHaveLength(1);
      expect(listA[0]!.name).toBe('Kilogramo A');

      const listB = await service.list(CATALOG_TYPE.UOM, 'tenant-rls-b');
      expect(listB).toHaveLength(1);
      expect(listB[0]!.name).toBe('Kilogramo B');
    });
  });

  describe('error handling', () => {
    it('throws UnauthorizedException when tenant is empty', async () => {
      const { service } = harness;
      await expect(
        service.create(CATALOG_TYPE.UOM, '  ', { code: 'x', name: 'X' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tenant is undefined-ish', async () => {
      const { service } = harness;
      await expect(
        service.list(CATALOG_TYPE.UOM, ''),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
