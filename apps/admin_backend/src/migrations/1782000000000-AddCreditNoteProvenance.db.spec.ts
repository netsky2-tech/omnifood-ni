import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { BohInventoryLedgerFoundation1766000000000 } from './1766000000000-BohInventoryLedgerFoundation';
import { AddCreditNoteProvenance1782000000000 } from './1782000000000-AddCreditNoteProvenance';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for DB-backed migration tests`);
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer for DB-backed migration tests');
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

interface IsolatedSchemaContext {
  queryRunner: QueryRunner;
  schema: string;
  tenantRole: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedSchemaContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({ type: 'postgres', ...postgresConnection });
  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${schemaPrefix}_${suffix}`;
  const tenantRole = `${schemaPrefix}_role_${suffix}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    await assertion({ queryRunner, schema, tenantRole });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await queryRunner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
    } catch {
      // Best-effort cleanup when bootstrap fails.
    }
    try {
      await queryRunner.release();
    } catch {
      // Query runner may not be connected on bootstrap errors.
    }
    if (isInitialized) await dataSource.destroy();
  }
}

async function createMinimalSalesTables(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE invoices (
      id varchar PRIMARY KEY,
      tenant_id varchar NOT NULL,
      type varchar NOT NULL DEFAULT 'regular'
    );
    CREATE TABLE invoice_items (
      id varchar PRIMARY KEY,
      tenant_id varchar NOT NULL,
      invoice_id varchar NOT NULL
    );
  `);
}

async function grantTenantRoleAccess(
  queryRunner: QueryRunner,
  schema: string,
  tenantRole: string,
): Promise<void> {
  await queryRunner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}"`);
  await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO "${tenantRole}"`);
  await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_items TO "${tenantRole}"`);
  await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_kardex TO "${tenantRole}"`);
  await queryRunner.query(`GRANT USAGE, SELECT ON SEQUENCE inventory_kardex_id_seq TO "${tenantRole}"`);
}

async function bootstrapCreditNoteSchema(
  queryRunner: QueryRunner,
  schema: string,
  tenantRole: string,
): Promise<void> {
  await createMinimalSalesTables(queryRunner);
  await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
  await new AddCreditNoteProvenance1782000000000().up(queryRunner);
  await grantTenantRoleAccess(queryRunner, schema, tenantRole);
}

async function seedOriginData(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    INSERT INTO invoices (id, tenant_id, type) VALUES
      ('sale-a-1', 'tenant-a', 'regular'),
      ('sale-a-2', 'tenant-a', 'regular'),
      ('sale-b-1', 'tenant-b', 'regular');
    INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy) VALUES
      ('cn-a-origin', 'tenant-a', 'creditNote', 'sale-a-1', 'FINANCIAL_ONLY');
    INSERT INTO invoice_items (id, tenant_id, invoice_id) VALUES
      ('sale-a-1-item-1', 'tenant-a', 'sale-a-1'),
      ('sale-a-2-item-1', 'tenant-a', 'sale-a-2'),
      ('sale-b-1-item-1', 'tenant-b', 'sale-b-1');
    INSERT INTO inventory_kardex (
      tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
      total_cost_nio, stock_before, stock_after, source_document_type,
      source_document_id
    ) VALUES
      ('tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000,
       10.0000, 10.0000, 5.0000, 4.0000, 'SALE', 'invoice:sale-a-1'),
      ('tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000,
       10.0000, 10.0000, 4.0000, 3.0000, 'SALE', 'invoice:sale-a-2'),
      ('tenant-b', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000,
       10.0000, 10.0000, 5.0000, 4.0000, 'SALE', 'invoice:sale-b-1');
  `);
}

async function withTenantTransaction(
  queryRunner: QueryRunner,
  tenantRole: string,
  tenantId: string,
  assertion: () => Promise<void>,
): Promise<void> {
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SET LOCAL ROLE "${tenantRole}"`);
    await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await assertion();
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}

async function expectRejectedAtSavepoint(
  queryRunner: QueryRunner,
  savepoint: string,
  sql: string,
  message: RegExp,
): Promise<void> {
  await queryRunner.query(`SAVEPOINT ${savepoint}`);
  await expect(queryRunner.query(sql)).rejects.toThrow(message);
  await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await queryRunner.query(`RELEASE SAVEPOINT ${savepoint}`);
}

describe('AddCreditNoteProvenance1782000000000 (db)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'enforces credit-note origin item, tenant, policy, append-only, and RLS invariants against PostgreSQL',
    async () => {
      await withIsolatedSchema(
        'credit_note_provenance',
        async ({ queryRunner, schema, tenantRole }) => {
          await bootstrapCreditNoteSchema(queryRunner, schema, tenantRole);
          await seedOriginData(queryRunner);

          const tenantBOrigin = (await queryRunner.query(`
            SELECT id FROM inventory_kardex
            WHERE tenant_id = 'tenant-b' AND source_document_id = 'invoice:sale-b-1'
          `)) as Array<{ id: string }>;

          await withTenantTransaction(queryRunner, tenantRole, 'tenant-a', async () => {
            await queryRunner.query(`
              INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy)
              VALUES ('cn-a-valid', 'tenant-a', 'creditNote', 'sale-a-1', 'RESTOCK_ORIGINAL_BOM')
            `);
            await queryRunner.query(`
              INSERT INTO invoice_items (id, tenant_id, invoice_id, origin_invoice_item_id)
              VALUES ('cn-a-valid-item-1', 'tenant-a', 'cn-a-valid', 'sale-a-1-item-1')
            `);

            const accepted = (await queryRunner.query(`
              SELECT i.id, ii.origin_invoice_item_id
              FROM invoices i
              JOIN invoice_items ii ON ii.invoice_id = i.id
              WHERE i.id = 'cn-a-valid'
            `)) as Array<{ id: string; origin_invoice_item_id: string }>;
            expect(accepted).toEqual([
              { id: 'cn-a-valid', origin_invoice_item_id: 'sale-a-1-item-1' },
            ]);

            await expectRejectedAtSavepoint(
              queryRunner,
              'empty_credit_item_origin',
              `INSERT INTO invoice_items (id, tenant_id, invoice_id)
               VALUES ('cn-a-missing-item-origin', 'tenant-a', 'cn-a-valid')`,
              /requires origin invoice item/,
            );
            await queryRunner.query(`
              INSERT INTO invoice_items (id, tenant_id, invoice_id)
              VALUES ('regular-originless-item', 'tenant-a', 'sale-a-1')
            `);
            await expectRejectedAtSavepoint(
              queryRunner,
              'update_originless_item_into_credit_note',
              `UPDATE invoice_items
               SET invoice_id = 'cn-a-valid'
               WHERE id = 'regular-originless-item'`,
              /requires origin invoice item/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'orphan_credit_invoice_origin',
              `INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy)
               VALUES ('cn-a-orphan-invoice', 'tenant-a', 'creditNote', 'missing-sale', 'FINANCIAL_ONLY')`,
              /origin invoice was not found/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_origin_invoice_is_credit_note',
              `INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy)
               VALUES ('cn-a-credit-origin', 'tenant-a', 'creditNote', 'cn-a-origin', 'FINANCIAL_ONLY')`,
              /origin invoice must be a regular sale invoice/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'orphan_credit_item_origin',
              `INSERT INTO invoice_items (id, tenant_id, invoice_id, origin_invoice_item_id)
               VALUES ('cn-a-orphan-item', 'tenant-a', 'cn-a-valid', 'missing-item')`,
              /origin invoice item was not found/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'mixed_credit_item_origin',
              `INSERT INTO invoice_items (id, tenant_id, invoice_id, origin_invoice_item_id)
               VALUES ('cn-a-mixed-item', 'tenant-a', 'cn-a-valid', 'sale-a-2-item-1')`,
              /must belong to the credit-note origin invoice/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'cross_tenant_credit_item_origin',
              `INSERT INTO invoice_items (id, tenant_id, invoice_id, origin_invoice_item_id)
               VALUES ('cn-a-cross-item', 'tenant-a', 'cn-a-valid', 'sale-b-1-item-1')`,
              /origin invoice item was not found|belongs to another tenant/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'invalid_refund_policy',
              `INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy)
               VALUES ('cn-a-bad-policy', 'tenant-a', 'creditNote', 'sale-a-1', 'RETURN_TO_ACTIVE_STOCK')`,
              /chk_invoices_credit_note_origin_policy|violates check constraint/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'regular_invoice_spoofed_origin_invoice',
              `INSERT INTO invoices (id, tenant_id, type, origin_invoice_id, refund_reason_policy)
               VALUES ('regular-spoofed-origin', 'tenant-a', 'regular', 'sale-a-1', 'FINANCIAL_ONLY')`,
              /non-credit invoice provenance fields must be null|chk_invoices_credit_note_origin_policy|violates check constraint/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'regular_invoice_spoofed_refund_reason_code',
              `INSERT INTO invoices (id, tenant_id, type, refund_reason_code)
               VALUES ('regular-spoofed-reason', 'tenant-a', 'regular', 'DAMAGED_RETURN')`,
              /non-credit invoice provenance fields must be null|chk_invoices_credit_note_origin_policy|violates check constraint/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'regular_item_spoofed_origin_item',
              `INSERT INTO invoice_items (id, tenant_id, invoice_id, origin_invoice_item_id)
               VALUES ('regular-spoofed-item-origin', 'tenant-a', 'sale-a-1', 'sale-a-1-item-1')`,
              /non-credit invoice item cannot reference an origin invoice item/,
            );

            const tenantAOrigin = (await queryRunner.query(`
              SELECT id FROM inventory_kardex
              WHERE tenant_id = 'tenant-a' AND source_document_id = 'invoice:sale-a-1'
            `)) as Array<{ id: string }>;
            const tenantAOtherOrigin = (await queryRunner.query(`
              SELECT id FROM inventory_kardex
              WHERE tenant_id = 'tenant-a' AND source_document_id = 'invoice:sale-a-2'
            `)) as Array<{ id: string }>;
            await queryRunner.query(`
              INSERT INTO inventory_kardex (
                tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                total_cost_nio, stock_before, stock_after, source_document_type,
                source_document_id, origin_movement_id, origin_invoice_item_id,
                refund_reason_policy
              ) VALUES (
                'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-valid',
                ${tenantAOrigin[0].id}, 'sale-a-1-item-1', 'RESTOCK_ORIGINAL_BOM'
              )
            `);
            await expectRejectedAtSavepoint(
              queryRunner,
              'cross_tenant_origin_movement',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id,
                 refund_reason_policy
                ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-valid',
                 ${tenantBOrigin[0].id}, 'sale-a-1-item-1', 'RESTOCK_ORIGINAL_BOM'
                )`,
              /origin movement was not found|belongs to another tenant/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_missing_credit_note_invoice',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id,
                 refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'sale-a-1',
                 ${tenantAOrigin[0].id}, 'sale-a-1-item-1', 'RESTOCK_ORIGINAL_BOM'
               )`,
              /credit-note kardex source invoice must be a credit note/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_policy_mismatch',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id,
                 refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-valid',
                 ${tenantAOrigin[0].id}, 'sale-a-1-item-1', 'WASTE_NO_RESTOCK'
               )`,
              /refund reason policy must match the credit-note invoice/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_origin_movement_mismatch',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id,
                 refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-valid',
                 ${tenantAOtherOrigin[0].id}, 'sale-a-1-item-1', 'RESTOCK_ORIGINAL_BOM'
               )`,
              /origin movement must belong to the credit-note origin invoice/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_missing_policy',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-missing-policy',
                 ${tenantAOrigin[0].id}, 'sale-a-1-item-1'
               )`,
              /refund reason policy/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_missing_origin_movement',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_invoice_item_id, refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-missing-movement',
                 'sale-a-1-item-1', 'RESTOCK_ORIGINAL_BOM'
               )`,
              /origin movement/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_note_kardex_missing_origin_item',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE_CANCEL', 1.0000,
                 10.0000, 10.0000, 4.0000, 5.0000, 'CREDIT_NOTE', 'cn-a-missing-item',
                 ${tenantAOrigin[0].id}, 'RESTOCK_ORIGINAL_BOM'
               )`,
              /origin invoice item/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'sale_kardex_spoofed_credit_note_provenance',
              `INSERT INTO inventory_kardex (
                 tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
                 total_cost_nio, stock_before, stock_after, source_document_type,
                 source_document_id, origin_movement_id, origin_invoice_item_id,
                 refund_reason_policy
               ) VALUES (
                 'tenant-a', '00000000-0000-0000-0000-000000000001', 'SALE', -1.0000,
                 10.0000, 10.0000, 4.0000, 3.0000, 'SALE', 'sale-a-1',
                 ${tenantAOrigin[0].id}, 'sale-a-1-item-1', 'FINANCIAL_ONLY'
               )`,
              /non-credit kardex provenance fields must be null|chk_inventory_kardex_refund_reason_policy|violates check constraint/,
            );

            await expectRejectedAtSavepoint(
              queryRunner,
              'kardex_update',
              `UPDATE inventory_kardex SET stock_after = 99.0000
               WHERE source_document_id = 'cn-a-valid'`,
              /append-only/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'kardex_delete',
              `DELETE FROM inventory_kardex WHERE source_document_id = 'cn-a-valid'`,
              /append-only/,
            );

            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_invoice_update',
              `UPDATE invoices SET refund_reason_policy = 'WASTE_NO_RESTOCK' WHERE id = 'cn-a-valid'`,
              /append-only/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_invoice_delete',
              `DELETE FROM invoices WHERE id = 'cn-a-valid'`,
              /append-only/,
            );
            await expectRejectedAtSavepoint(
              queryRunner,
              'credit_item_update',
              `UPDATE invoice_items SET origin_invoice_item_id = 'sale-a-2-item-1'
               WHERE id = 'cn-a-valid-item-1'`,
              /append-only|must belong to the credit-note origin invoice/,
            );
          });

          await withTenantTransaction(queryRunner, tenantRole, 'tenant-b', async () => {
            const tenantBRows = (await queryRunner.query(`
              SELECT id FROM invoices WHERE id = 'cn-a-valid'
            `)) as Array<{ id: string }>;
            expect(tenantBRows).toEqual([]);
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'removes migration-owned schema objects during rollback and restores a no-prior-RLS baseline',
    async () => {
      await withIsolatedSchema(
        'credit_note_rollback',
        async ({ queryRunner, schema, tenantRole }) => {
          await createMinimalSalesTables(queryRunner);
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          const migration = new AddCreditNoteProvenance1782000000000();
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);
          await migration.down(queryRunner);

          const columns = (await queryRunner.query(`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND column_name IN ('origin_invoice_id', 'origin_invoice_item_id', 'origin_movement_id', 'refund_reason_policy')
            ORDER BY table_name, column_name
          `)) as Array<{ table_name: string; column_name: string }>;
          expect(columns).toEqual([]);

          const routines = (await queryRunner.query(`
            SELECT routine_name
            FROM information_schema.routines
            WHERE specific_schema = current_schema()
              AND routine_name IN ('validate_credit_note_origin_tenant', 'reject_credit_note_provenance_mutation')
          `)) as Array<{ routine_name: string }>;
          expect(routines).toEqual([]);

          const protections = (await queryRunner.query(`
            SELECT relname, relrowsecurity, relforcerowsecurity
            FROM pg_class
            JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            WHERE relname IN ('invoices', 'invoice_items', 'inventory_kardex')
              AND nspname = current_schema()
            ORDER BY relname
          `)) as Array<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
          }>;
          expect(protections).toEqual([
            {
              relname: 'inventory_kardex',
              relrowsecurity: false,
              relforcerowsecurity: false,
            },
            {
              relname: 'invoice_items',
              relrowsecurity: false,
              relforcerowsecurity: false,
            },
            {
              relname: 'invoices',
              relrowsecurity: false,
              relforcerowsecurity: false,
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'preserves pre-existing RLS and FORCE RLS protections during rollback',
    async () => {
      await withIsolatedSchema(
        'credit_note_rls_preserve',
        async ({ queryRunner, schema, tenantRole }) => {
          await createMinimalSalesTables(queryRunner);
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await queryRunner.query(`
            ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
            ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
            CREATE POLICY baseline_invoices_tenant_select ON invoices
              FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
            CREATE POLICY baseline_invoices_tenant_insert ON invoices
              FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
            ALTER TABLE inventory_kardex ENABLE ROW LEVEL SECURITY;
            ALTER TABLE inventory_kardex FORCE ROW LEVEL SECURITY;
            CREATE POLICY baseline_kardex_tenant_select ON inventory_kardex
              FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
            CREATE POLICY baseline_kardex_tenant_insert ON inventory_kardex
              FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
          `);
          const migration = new AddCreditNoteProvenance1782000000000();
          await migration.up(queryRunner);
          await grantTenantRoleAccess(queryRunner, schema, tenantRole);
          await migration.down(queryRunner);

          await queryRunner.query(`
            INSERT INTO invoices (id, tenant_id, type) VALUES
              ('rls-own-invoice', 'tenant-a', 'regular'),
              ('rls-other-invoice', 'tenant-b', 'regular');
            INSERT INTO inventory_kardex (
              tenant_id, insumo_id, movement_type, quantity, unit_cost_nio,
              total_cost_nio, stock_before, stock_after, source_document_type,
              source_document_id
            ) VALUES
              ('tenant-a', '00000000-0000-0000-0000-000000000001', 'PURCHASE', 1.0000,
               10.0000, 10.0000, 0.0000, 1.0000, 'PURCHASE', 'rls-own-invoice'),
              ('tenant-b', '00000000-0000-0000-0000-000000000001', 'PURCHASE', 1.0000,
               10.0000, 10.0000, 0.0000, 1.0000, 'PURCHASE', 'rls-other-invoice');
          `);

          await withTenantTransaction(queryRunner, tenantRole, 'tenant-a', async () => {
            const invoices = (await queryRunner.query(`
              SELECT id FROM invoices ORDER BY id
            `)) as Array<{ id: string }>;
            const kardexRows = (await queryRunner.query(`
              SELECT source_document_id FROM inventory_kardex ORDER BY source_document_id
            `)) as Array<{ source_document_id: string }>;

            expect(invoices).toEqual([{ id: 'rls-own-invoice' }]);
            expect(kardexRows).toEqual([
              { source_document_id: 'rls-own-invoice' },
            ]);
          });
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'restores exact baseline RLS/FORCE state during rollback even when no baseline policies exist',
    async () => {
      await withIsolatedSchema(
        'credit_note_rls_zero_policy',
        async ({ queryRunner }) => {
          await createMinimalSalesTables(queryRunner);
          await new BohInventoryLedgerFoundation1766000000000().up(queryRunner);
          await queryRunner.query(`
            ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
            ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
            ALTER TABLE inventory_kardex ENABLE ROW LEVEL SECURITY;
          `);

          const migration = new AddCreditNoteProvenance1782000000000();
          await migration.up(queryRunner);
          await migration.down(queryRunner);

          const protections = (await queryRunner.query(`
            SELECT relname, relrowsecurity, relforcerowsecurity
            FROM pg_class
            JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            WHERE relname IN ('invoices', 'invoice_items', 'inventory_kardex')
              AND nspname = current_schema()
            ORDER BY relname
          `)) as Array<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
          }>;

          expect(protections).toEqual([
            {
              relname: 'inventory_kardex',
              relrowsecurity: true,
              relforcerowsecurity: false,
            },
            {
              relname: 'invoice_items',
              relrowsecurity: false,
              relforcerowsecurity: false,
            },
            {
              relname: 'invoices',
              relrowsecurity: true,
              relforcerowsecurity: true,
            },
          ]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
