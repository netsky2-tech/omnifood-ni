import { MigrationInterface, QueryRunner } from 'typeorm';

import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Splits the three FOR ALL tenant policies into per-command policies
 * (issue #512 T3 slice 10, founder decision):
 *
 *   kardex_correction        -> SELECT + INSERT          (append-only ledger)
 *   sys_parametros_config    -> SELECT + INSERT          (append-only ledger)
 *   kardex_recalculate_queue -> SELECT + INSERT + UPDATE (worker queue)
 *
 * Why this exists
 * ---------------
 * The command-policy ratchet (src/core/database/tenant-rls-coverage.ts, issue
 * #512 T3 slice 10) declares an expected command set per `direct` table and
 * enforces it EXACTLY against pg_policies: every declared command must have at
 * least one policy and no policy command may exist outside the declared set.
 * A FOR ALL policy covers all four commands, so it cannot coexist with a
 * declared set narrower than SIUD. These three tables were the last direct
 * tables carrying FOR ALL; this migration converts them to the per-command
 * shape every other direct table already uses, so the manifest can declare
 * their real command sets and be born GREEN.
 *
 * - The declared sets follow each table's actual lifecycle: the two
 *   append-only ledgers reject UPDATE and DELETE behind their immutability
 *   triggers (trg_kardex_correction_immutable,
 *   trg_sys_parametros_config_immutable) and get no policy for those commands,
 *   so RLS deny-by-default makes the trigger unreachable for any tenant
 *   without visibility anyway; the queue mutates its rows in place (status
 *   claims, attempt counters) but never deletes them.
 * - The predicate is resolved through the shared type-aware seam
 *   (resolveTenantRlsPredicate) exactly once per table, NOT hardcoded: a
 *   partial-ledger re-run reaches this migration with whatever tenant_id
 *   column state the earlier ledger rows built, and the emitted form must
 *   match the column AS IT IS. On the current schema (every tenant_id column
 *   is uuid) the resolved form is the uuid-cast setting form
 *   `tenant_id = current_setting('app.tenant_id', true)::uuid`, identical to
 *   what the owning migrations emit, so down() below recreates each FOR ALL
 *   policy byte-identical to the original.
 * - One policy per command named `{table}_tenant_{command}`, following the
 *   existing project convention (the direct-table slices and
 *   EnforceParentOwnedRls1809330000000 all use it). SELECT/UPDATE carry
 *   USING; INSERT carries WITH CHECK; UPDATE carries both.
 * - up() is idempotent: deterministic policy names with DROP POLICY IF EXISTS
 *   before CREATE, each CREATE guarded on the pg_policies catalog. This
 *   matters for the repository's scenario-2 partial-ledger contract, where
 *   the schema build harness re-runs the migration set against a partially
 *   populated ledger.
 * - down() reverses only this migration's effect: it drops exactly the seven
 *   per-command policies created here (in exact reverse order) and recreates
 *   the three original FOR ALL policies with their original names and their
 *   original USING/WITH CHECK shape. It never drops tables, truncates, or
 *   deletes rows.
 */
type PerCommandPolicy = 'select' | 'insert' | 'update';

interface ConvertedForAllTable {
  table: string;
  /** The FOR ALL policy the owning migration created; dropped and split here. */
  forAllPolicyName: string;
  /** The per-command set this table declares in the coverage manifest. */
  commands: readonly PerCommandPolicy[];
}

const CONVERTED_TABLES: readonly ConvertedForAllTable[] = [
  {
    table: 'kardex_correction',
    forAllPolicyName: 'kardex_correction_tenant_isolation',
    commands: ['select', 'insert'],
  },
  {
    table: 'sys_parametros_config',
    forAllPolicyName: 'sys_parametros_config_tenant_isolation',
    commands: ['select', 'insert'],
  },
  {
    table: 'kardex_recalculate_queue',
    forAllPolicyName: 'kardex_queue_tenant_isolation',
    commands: ['select', 'insert', 'update'],
  },
];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

/**
 * The policy body for one command, with per-command USING/WITH CHECK
 * semantics: SELECT and UPDATE filter existing rows through USING, INSERT
 * validates new rows through WITH CHECK, and UPDATE needs both.
 */
function policyBody(command: PerCommandPolicy, predicate: string): string {
  switch (command) {
    case 'select':
      return `FOR SELECT
      USING (${predicate})`;
    case 'insert':
      return `FOR INSERT
      WITH CHECK (${predicate})`;
    case 'update':
      return `FOR UPDATE
      USING (${predicate})
      WITH CHECK (${predicate})`;
  }
}

export class ConvertKardexAndConfigForAllPolicies1809340000000 implements MigrationInterface {
  name = 'ConvertKardexAndConfigForAllPolicies1809340000000';

  /**
   * The per-table conversion vocabulary, exposed for the unit spec and for
   * review: which FOR ALL policy is split on which table, into which
   * commands. Keyed by table name so a spec can never assert against a
   * conversion that silently moved to another table.
   */
  static readonly CONVERTED_TABLES: Record<
    string,
    { forAllPolicyName: string; commands: readonly PerCommandPolicy[] }
  > = Object.fromEntries(
    CONVERTED_TABLES.map(({ table, forAllPolicyName, commands }) => [
      table,
      { forAllPolicyName, commands },
    ]),
  );

  private policyName(table: string, command: PerCommandPolicy): string {
    return `${table}_tenant_${command}`;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, forAllPolicyName, commands } of CONVERTED_TABLES) {
      const tableId = quoteIdentifier(table);

      // One resolution per table: every policy half of this table embeds the
      // same predicate, observed from the same column state.
      const predicate = await resolveTenantRlsPredicate(queryRunner, table);

      // The FOR ALL policy is replaced, not kept: leaving it would keep every
      // command open and defeat the declared command set.
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(forAllPolicyName)} ON ${tableId}`,
      );

      for (const command of commands) {
        const policyName = this.policyName(table, command);
        await queryRunner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(policyName)} ON ${tableId}`,
        );
        // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
        await queryRunner.query(
          `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${table}'
          AND policyname = '${policyName}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(policyName)} ON ${tableId}
      ${policyBody(command, predicate)};
      END IF;
      END $$;`,
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Exact reverse of up(): last table first, and within each table the
    // per-command policies in reverse command order, then the original FOR
    // ALL policy restored byte-identical to what its owning migration emits
    // in the same column state.
    for (const { table, forAllPolicyName, commands } of [
      ...CONVERTED_TABLES,
    ].reverse()) {
      const tableId = quoteIdentifier(table);
      const predicate = await resolveTenantRlsPredicate(queryRunner, table);

      for (const command of [...commands].reverse()) {
        await queryRunner.query(
          `DROP POLICY IF EXISTS ${quoteIdentifier(this.policyName(table, command))} ON ${tableId}`,
        );
      }

      await queryRunner.query(
        `DROP POLICY IF EXISTS ${quoteIdentifier(forAllPolicyName)} ON ${tableId}`,
      );
      // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
      await queryRunner.query(
        `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = '${table}'
          AND policyname = '${forAllPolicyName}'
      ) THEN
        CREATE POLICY ${quoteIdentifier(forAllPolicyName)} ON ${tableId}
          FOR ALL
          USING (${predicate})
          WITH CHECK (${predicate});
      END IF;
      END $$;`,
      );
    }
  }
}
