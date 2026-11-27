import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { readHighestInvoiceSequence } from './fiscal-sequence-watermark';

describe('readHighestInvoiceSequence (#526 B1/B2 prefix-scoped watermark, Real PostgreSQL)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST?.trim() || '127.0.0.1',
      port: Number(process.env.DB_PORT?.trim() || 5432),
      username: process.env.DB_USERNAME?.trim() || 'postgres',
      password: process.env.DB_PASSWORD?.trim() || 'postgres',
      database: process.env.DB_DATABASE?.trim() || 'omnifood',
      synchronize: false,
    });
    await ds.initialize();
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.destroy();
    }
  });

  it('scopes MAX sequence to (tenant_id, prefix) when prefix is provided and stays tenant-wide when omitted', async () => {
    const schema = `wm_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const qr = ds.createQueryRunner();
    await qr.connect();

    try {
      await qr.query(`CREATE SCHEMA "${schema}"`);
      await qr.query(`SET search_path TO "${schema}"`);
      await qr.query(`
        CREATE TABLE invoices (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          invoice_number text NOT NULL
        )
      `);

      const insertInv = async (tenantId: string, num: string) => {
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number) VALUES ($1, $2, $3)`,
          [randomUUID(), tenantId, num],
        );
      };

      await insertInv(tenantA, '001-001-01-00000012');
      await insertInv(tenantA, '001-001-01-00000015');
      await insertInv(tenantA, '001-001-02-00000040');
      await insertInv(tenantB, '001-001-01-00000099');

      const series1Max = await readHighestInvoiceSequence(qr.manager, tenantA, '001-001-01-');
      const series2Max = await readHighestInvoiceSequence(qr.manager, tenantA, '001-001-02-');
      const series3Max = await readHighestInvoiceSequence(qr.manager, tenantA, '001-001-99-');
      const tenantWideMax = await readHighestInvoiceSequence(qr.manager, tenantA);

      expect(series1Max).toBe(15);
      expect(series2Max).toBe(40);
      expect(series3Max).toBe(0);
      expect(tenantWideMax).toBe(40);
    } finally {
      await qr.query(`SET search_path TO public`).catch(() => undefined);
      await qr.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
      await qr.release();
    }
  });
});
