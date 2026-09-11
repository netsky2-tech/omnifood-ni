import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Product, ProductType } from './entities/product.entity';
import { ProductService } from './product.service';
import { ChangeLogService } from '../audit/change-log.service';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

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
      entities: [Tenant, Product],
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
): Promise<void> {
  await dataSource.query(
    `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
    [tenantId, name],
  );
}

function createService(dataSource: DataSource): ProductService {
  return new ProductService(dataSource, {
    log: jest.fn(),
  } as unknown as ChangeLogService);
}

describe('ProductService — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  describe('CRUD operations', () => {
    it(
      'creates and retrieves a product by id',
      async () => {
        await withIsolatedSchema('product_crud', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant CRUD');

          const created = await service.create(tenantId, {
            name: 'Taza de Capuccino',
            uom: 'un',
            product_type: ProductType.COMPOUND,
            category_code: 'BEBIDA_CALIENTE',
            sellPrice: 45,
            is_perishable: false,
          });

          expect(created.id).toBeDefined();
          expect(created.name).toBe('Taza de Capuccino');
          expect(created.uom).toBe('un');
          expect(created.product_type).toBe(ProductType.COMPOUND);
          expect(Number(created.sellPrice)).toBe(45);
          expect(created.is_active).toBe(true);
          expect(Number(created.stock)).toBe(0);

          const found = await service.findOne(created.id, tenantId);
          expect(found.id).toBe(created.id);
          expect(found.name).toBe('Taza de Capuccino');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'lists products filtered by tenant',
      async () => {
        await withIsolatedSchema(
          'product_list_tenant',
          async ({ dataSource }) => {
            const tenantA = randomUUID();
            const tenantB = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantA, 'Tenant A');
            await seedTenant(dataSource, tenantB, 'Tenant B');

            await service.create(tenantA, {
              name: 'Product A1',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });
            await service.create(tenantA, {
              name: 'Product A2',
              uom: 'kg',
              product_type: ProductType.COMPOUND,
            });
            await service.create(tenantB, {
              name: 'Product B1',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            const listA = await service.list(tenantA);
            const listB = await service.list(tenantB);

            expect(listA).toHaveLength(2);
            expect(listA.map((p) => p.name).sort()).toEqual([
              'Product A1',
              'Product A2',
            ]);
            expect(listB).toHaveLength(1);
            expect(listB[0].name).toBe('Product B1');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'filters list by product_type',
      async () => {
        await withIsolatedSchema(
          'product_list_type',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Type');

            await service.create(tenantId, {
              name: 'Simple',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });
            await service.create(tenantId, {
              name: 'Compound',
              uom: 'un',
              product_type: ProductType.COMPOUND,
            });
            await service.create(tenantId, {
              name: 'Variant',
              uom: 'un',
              product_type: ProductType.VARIANT_PARENT,
            });

            const simples = await service.list(tenantId, ProductType.SIMPLE);
            const compounds = await service.list(
              tenantId,
              ProductType.COMPOUND,
            );
            const variants = await service.list(
              tenantId,
              ProductType.VARIANT_PARENT,
            );

            expect(simples).toHaveLength(1);
            expect(simples[0].name).toBe('Simple');
            expect(compounds).toHaveLength(1);
            expect(compounds[0].name).toBe('Compound');
            expect(variants).toHaveLength(1);
            expect(variants[0].name).toBe('Variant');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'excludes inactive products by default, includes with includeInactive=true',
      async () => {
        await withIsolatedSchema('product_inactive', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Inactive');

          const p1 = await service.create(tenantId, {
            name: 'Active',
            uom: 'un',
            product_type: ProductType.SIMPLE,
          });
          await service.create(tenantId, {
            name: 'Also Active',
            uom: 'un',
            product_type: ProductType.SIMPLE,
          });
          await service.deactivate(p1.id, tenantId);

          const activeOnly = await service.list(tenantId);
          expect(activeOnly).toHaveLength(1);
          expect(activeOnly[0].name).toBe('Also Active');

          const includeInactive = await service.list(tenantId, undefined, true);
          expect(includeInactive).toHaveLength(2);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'updates product fields',
      async () => {
        await withIsolatedSchema('product_update', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Update');

          const created = await service.create(tenantId, {
            name: 'Old Name',
            uom: 'un',
            product_type: ProductType.SIMPLE,
            sellPrice: 100,
          });

          const updated = await service.update(created.id, tenantId, {
            name: 'New Name',
            sellPrice: 250,
          });

          expect(updated.name).toBe('New Name');
          expect(Number(updated.sellPrice)).toBe(250);
          expect(updated.uom).toBe('un');

          const found = await service.findOne(created.id, tenantId);
          expect(found.name).toBe('New Name');
          expect(Number(found.sellPrice)).toBe(250);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'deactivates product (soft-delete)',
      async () => {
        await withIsolatedSchema(
          'product_deactivate',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Deactivate');

            const created = await service.create(tenantId, {
              name: 'To Deactivate',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            await service.deactivate(created.id, tenantId);

            const found = await service.findOne(created.id, tenantId);
            expect(found.is_active).toBe(false);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'throws NotFoundException for nonexistent product',
      async () => {
        await withIsolatedSchema('product_notfound', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant NotFound');

          await expect(service.findOne(randomUUID(), tenantId)).rejects.toThrow(
            NotFoundException,
          );
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'throws UnauthorizedException on empty tenant',
      async () => {
        await withIsolatedSchema('product_notenant', async ({ dataSource }) => {
          const service = createService(dataSource);

          await expect(service.list('   ')).rejects.toThrow(
            UnauthorizedException,
          );
          await expect(
            service.create('  ', {
              name: 'X',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            }),
          ).rejects.toThrow(UnauthorizedException);
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'trims whitespace from name and uom on create',
      async () => {
        await withIsolatedSchema('product_trim', async ({ dataSource }) => {
          const tenantId = randomUUID();
          const service = createService(dataSource);
          await seedTenant(dataSource, tenantId, 'Tenant Trim');

          const created = await service.create(tenantId, {
            name: '  Capuccino  ',
            uom: '  un  ',
            product_type: ProductType.COMPOUND,
          });

          expect(created.name).toBe('Capuccino');
          expect(created.uom).toBe('un');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'trims whitespace on update',
      async () => {
        await withIsolatedSchema(
          'product_trim_update',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Trim Update');

            const created = await service.create(tenantId, {
              name: 'Original',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            const updated = await service.update(created.id, tenantId, {
              name: '  Trimmed  ',
            });

            expect(updated.name).toBe('Trimmed');
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('RLS / tenant isolation', () => {
    it(
      'enforces tenant isolation — tenant A cannot see tenant B products via service',
      async () => {
        await withIsolatedSchema(
          'product_rls_isolation',
          async ({ dataSource }) => {
            const tenantA = randomUUID();
            const tenantB = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantA, 'Tenant A RLS');
            await seedTenant(dataSource, tenantB, 'Tenant B RLS');

            const productB = await service.create(tenantB, {
              name: 'Secret Product B',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            // Tenant A queries should not see tenant B's product
            const listA = await service.list(tenantA);
            expect(listA).toHaveLength(0);

            // findOne with tenant A for tenant B's product should throw
            await expect(service.findOne(productB.id, tenantA)).rejects.toThrow(
              NotFoundException,
            );
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'create uses the provided tenant_id',
      async () => {
        await withIsolatedSchema(
          'product_create_tenant',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Create');

            const created = await service.create(tenantId, {
              name: 'Test',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            expect(created.tenant_id).toBe(tenantId);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'deactivate is idempotent',
      async () => {
        await withIsolatedSchema(
          'product_deactivate_idempotent',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Idempotent');

            const created = await service.create(tenantId, {
              name: 'Idempotent',
              uom: 'un',
              product_type: ProductType.SIMPLE,
            });

            await service.deactivate(created.id, tenantId);
            await service.deactivate(created.id, tenantId);

            const found = await service.findOne(created.id, tenantId);
            expect(found.is_active).toBe(false);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'create with all optional fields',
      async () => {
        await withIsolatedSchema(
          'product_all_fields',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant AllFields');

            const created = await service.create(tenantId, {
              name: 'Full Product',
              uom: 'kg',
              product_type: ProductType.COMPOUND,
              category_code: 'CARNES',
              warehouse_id: randomUUID(),
              is_perishable: true,
              stock: 10.5,
              averageCost: 25.75,
              sellPrice: 45.0,
              is_active: true,
            });

            expect(created.name).toBe('Full Product');
            expect(created.uom).toBe('kg');
            expect(created.product_type).toBe(ProductType.COMPOUND);
            expect(created.category_code).toBe('CARNES');
            expect(created.warehouse_id).toBeDefined();
            expect(created.is_perishable).toBe(true);
            expect(Number(created.stock)).toBeCloseTo(10.5, 1);
            expect(Number(created.averageCost)).toBeCloseTo(25.75, 1);
            expect(Number(created.sellPrice)).toBeCloseTo(45.0, 1);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'update only touches mentioned fields',
      async () => {
        await withIsolatedSchema(
          'product_partial_update',
          async ({ dataSource }) => {
            const tenantId = randomUUID();
            const service = createService(dataSource);
            await seedTenant(dataSource, tenantId, 'Tenant Partial');

            const created = await service.create(tenantId, {
              name: 'Keep Name',
              uom: 'kg',
              product_type: ProductType.SIMPLE,
              sellPrice: 100,
            });

            const updated = await service.update(created.id, tenantId, {
              sellPrice: 200,
            });

            expect(updated.name).toBe('Keep Name');
            expect(updated.uom).toBe('kg');
            expect(Number(updated.sellPrice)).toBe(200);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });
});
