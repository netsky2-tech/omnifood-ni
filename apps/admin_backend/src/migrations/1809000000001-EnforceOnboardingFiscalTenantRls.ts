import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Forces tenant row level security on the onboarding/fiscal tables.
 *
 * - ENABLE + FORCE RLS so neither the application role nor the table owner
 *   can bypass tenant isolation.
 * - One policy per command (select/insert/update/delete) named
 *   `{table}_tenant_{command}`, following the existing project convention.
 * - The predicate is a text comparison against the transaction-local
 *   `app.tenant_id` setting because these tenant_id columns are varchar(128):
 *   casting to uuid is not allowed. A missing setting resolves to NULL and an
 *   empty setting never equals a real tenant_id, so both deny access.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE; ENABLE/FORCE are already idempotent.
 * - down() reverses only this migration's effect: it drops exactly the
 *   policies created here and removes FORCE while leaving ENABLE in place.
 *   It never drops tables, truncates, or deletes rows.
 */
const TABLES = [
  'onboarding_activation_attempts',
  'onboarding_activation_check_results',
  'onboarding_activation_follow_ups',
  'onboarding_telemetry_events',
  'fiscal_config_revisions',
] as const;

const TENANT_PREDICATE = "tenant_id = current_setting('app.tenant_id', true)";

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class EnforceOnboardingFiscalTenantRls1809000000001
  implements MigrationInterface
{
  name = 'EnforceOnboardingFiscalTenantRls1809000000001';

  private policyName(table: string, command: string): string {
    return `${table}_tenant_${command}`;
  }

  async up(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      await runner.query(`ALTER TABLE ${tableId} ENABLE ROW LEVEL SECURITY`);
      await runner.query(`ALTER TABLE ${tableId} FORCE ROW LEVEL SECURITY`);

      const policies = [
        {
          command: 'select',
          expression: `FOR SELECT
      USING (${TENANT_PREDICATE})`,
        },
        {
          command: 'insert',
          expression: `FOR INSERT
      WITH CHECK (${TENANT_PREDICATE})`,
        },
        {
          command: 'update',
          expression: `FOR UPDATE
      USING (${TENANT_PREDICATE})
      WITH CHECK (${TENANT_PREDICATE})`,
        },
        {
          command: 'delete',
          expression: `FOR DELETE
      USING (${TENANT_PREDICATE})`,
        },
      ];

      for (const policy of policies) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}`,
        );
        await runner.query(
          `CREATE POLICY ${quoteIdentifier(this.policyName(table, policy.command))} ON ${tableId}
      ${policy.expression}`,
        );
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const tableId = quoteIdentifier(table);

      for (const command of ['select', 'insert', 'update', 'delete']) {
        await runner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }

      // Keep RLS enabled; only remove the FORCE applied by this migration.
      await runner.query(`ALTER TABLE ${tableId} NO FORCE ROW LEVEL SECURITY`);
    }
  }
}
