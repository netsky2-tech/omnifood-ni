import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes the RLS claim predicate on device_linking_codes.
 *
 * The original claim predicate wraps the tenant predicate with OR:
 *   (tenant_id = current_setting('app.tenant_id', true)::uuid OR ...)
 *
 * When app.tenant_id is not set (pre-auth claim), current_setting(..., true)
 * returns '' (empty string), and ''::uuid throws:
 *   "invalid input syntax for type uuid: ''"
 *
 * The fix uses NULLIF to coerce empty string to NULL before the cast:
 *   tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
 *
 * NULLIF('', '') returns NULL, NULL::uuid is NULL, and tenant_id = NULL is
 * NULL (not true), so the OR falls through to the linking_claim branch as
 * intended.
 *
 * This affects the SELECT and UPDATE policies that carry the claim branch.
 * The INSERT policy uses the plain predicate (no claim branch) and is not
 * affected — it only runs in authenticated tenant context where
 * app.tenant_id is always bound.
 */
export class FixDeviceLinkingClaimRlsPredicate1809520000000
  implements MigrationInterface
{
  name = 'FixDeviceLinkingClaimRlsPredicate1809520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Resolve the current predicate form (uuid vs varchar) from the catalog.
    const col = await queryRunner.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'device_linking_codes' AND column_name = 'tenant_id'`,
    );
    const dataType: string = col?.[0]?.data_type ?? 'uuid';
    const basePredicate =
      dataType === 'uuid'
        ? "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid"
        : "tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')";
    const claimPredicate = `(${basePredicate} OR current_setting('app.linking_claim', true) = 'on')`;

    // Recreate SELECT policy with the fixed predicate.
    await queryRunner.query(
      `DROP POLICY IF EXISTS device_linking_codes_tenant_select ON device_linking_codes`,
    );
    await queryRunner.query(
      `CREATE POLICY device_linking_codes_tenant_select ON device_linking_codes
       FOR SELECT USING (${claimPredicate})`,
    );

    // Recreate UPDATE policy with the fixed predicate.
    await queryRunner.query(
      `DROP POLICY IF EXISTS device_linking_codes_tenant_update ON device_linking_codes`,
    );
    await queryRunner.query(
      `CREATE POLICY device_linking_codes_tenant_update ON device_linking_codes
       FOR UPDATE USING (${claimPredicate})
       WITH CHECK (${claimPredicate})`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the original predicate (without NULLIF).
    const col = await queryRunner.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'device_linking_codes' AND column_name = 'tenant_id'`,
    );
    const dataType: string = col?.[0]?.data_type ?? 'uuid';
    const basePredicate =
      dataType === 'uuid'
        ? "tenant_id = current_setting('app.tenant_id', true)::uuid"
        : "tenant_id::text = current_setting('app.tenant_id', true)";
    const claimPredicate = `(${basePredicate} OR current_setting('app.linking_claim', true) = 'on')`;

    await queryRunner.query(
      `DROP POLICY IF EXISTS device_linking_codes_tenant_select ON device_linking_codes`,
    );
    await queryRunner.query(
      `CREATE POLICY device_linking_codes_tenant_select ON device_linking_codes
       FOR SELECT USING (${claimPredicate})`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS device_linking_codes_tenant_update ON device_linking_codes`,
    );
    await queryRunner.query(
      `CREATE POLICY device_linking_codes_tenant_update ON device_linking_codes
       FOR UPDATE USING (${claimPredicate})
       WITH CHECK (${claimPredicate})`,
    );
  }
}
