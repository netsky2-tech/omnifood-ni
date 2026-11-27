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
    const tenantId = randomUUID();
    const userId = randomUUID();
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      await qr.query(
        `INSERT INTO tenants (id, name, slug, ruc, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [
          tenantId,
          `Watermark Test ${tenantId.slice(0, 8)}`,
          `wm-${tenantId.slice(0, 8)}`,
          `J031-${tenantId.slice(0, 8)}`,
        ],
      );
      await qr.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, 'hash', 'Owner', 'OWNER')`,
        [userId, tenantId, `wm-${tenantId.slice(0, 8)}@test.ni`],
      );
      await qr.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      const insertInv = async (num: string) => {
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type)
           VALUES ($1, $2, $3, NOW(), $4, 100, 15, 115, false, 'paid', false, 'regular')`,
          [randomUUID(), tenantId, num, userId],
        );
      };

      await insertInv('001-001-01-00000012');
      await insertInv('001-001-01-00000015');
      await insertInv('001-001-02-00000040');

      const series1Max = await readHighestInvoiceSequence(qr.manager, tenantId, '001-001-01-');
      const series2Max = await readHighestInvoiceSequence(qr.manager, tenantId, '001-001-02-');
      const series3Max = await readHighestInvoiceSequence(qr.manager, tenantId, '001-001-99-');
      const tenantWideMax = await readHighestInvoiceSequence(qr.manager, tenantId);

      expect(series1Max).toBe(15);
      expect(series2Max).toBe(40);
      expect(series3Max).toBe(0);
      expect(tenantWideMax).toBe(40);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});
