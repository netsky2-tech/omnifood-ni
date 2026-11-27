import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceInvoiceNumberImmutability1810000000000 } from './1810000000000-EnforceInvoiceNumberImmutability';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }
  return value;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (queryRunner: QueryRunner) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    await assertion(queryRunner);
  } finally {
    try {
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // best effort cleanup
    }
    try {
      await queryRunner.release();
    } catch {
      // ignore
    }
    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('EnforceInvoiceNumberImmutability1810000000000 (real PostgreSQL)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'rejects UPDATE of invoice_number (DT 09-2007 1.7) while allowing legitimate status/void updates',
    async () => {
      await withIsolatedSchema('test_inv_num_immut', async (qr) => {
        await qr.query(`
          CREATE TABLE invoices (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            invoice_number varchar NOT NULL,
            payment_status varchar NOT NULL DEFAULT 'pending',
            is_canceled boolean NOT NULL DEFAULT false,
            void_reason varchar
          )
        `);

        const migration = new EnforceInvoiceNumberImmutability1810000000000();
        await migration.up(qr);

        const invoiceId = randomUUID();
        const tenantId = randomUUID();
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number) VALUES ($1, $2, $3)`,
          [invoiceId, tenantId, '001-001-01-00000001'],
        );

        // Mutating invoice_number MUST fail closed at the PostgreSQL trigger
        await expect(
          qr.query(`UPDATE invoices SET invoice_number = $1 WHERE id = $2`, [
            '001-001-01-99999999',
            invoiceId,
          ]),
        ).rejects.toThrow(
          /invoice_number is immutable: DT 09-2007 ordinal 1\.7 requires unalterable numbering/,
        );

        // Re-assert invoice_number was untouched
        const [unchanged] = await qr.query(
          `SELECT invoice_number FROM invoices WHERE id = $1`,
          [invoiceId],
        );
        expect(unchanged.invoice_number).toBe('001-001-01-00000001');

        // Legitimate updates (settlement state & same-day void) MUST still succeed
        await qr.query(
          `UPDATE invoices SET payment_status = 'paid', is_canceled = true, void_reason = 'Error cajero' WHERE id = $1`,
          [invoiceId],
        );
        const [updated] = await qr.query(
          `SELECT invoice_number, payment_status, is_canceled, void_reason FROM invoices WHERE id = $1`,
          [invoiceId],
        );
        expect(updated).toEqual({
          invoice_number: '001-001-01-00000001',
          payment_status: 'paid',
          is_canceled: true,
          void_reason: 'Error cajero',
        });

        await migration.down(qr);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
