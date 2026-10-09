import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Insumo } from './entities/insumo.entity';
import { Supplier } from './entities/supplier.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';
import { serializePurchaseDocuments } from './purchase-document-response';

/**
 * Real-PostgreSQL regression net for the `/inventory/purchases` wire
 * payload. Unit specs can only simulate the driver; only the real database
 * proves that node-postgres hands the five `decimal` columns of
 * `PurchaseDocument` to the mapper as STRINGS while the entity declares
 * `number`. This pins every decimal column as a JSON number after the
 * mapper, and pins the raw string shape so a future driver/entity change
 * that silently re-breaks the wire cannot slip through unnoticed.
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
      entities: [Tenant, Insumo, UomConversion, Supplier, PurchaseDocument],
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

describe('serializePurchaseDocuments — real PostgreSQL wire shape', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'coerces the driver-returned numeric strings of every decimal column into numbers',
    async () => {
      await withIsolatedSchema('purchase_wire', async ({ dataSource }) => {
        const tenantId = randomUUID();
        await dataSource.query(
          `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
          [tenantId, 'Purchase Wire Tenant', 'purchase-wire-tenant'],
        );

        const insumoRepo = dataSource.getRepository(Insumo);
        const insumo = await insumoRepo.save(
          insumoRepo.create({
            tenant_id: tenantId,
            name: 'Arroz',
            purchaseUom: 'LB',
            consumptionUom: 'G',
            conversionFactor: 454,
            stock: 12.5,
            existenciaActual: 12.5,
            averageCost: 350.25,
            parLevel: null,
            minStock: null,
            maxStock: null,
          }),
        );

        const supplierRepo = dataSource.getRepository(Supplier);
        const supplier = await supplierRepo.save(
          supplierRepo.create({
            tenant_id: tenantId,
            name: 'Distribuidora Nica',
          }),
        );

        const repo = dataSource.getRepository(PurchaseDocument);
        await repo.save(
          repo.create({
            id: randomUUID(),
            tenant_id: tenantId,
            insumo_id: insumo.id,
            supplier_id: supplier.id,
            invoice_number: 'F-900',
            invoice_date: new Date('2026-09-30T00:00:00.000Z'),
            entry_date: new Date('2026-09-30T00:00:00.000Z'),
            entry_timestamp: new Date('2026-09-30T10:00:00.000Z'),
            quantity: 12.5,
            unit_cost: 350.25,
            currency: 'NIO',
            bcn_rate: 1,
            unit_cost_nio: 350.25,
            projected_cpp_nio: 360.125,
          }),
        );

        const raw = await repo.find({ where: { tenant_id: tenantId } });

        // The lie the TypeScript type tells: the wire carried strings.
        expect(typeof raw[0].quantity).toBe('string');
        expect(typeof raw[0].unit_cost).toBe('string');
        expect(typeof raw[0].bcn_rate).toBe('string');
        expect(typeof raw[0].unit_cost_nio).toBe('string');
        expect(typeof raw[0].projected_cpp_nio).toBe('string');

        const mapped = serializePurchaseDocuments(raw);
        expect(mapped).toHaveLength(1);

        // Every decimal column of the entity, explicitly typed as JSON numbers.
        expect(mapped[0].quantity).toBe(12.5);
        expect(mapped[0].unit_cost).toBe(350.25);
        expect(mapped[0].bcn_rate).toBe(1);
        expect(mapped[0].unit_cost_nio).toBe(350.25);
        expect(mapped[0].projected_cpp_nio).toBe(360.125);
        expect(typeof mapped[0].quantity).toBe('number');
        expect(typeof mapped[0].unit_cost).toBe('number');
        expect(typeof mapped[0].bcn_rate).toBe('number');
        expect(typeof mapped[0].unit_cost_nio).toBe('number');
        expect(typeof mapped[0].projected_cpp_nio).toBe('number');
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'keeps a genuine stored 0 a numeric 0 through the real driver and mapper',
    async () => {
      await withIsolatedSchema('purchase_wire_zero', async ({ dataSource }) => {
        const tenantId = randomUUID();
        await dataSource.query(
          `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
          [tenantId, 'Purchase Zero Tenant', 'purchase-zero-tenant'],
        );

        const insumoRepo = dataSource.getRepository(Insumo);
        const insumo = await insumoRepo.save(
          insumoRepo.create({
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

        const supplierRepo = dataSource.getRepository(Supplier);
        const supplier = await supplierRepo.save(
          supplierRepo.create({
            tenant_id: tenantId,
            name: 'Distribuidora Cero',
          }),
        );

        const repo = dataSource.getRepository(PurchaseDocument);
        await repo.save(
          repo.create({
            id: randomUUID(),
            tenant_id: tenantId,
            insumo_id: insumo.id,
            supplier_id: supplier.id,
            invoice_number: 'F-0',
            invoice_date: new Date('2026-09-30T00:00:00.000Z'),
            entry_date: new Date('2026-09-30T00:00:00.000Z'),
            entry_timestamp: new Date('2026-09-30T10:00:00.000Z'),
            quantity: 0,
            unit_cost: 0,
            currency: 'NIO',
            bcn_rate: 1,
            unit_cost_nio: 0,
            projected_cpp_nio: 0,
          }),
        );

        const raw = await repo.find({ where: { tenant_id: tenantId } });
        expect(typeof raw[0].unit_cost_nio).toBe('string');

        const [mapped] = serializePurchaseDocuments(raw);
        expect(mapped.quantity).toBe(0);
        expect(mapped.unit_cost).toBe(0);
        expect(mapped.unit_cost_nio).toBe(0);
        expect(mapped.projected_cpp_nio).toBe(0);
        expect(typeof mapped.unit_cost_nio).toBe('number');
      });
    },
    TEST_TIMEOUT_MS,
  );
});
