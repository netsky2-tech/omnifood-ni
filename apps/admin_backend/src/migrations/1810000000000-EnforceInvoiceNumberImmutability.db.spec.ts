import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateBootstrapIdentityTables1759000000001 } from './1759000000001-CreateBootstrapIdentityTables';
import { CreateBootstrapInventorySalesTables1759000000002 } from './1759000000002-CreateBootstrapInventorySalesTables';
import { EnforceInvoiceNumberImmutability1810000000000 } from './1810000000000-EnforceInvoiceNumberImmutability';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }

  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
    );
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
      // no-op: cleanup is best effort when bootstrap fails
    }

    try {
      await queryRunner.release();
    } catch {
      // no-op: query runner may not be connected on bootstrap errors
    }

    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('EnforceInvoiceNumberImmutability1810000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  const buildSchema = async (queryRunner: QueryRunner): Promise<void> => {
    // The bootstrap migrations guard their enum creation against the
    // `public` schema by name; on a dev database public already has the
    // types, so the guarded CREATEs are skipped and this isolated schema
    // would lack them. Pre-create the full enum set here for the harness
    // (duplicate-safe — PostgreSQL has no CREATE TYPE IF NOT EXISTS).
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE users_role_enum AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE recipe_ingredient_type_enum AS ENUM ('INSUMO', 'PRODUCT');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE cash_shift_session_status_enum AS ENUM ('OPEN', 'CLOSED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE cash_movement_type_enum AS ENUM ('CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'SAFE_DROP');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE products_product_type_enum AS ENUM ('SIMPLE', 'COMPOUND', 'PREPARED', 'VARIANT_PARENT');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await new CreateBootstrapIdentityTables1759000000001().up(queryRunner);
    await new CreateBootstrapInventorySalesTables1759000000002().up(
      queryRunner,
    );
    await new EnforceInvoiceNumberImmutability1810000000000().up(queryRunner);
  };

  const seedInvoices = async (queryRunner: QueryRunner): Promise<void> => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    await queryRunner.query(
      `INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'rls-seed-tenant')`,
    );
    // A regular (contado) invoice and a credit note: the fiscal number is
    // inalterable on BOTH document types (DT 09-2007 ordinal 1.7 — the
    // number is the fiscal identity of the document, whatever its type).
    await queryRunner.query(
      `
        INSERT INTO invoices (
          id, tenant_id, invoice_number, created_at, user_id,
          subtotal, total_tax, total, type
        )
        VALUES (
          '22222222-2222-4222-8222-222222222222', '${tenantId}',
          '001-001-01-00000042', now(), '33333333-3333-4333-8333-333333333333',
          100.00, 15.00, 115.00, 'regular'
        )
      `,
    );
    await queryRunner.query(
      `
        INSERT INTO invoices (
          id, tenant_id, invoice_number, created_at, user_id,
          subtotal, total_tax, total, type
        )
        VALUES (
          '44444444-4444-4444-8444-444444444444', '${tenantId}',
          'NC-00000041', now(), '33333333-3333-4333-8333-333333333333',
          -50.00, -7.50, -57.50, 'creditNote'
        )
      `,
    );
  };

  it(
    'rejects an UPDATE that rewrites invoice_number on a regular invoice',
    async () => {
      await withIsolatedSchema('invnum_immutable', async (queryRunner) => {
        await buildSchema(queryRunner);
        await seedInvoices(queryRunner);

        await expect(
          queryRunner.query(
            `UPDATE invoices SET invoice_number = '001-001-01-00000999'
             WHERE id = '22222222-2222-4222-8222-222222222222'`,
          ),
        ).rejects.toThrow(/invoice_number is immutable/i);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rejects an UPDATE that rewrites invoice_number on a credit note too',
    async () => {
      await withIsolatedSchema('invnum_immutable_nc', async (queryRunner) => {
        await buildSchema(queryRunner);
        await seedInvoices(queryRunner);

        await expect(
          queryRunner.query(
            `UPDATE invoices SET invoice_number = 'NC-00000099'
             WHERE id = '44444444-4444-4444-8444-444444444444'`,
          ),
        ).rejects.toThrow(/invoice_number is immutable/i);
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'still allows legitimate column updates (settlement state, cancellation)',
    async () => {
      await withIsolatedSchema('invnum_mutable_rest', async (queryRunner) => {
        await buildSchema(queryRunner);
        await seedInvoices(queryRunner);

        // Sync transitions and cancellation mutate other columns — the
        // guard is scoped to the fiscal number, not the whole row.
        await queryRunner.query(
          `UPDATE invoices SET payment_status = 'paid',
             is_canceled = true, void_reason = 'Cliente desiste'
           WHERE id = '22222222-2222-4222-8222-222222222222'`,
        );

        const rows = (await queryRunner.query(
          `SELECT payment_status, is_canceled FROM invoices
           WHERE id = '22222222-2222-4222-8222-222222222222'`,
        )) as Array<{ payment_status: string; is_canceled: boolean }>;

        expect(rows).toHaveLength(1);
        expect(rows[0].payment_status).toBe('paid');
        expect(rows[0].is_canceled).toBe(true);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
