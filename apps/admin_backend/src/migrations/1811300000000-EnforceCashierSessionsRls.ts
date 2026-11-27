import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Adds and backfills `tenant_id uuid` on `cashier_sessions` and enforces
 * `ENABLE` + `FORCE ROW LEVEL SECURITY` (`direct:SIUD`) — issue #512 founder
 * decision #1 ("add and backfill tenant_id, classify direct").
 *
 * - Idempotent for scenario-2 partial-ledger replay in `verify-schema-build.sh`.
 * - Backfills any pre-existing rows from `users.tenant_id` via `user_id` when
 *   `users` exists in the current schema, then enforces `NOT NULL` when zero
 *   unattributed rows remain.
 */
const TABLE = 'cashier_sessions';
const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;
type PolicyCommand = (typeof COMMANDS)[number];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceCashierSessionsRls1811300000000 implements MigrationInterface {
  name = 'EnforceCashierSessionsRls1811300000000';

  private policyName(command: PolicyCommand): string {
    return `${TABLE}_tenant_${command}`;
  }

  private policyExpression(
    command: PolicyCommand,
    tenantPredicate: string,
  ): string {
    switch (command) {
      case 'select':
        return `FOR SELECT\n      USING (${tenantPredicate})`;
      case 'insert':
        return `FOR INSERT\n      WITH CHECK (${tenantPredicate})`;
      case 'update':
        return `FOR UPDATE\n      USING (${tenantPredicate})\n      WITH CHECK (${tenantPredicate})`;
      case 'delete':
        return `FOR DELETE\n      USING (${tenantPredicate})`;
    }
  }

  async up(runner: QueryRunner): Promise<void> {
    const tableId = quoteIdentifier(TABLE);

    await runner.query(
      `ALTER TABLE ${tableId} ADD COLUMN IF NOT EXISTS tenant_id uuid`,
    );

    // Backfill tenant_id from users.tenant_id when users exists in current_schema().
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'users'
        ) THEN
          UPDATE cashier_sessions cs
          SET tenant_id = u.tenant_id
          FROM users u
          WHERE cs.tenant_id IS NULL
            AND u.id::text = cs.user_id;
        END IF;
      END $$;
    `);

    await runner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM cashier_sessions WHERE tenant_id IS NULL) THEN
          ALTER TABLE cashier_sessions ALTER COLUMN tenant_id SET NOT NULL;
        END IF;
      END $$;
    `);

    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_cashier_sessions_tenant_id ON ${tableId} (tenant_id)`,
    );

    await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
    await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

    const tenantPredicate = await resolveTenantRlsPredicate(runner, TABLE);

    for (const command of COMMANDS) {
      const policyName = this.policyName(command);
      await runner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(policyName)} ON ${tableId}`,
      );
      await runner.query(
        `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${TABLE}'
          AND policyname = '${policyName}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(policyName)} ON ${tableId}
      ${this.policyExpression(command, tenantPredicate)};
      END IF;
      END $$;`,
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const tableId = quoteIdentifier(TABLE);
    for (const command of COMMANDS) {
      await runner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(command))} ON ${tableId}`,
      );
    }
    await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
  }
}
