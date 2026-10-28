import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R20 — the shrinkage's observation finally has a home.
 *
 * `observation` is what the person recording a shrinkage actually wrote: why
 * the goods were lost or damaged. The service already REQUIRES it
 * (`requireMermaObservation`) before it will record anything — and then threw
 * it away, because no column anywhere could hold it. `Shrinkage` had `reason`
 * but no `observation`, and the kardex row's `observation:` key was dropped in
 * silence by the entity mapper.
 *
 * NOT NULL on purpose, and the reason it is safe is the defect itself: NOTHING
 * writes this table. `shrinkages` exists with its full schema and ZERO rows in
 * every environment, because the shrinkage path mints a document id, stores it
 * on the kardex row as `source_document_id`, and never creates the document.
 * So there are no legacy rows to accommodate, and the schema can now demand
 * exactly what the service already demands.
 *
 * This is the schema half of the fix. The service that PERSISTS the document —
 * with its type, its reason and this observation — arrives with it.
 */
export class AddObservationToShrinkages1809950000000 implements MigrationInterface {
  name = 'AddObservationToShrinkages1809950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shrinkages
        ADD COLUMN IF NOT EXISTS observation varchar NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Guarded like the other evidence columns: a populated table means somebody
    // finally recorded a shrinkage, and that observation is the fiscal record
    // of why the goods left. Dropping it would erase evidence, so this refuses
    // instead of dropping in silence.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM shrinkages WHERE observation IS NOT NULL LIMIT 1
        ) THEN
          RAISE EXCEPTION 'refusing to drop shrinkages.observation: shrinkage evidence exists';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE shrinkages DROP COLUMN IF EXISTS observation
    `);
  }
}
