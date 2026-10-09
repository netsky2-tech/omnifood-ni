import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Insumo } from './entities/insumo.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { serializeInsumos } from './insumo-response';

/**
 * Real-PostgreSQL regression net for the `/insumos` wire payload. Unit specs
 * can only simulate the driver; only the real database proves that
 * node-postgres hands `numeric` columns to the mapper as STRINGS while
 * `Insumo` declares `number`. This pins the panel-relevant fields
 * (`stock`, `parLevel`, `averageCost`) as JSON numbers after the mapper,
 * and pins the raw string shape so a future driver/entity change that
 * silently re-breaks the wire cannot slip through unnoticed.
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

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: { dataSource: DataSource }) => Promise<void>,
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
      entities: [Tenant, Insumo, UomConversion],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    await assertion({ dataSource });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('serializeInsumos — real PostgreSQL wire shape', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'coerces the driver-returned numeric strings of the panel-relevant fields into numbers',
    async () => {
      await withIsolatedSchema('insumo_wire', async ({ dataSource }) => {
        const tenantId = randomUUID();
        const repo = dataSource.getRepository(Insumo);
        await dataSource.query(
          `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
          [tenantId, 'Insumo Wire Tenant', 'insumo-wire-tenant'],
        );

        await repo.save(
          repo.create({
            tenant_id: tenantId,
            name: 'Arroz',
            purchaseUom: 'LB',
            consumptionUom: 'G',
            conversionFactor: 454,
            stock: 12.5,
            existenciaActual: 12.5,
            averageCost: 350.25,
            parLevel: 5000,
            minStock: 1000,
            maxStock: null,
          }),
        );

        const raw = await repo.find({ where: { tenant_id: tenantId } });

        // The lie the TypeScript type tells: the wire carried strings.
        expect(typeof raw[0].stock).toBe('string');
        expect(typeof raw[0].parLevel).toBe('string');
        expect(typeof raw[0].averageCost).toBe('string');

        const mapped = serializeInsumos(raw);
        expect(mapped).toHaveLength(1);

        // Panel-relevant fields, explicitly typed as JSON numbers.
        expect(typeof mapped[0].stock).toBe('number');
        expect(typeof mapped[0].parLevel).toBe('number');
        expect(typeof mapped[0].averageCost).toBe('number');
        expect(mapped[0].stock).toBe(12.5);
        expect(mapped[0].parLevel).toBe(5000);
        expect(mapped[0].averageCost).toBe(350.25);
        expect(typeof mapped[0].conversionFactor).toBe('number');
        expect(mapped[0].conversionFactor).toBe(454);
        expect(typeof mapped[0].existenciaActual).toBe('number');
        expect(mapped[0].existenciaActual).toBe(12.5);
        expect(typeof mapped[0].minStock).toBe('number');
        expect(mapped[0].minStock).toBe(1000);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps a null parLevel null on the wire after mapping, instead of fabricating 0',
    async () => {
      await withIsolatedSchema('insumo_wire_null', async ({ dataSource }) => {
        const tenantId = randomUUID();
        const repo = dataSource.getRepository(Insumo);
        await dataSource.query(
          `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
          [tenantId, 'Insumo Null Tenant', 'insumo-null-tenant'],
        );

        await repo.save(
          repo.create({
            tenant_id: tenantId,
            name: 'Sal',
            purchaseUom: 'LB',
            consumptionUom: 'G',
            conversionFactor: 454,
            stock: 0,
            existenciaActual: 0,
            averageCost: 0,
            parLevel: null,
            minStock: null,
            maxStock: null,
          }),
        );

        const raw = await repo.find({ where: { tenant_id: tenantId } });
        expect(raw[0].parLevel).toBeNull();

        const [mapped] = serializeInsumos(raw);
        expect(mapped.parLevel).toBeNull();
        expect(mapped.minStock).toBeNull();
        expect(mapped.maxStock).toBeNull();
        // A genuine stored 0 stays a numeric 0.
        expect(mapped.stock).toBe(0);
        expect(mapped.averageCost).toBe(0);
        expect(typeof mapped.stock).toBe('number');
      });
    },
    TEST_TIMEOUT_MS,
  );
});
