import type { QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * A-01 — the count says IN WHICH LOT the stock it found is.
 *
 * Why this column exists: a POSITIVE count variance is stock that APPEARS.
 * Until now it entered the aggregate with no lot behind it, and
 * `batches.expiration_date` is NOT NULL, so no lot could be invented for it
 * (the open case the code documents). The consequence was that the aggregate
 * and the lots drifted apart, and the next sale of that insumo found the two
 * disagreeing — the difference FD-01 now declares.
 *
 * The industry practice is the same one: *cycle counts must include lot
 * checks, not just quantity*. The physical truth enters the lot it was seen
 * in, and the parity is restored by the count — not by a lock in the cloud.
 *
 * The column is NULLABLE and additive: an entry written before this
 * migration (and a count of an insumo without lots) keeps its exact shape,
 * and the absence reads as "the operator did not say which lot".
 *
 * RLS posture: a column addition on an already-protected table; no
 * grant/policy/statement-level change.
 */
export class AddCountSessionEntryLot1810090000000 {
  name = 'AddCountSessionEntryLot1810090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE count_session_entries ' +
        'ADD COLUMN IF NOT EXISTS batch_id uuid, ' +
        'ADD COLUMN IF NOT EXISTS batch_number varchar(64)',
    );

    // The lookup the count applies: "which lot did this observation come
    // from".
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_count_session_entries_batch ' +
        'ON count_session_entries (batch_id) ' +
        'WHERE batch_id IS NOT NULL',
    );

    // The foreign key is added separately and defensively: the table may
    // already carry rows (they stay NULL), and a batch may have been
    // deleted after the count, so the reference is only a soft pointer
    // plus the number that was seen on the shelf (the evidence).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_count_session_entries_batch'
        ) THEN
          ALTER TABLE count_session_entries
            ADD CONSTRAINT fk_count_session_entries_batch
            FOREIGN KEY (batch_id) REFERENCES batches (id)
            ON DELETE SET NULL;
        END IF;
      END;
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_count_session_entries_batch');
    await queryRunner.query(
      'ALTER TABLE count_session_entries ' +
        'DROP CONSTRAINT IF EXISTS fk_count_session_entries_batch',
    );
    await queryRunner.query(
      'ALTER TABLE count_session_entries ' +
        'DROP COLUMN IF EXISTS batch_number, ' +
        'DROP COLUMN IF EXISTS batch_id',
    );
  }
}
