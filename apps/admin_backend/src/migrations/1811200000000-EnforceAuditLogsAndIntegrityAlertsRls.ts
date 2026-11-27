import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Forces tenant row level security on `audit_logs` (`direct:SI`) and
 * `audit_integrity_alerts` (`direct:SIU`) — issue #512.
 *
 * - `audit_logs` is append-only behind `trg_audit_logs_immutable`; its RLS
 *   policies deliberately expose ONLY `SELECT` and `INSERT` (`direct:SI`),
 *   never `UPDATE` or `DELETE`.
 * - `audit_integrity_alerts` is read by `AuditLogsService.getIntegrityAlerts`
 *   and inserted/updated by `AuditIntegrityService.runNightly` (per-tenant
 *   `runInTenantTransaction`); its RLS policies expose `SELECT`, `INSERT`,
 *   and `UPDATE` (`direct:SIU`), never `DELETE`.
 * - Both `up()` and `down()` are idempotent for scenario-2 partial-ledger
 *   replay in `scripts/verify-schema-build.sh`.
 */
type PolicyCommand = 'select' | 'insert' | 'update';

const TABLE_COMMANDS: ReadonlyArray<{
  table: 'audit_logs' | 'audit_integrity_alerts';
  commands: readonly PolicyCommand[];
}> = [
  { table: 'audit_logs', commands: ['select', 'insert'] },
  { table: 'audit_integrity_alerts', commands: ['select', 'insert', 'update'] },
];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceAuditLogsAndIntegrityAlertsRls1811200000000 implements MigrationInterface {
  name = 'EnforceAuditLogsAndIntegrityAlertsRls1811200000000';

  private policyName(table: string, command: PolicyCommand): string {
    return `${table}_tenant_${command}`;
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
    }
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const { table, commands } of TABLE_COMMANDS) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      const tenantPredicate = await resolveTenantRlsPredicate(runner, table);

      for (const command of commands) {
        const policyName = this.policyName(table, command);
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(policyName)} ON ${tableId}`,
        );
        await runner.query(
          `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${table}'
          AND policyname = '${policyName}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(policyName)} ON ${tableId}
      ${this.policyExpression(command, tenantPredicate)};
      END IF;
      END $$;`,
        );
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const { table, commands } of TABLE_COMMANDS) {
      const tableId = quoteIdentifier(table);

      for (const command of commands) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }

      await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
    }
  }
}
