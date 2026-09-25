import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateInventoryRemediationReceipts1806000000000 } from './1806000000000-CreateInventoryRemediationReceipts';

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

interface IsolatedDatabaseContext {
  queryRunner: QueryRunner;
  schema: string;
  tenantRole: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedDatabaseContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

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
    await queryRunner.query(`SET search_path TO "${schema}", public`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    await assertion({ queryRunner, schema, tenantRole });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // best-effort cleanup
    }
    try {
      await queryRunner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
    } catch {
      // best-effort cleanup
    }

    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }
    if (isInitialized && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('CreateInventoryRemediationReceipts1806000000000 (db)', () => {
  const migration = new CreateInventoryRemediationReceipts1806000000000();

  it('creates table, enforces RLS, blocks update/delete via trigger, and protects evidence on down', async () => {
    await withIsolatedSchema('mig_1806', async ({ queryRunner, schema, tenantRole }) => {
      // 1. Run migration up
      await migration.up(queryRunner);

      // Grant permissions to tenantRole
      await queryRunner.query(`
        GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}";
        GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_remediation_receipts TO "${tenantRole}";
      `);

      const receiptId1 = randomUUID();
      const invoiceId1 = randomUUID();
      const receiptSyncId1 = randomUUID();
      const recipeVersionId1 = randomUUID();
      const auditEventId1 = randomUUID();

      // 2. Insert as tenant-a under tenantRole
      await queryRunner.query(`SET ROLE "${tenantRole}"`);
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, false)`, ['tenant-a']);

      await queryRunner.query(`
        INSERT INTO inventory_remediation_receipts (
          id, tenant_id, idempotency_key, command_type, request_hash,
          source_invoice_id, source_inventory_receipt_id, recipe_version_id,
          actor_user_id, actor_role, reason, status, result, audit_event_id
        ) VALUES (
          '${receiptId1}', 'tenant-a', 'idemp-1', 'SALE_INVENTORY_REMEDIATION', 'hash-1',
          '${invoiceId1}', '${receiptSyncId1}', '${recipeVersionId1}',
          'user-1', 'owner', 'remediation test', 'APPLIED', '{"movements": []}', '${auditEventId1}'
        )
      `);

      // 3. Query as tenant-a -> returns 1 row
      const tenantARows = await queryRunner.query(`SELECT * FROM inventory_remediation_receipts`);
      expect(tenantARows).toHaveLength(1);
      expect(tenantARows[0].id).toBe(receiptId1);

      // 4. Query as tenant-b -> returns 0 rows (RLS isolation)
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, false)`, ['tenant-b']);
      const tenantBRows = await queryRunner.query(`SELECT * FROM inventory_remediation_receipts`);
      expect(tenantBRows).toHaveLength(0);

      // 5. Insert as tenant-b with spoofed tenant_id 'tenant-a' fails RLS WITH CHECK
      await expect(
        queryRunner.query(`
          INSERT INTO inventory_remediation_receipts (
            id, tenant_id, idempotency_key, command_type, request_hash,
            source_invoice_id, source_inventory_receipt_id, recipe_version_id,
            actor_user_id, actor_role, reason, status, result, audit_event_id
          ) VALUES (
            '${randomUUID()}', 'tenant-a', 'idemp-2', 'SALE_INVENTORY_REMEDIATION', 'hash-2',
            '${randomUUID()}', '${randomUUID()}', '${randomUUID()}',
            'user-1', 'owner', 'remediation test', 'APPLIED', '{}', '${randomUUID()}'
          )
        `),
      ).rejects.toThrow();

      // 6. UPDATE is denied by append-only trigger
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, false)`, ['tenant-a']);
      await expect(
        queryRunner.query(`UPDATE inventory_remediation_receipts SET status = 'FAILED' WHERE id = '${receiptId1}'`),
      ).rejects.toThrow(/append-only/i);

      // 7. DELETE is denied by append-only trigger
      await expect(
        queryRunner.query(`DELETE FROM inventory_remediation_receipts WHERE id = '${receiptId1}'`),
      ).rejects.toThrow(/append-only/i);

      // 8. Duplicate idempotency key within tenant is rejected
      await expect(
        queryRunner.query(`
          INSERT INTO inventory_remediation_receipts (
            id, tenant_id, idempotency_key, command_type, request_hash,
            source_invoice_id, source_inventory_receipt_id, recipe_version_id,
            actor_user_id, actor_role, reason, status, result, audit_event_id
          ) VALUES (
            '${randomUUID()}', 'tenant-a', 'idemp-1', 'SALE_INVENTORY_REMEDIATION', 'hash-diff',
            '${randomUUID()}', '${randomUUID()}', '${randomUUID()}',
            'user-1', 'owner', 'remediation test', 'APPLIED', '{}', '${randomUUID()}'
          )
        `),
      ).rejects.toThrow();

      // 9. Duplicate remediation for the same source invoice and command type is rejected
      await expect(
        queryRunner.query(`
          INSERT INTO inventory_remediation_receipts (
            id, tenant_id, idempotency_key, command_type, request_hash,
            source_invoice_id, source_inventory_receipt_id, recipe_version_id,
            actor_user_id, actor_role, reason, status, result, audit_event_id
          ) VALUES (
            '${randomUUID()}', 'tenant-a', 'idemp-different-key', 'SALE_INVENTORY_REMEDIATION', 'hash-diff',
            '${invoiceId1}', '${randomUUID()}', '${randomUUID()}',
            'user-1', 'owner', 'remediation test', 'APPLIED', '{}', '${randomUUID()}'
          )
        `),
      ).rejects.toThrow();

      // Reset role to superuser for down migration
      await queryRunner.query('RESET ROLE');

      // 10. Down migration refuses to run while historical evidence exists
      await expect(migration.down(queryRunner)).rejects.toThrow(/historical remediation receipts exist/i);
    });
  });
});
