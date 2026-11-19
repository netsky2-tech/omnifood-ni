import { type MigrationInterface, type QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Issue #984: the audit trail is append-only, and the schema now says so.
 *
 * `tenant_entitlement_change_history` is classified `direct:SI` in
 * `scripts/schema-rls-coverage-manifest.txt` — SELECT and INSERT, nothing else.
 * The ENT-01 migration created UPDATE and DELETE policies for every tenant
 * table from a shared list, so this one ended up with a policy set wider than
 * its declaration. The coverage gate built from an empty database reports it:
 *
 *   undeclared-command-policy | tenant_entitlement_change_history |
 *   policy command UPDATE (U) is outside the declared set "direct:SI"
 *
 * Two consequences, and the second is why this is a migration and not a
 * manifest edit: the application role could rewrite or delete the only record
 * of who granted a commercial exception and why, and the manifest would have
 * had to claim that was intended.
 *
 * Not by editing ENT-01: that migration is already applied in every existing
 * database, so changing it would alter history without changing any deployed
 * schema — the same reason 1810500000000 exists.
 *
 * Dropping the policies leaves an UPDATE/DELETE affecting zero rows, which is
 * silent; the loud rejection arrives in 1810600000000 (the append-only
 * trigger). Both are needed: the policy set matches the declaration here, and
 * the trigger refuses the attempt instead of pretending it worked.
 *
 * Idempotent (`DROP POLICY IF EXISTS`) and reversible: `down` recreates both
 * policies with the same predicate the tenant tables use.
 */
export class DropChangeHistoryMutationPolicies1810550000000
  implements MigrationInterface
{
  name = 'DropChangeHistoryMutationPolicies1810550000000';

  private static readonly TABLE = 'tenant_entitlement_change_history';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = DropChangeHistoryMutationPolicies1810550000000.TABLE;
    for (const command of ['update', 'delete']) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${table}_tenant_${command}" ON "${table}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = DropChangeHistoryMutationPolicies1810550000000.TABLE;
    const predicate = await resolveTenantRlsPredicate(queryRunner, table);

    await queryRunner.query(
      `DROP POLICY IF EXISTS "${table}_tenant_update" ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY "${table}_tenant_update" ON "${table}"
         FOR UPDATE USING (${predicate}) WITH CHECK (${predicate})`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS "${table}_tenant_delete" ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY "${table}_tenant_delete" ON "${table}"
         FOR DELETE USING (${predicate})`,
    );
  }
}
