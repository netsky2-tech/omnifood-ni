import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddPaymentConditionToInvoices1811000000000 } from './1811000000000-AddPaymentConditionToInvoices';

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

describe('AddPaymentConditionToInvoices1811000000000 (real PostgreSQL)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'defaults legacy rows to CONTADO, accepts CREDITO, and rejects invalid payment_condition values',
    async () => {
      await withIsolatedSchema('test_pay_cond', async (qr) => {
        await qr.query(`
          CREATE TABLE invoices (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            invoice_number varchar NOT NULL
          )
        `);

        const legacyId = randomUUID();
        const tenantId = randomUUID();
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number) VALUES ($1, $2, $3)`,
          [legacyId, tenantId, '001-001-01-00000001'],
        );

        const migration = new AddPaymentConditionToInvoices1811000000000();
        await migration.up(qr);

        // Legacy row defaulted cleanly to CONTADO
        const [legacyRow] = await qr.query(
          `SELECT payment_condition FROM invoices WHERE id = $1`,
          [legacyId],
        );
        expect(legacyRow.payment_condition).toBe('CONTADO');

        // Explicit CREDITO row succeeds
        const creditId = randomUUID();
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, payment_condition) VALUES ($1, $2, $3, $4)`,
          [creditId, tenantId, '001-001-01-00000002', 'CREDITO'],
        );
        const [creditRow] = await qr.query(
          `SELECT payment_condition FROM invoices WHERE id = $1`,
          [creditId],
        );
        expect(creditRow.payment_condition).toBe('CREDITO');

        // Invalid value MUST fail CHECK constraint (SQLSTATE 23514)
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, payment_condition) VALUES ($1, $2, $3, $4)`,
            [randomUUID(), tenantId, '001-001-01-00000003', 'FIADO'],
          ),
        ).rejects.toThrow(/chk_invoices_payment_condition/);

        await migration.down(qr);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
