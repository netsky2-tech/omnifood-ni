import { type MigrationInterface, type QueryRunner } from 'typeorm';
import {
  PLAN_CAPABILITY_MATRIX,
  type PlanCapabilityMap,
} from '../modules/entitlements/capability-registry';

/**
 * Catalog v1.1 of issue #984: seeds the `promotions.convenio` capability into
 * the plan matrix of databases that already ran 1810400000000.
 *
 * Why a separate migration instead of editing the previous one: that migration
 * seeds whatever the registry declares *at run time*, so a FRESH database
 * already gets this row (the seed loops over `CAPABILITY_REGISTRY`). An
 * EXISTING database does not — its rows were written when the key did not
 * exist. Editing an applied migration would change history without changing
 * any deployed database, which is exactly the failure this migration avoids.
 *
 * Idempotent by construction (`ON CONFLICT DO NOTHING`), so running it on a
 * fresh database — where the parent migration already inserted the row — is a
 * no-op.
 */
function convenioValueFor(plan: PlanCapabilityMap): Record<string, unknown> {
  return { included: plan.includedFlags['promotions.convenio'] ?? false };
}

export class SeedConvenioCapability1810500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const plan of PLAN_CAPABILITY_MATRIX) {
      await queryRunner.query(
        `INSERT INTO plan_capability (plan_code, capability_key, value_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (plan_code, capability_key) DO NOTHING`,
        [
          plan.planCode,
          'promotions.convenio',
          JSON.stringify(convenioValueFor(plan)),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM plan_capability WHERE capability_key = $1`,
      ['promotions.convenio'],
    );
  }
}
