import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddContingencyManualRefToInvoices1811100000000 } from './1811100000000-AddContingencyManualRefToInvoices';

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

describe('AddContingencyManualRefToInvoices1811100000000 (real PostgreSQL)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'enforces completeness, anti-collision with invoice_number, and unique active manual ref per tenant (DT 09-2007 3.3.a/b)',
    async () => {
      await withIsolatedSchema('test_contingency_ref', async (qr) => {
        await qr.query(`
          CREATE TABLE invoices (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            invoice_number varchar NOT NULL,
            is_canceled boolean NOT NULL DEFAULT false
          )
        `);

        const migration = new AddContingencyManualRefToInvoices1811100000000();
        await migration.up(qr);

        const tenantId = randomUUID();
        const otherTenantId = randomUUID();

        // 1. Non-contingency invoice (all 3 NULL) succeeds
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number) VALUES ($1, $2, $3)`,
          [randomUUID(), tenantId, '001-001-01-00000001'],
        );

        // 2. Partial NULL rejected by chk_invoices_contingency_manual_ref_complete
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), tenantId, '001-001-01-00000002', 'MAN-A', '000001'],
          ),
        ).rejects.toThrow(/chk_invoices_contingency_manual_ref_complete/);

        // 3. Blank series rejected by chk_invoices_contingency_manual_ref_complete
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              randomUUID(),
              tenantId,
              '001-001-01-00000003',
              '   ',
              '000001',
              '2026-04-15',
            ],
          ),
        ).rejects.toThrow(/chk_invoices_contingency_manual_ref_complete/);

        // 4. Collision with invoice_number (series-number == invoice_number) rejected
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              randomUUID(),
              tenantId,
              '001-001-01-00000004',
              '001-001-01',
              '00000004',
              '2026-04-15',
            ],
          ),
        ).rejects.toThrow(/chk_invoices_contingency_not_same_as_system_number/);

        // 5. Collision where manual number == invoice_number rejected
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              randomUUID(),
              tenantId,
              '001-001-01-00000005',
              'MAN-B',
              '001-001-01-00000005',
              '2026-04-15',
            ],
          ),
        ).rejects.toThrow(/chk_invoices_contingency_not_same_as_system_number/);

        // 6. Valid distinct manual series/number/date succeeds
        const firstValidId = randomUUID();
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            firstValidId,
            tenantId,
            '001-001-01-00000006',
            'MAN-A',
            '000042',
            '2026-04-15',
          ],
        );

        // 7. Duplicate active manual ticket (case/whitespace normalized) for same tenant rejected
        await expect(
          qr.query(
            `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              randomUUID(),
              tenantId,
              '001-001-01-00000007',
              ' man-a ',
              ' 000042 ',
              '2026-04-15',
            ],
          ),
        ).rejects.toThrow(/uq_invoices_tenant_contingency_manual_ref/);

        // 8. Same manual ticket for a DIFFERENT tenant succeeds
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            otherTenantId,
            '001-001-01-00000001',
            'MAN-A',
            '000042',
            '2026-04-15',
          ],
        );

        // 9. If prior back-entry is canceled, re-entry of same manual ticket succeeds
        await qr.query(
          `UPDATE invoices SET is_canceled = true WHERE id = $1`,
          [firstValidId],
        );
        await qr.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, contingency_manual_series, contingency_manual_number, contingency_manual_issued_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            tenantId,
            '001-001-01-00000008',
            'MAN-A',
            '000042',
            '2026-04-15',
          ],
        );

        await migration.down(qr);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
