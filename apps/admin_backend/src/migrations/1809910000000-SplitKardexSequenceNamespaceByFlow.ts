import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Raw row of the shared-sequence conflict probe in down(). */
interface KardexSequenceConflictRow {
  tenant_id: string;
  source_device_id: string;
  source_sequence: string;
}

/**
 * H-R13 (odd/tasks/nucleo-inventario-paridad-contrato.md): the kardex was the
 * only place where a device's sync sequence lived in ONE namespace.
 *
 * `inventory_sync_receipts` keys its stream by
 * `(tenant_id, source_device_id, flow_type, source_sequence)` — each flow keeps
 * its own contiguous counter, and the POS has one counter per flow — while this
 * index keyed on `(tenant_id, source_device_id, source_sequence)` alone. The
 * two contracts therefore contradicted each other: the inventory flow had to
 * start at 1, and a device that had already sent a SALE had already claimed 1
 * in the kardex. The delta path was unreachable for any device that had sold
 * anything, which is why a POS shrinkage never reached the cloud.
 *
 * This brings the kardex key in line with the receipts. It is an EXPRESSION
 * index rather than a new `flow_type` column on purpose:
 *
 *  - `inventory_kardex` is append-only by trigger, so backfilling a new column
 *    would mean either disabling an integrity guard inside a migration or
 *    leaving historical rows NULL — and NULLs compare distinct in a unique
 *    index, which would weaken the guarantee on exactly the rows already
 *    written.
 *  - The codebase already namespaces this column by VALUE where it needs to:
 *    production movements write negative sequences precisely so they cannot
 *    collide with ordinary POS sequences (production.service.ts:36-46).
 *
 * The derivation is stated here, in the schema, rather than left implicit in
 * application branching: the SALES flow writes SALE / SALE_CANCEL /
 * CREDIT_NOTE documents, and every other sequenced movement comes from the
 * inventory flow. Those are the only two flows that write a positive sequence
 * into this table.
 *
 * Widening a unique key never invalidates an existing row, so this migration is
 * additive: it touches no data.
 */
export class SplitKardexSequenceNamespaceByFlow1809910000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_kardex_source_sequence',
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inventory_kardex_source_sequence
      ON inventory_kardex (
        tenant_id,
        source_device_id,
        (CASE
          WHEN source_document_type IN ('SALE', 'SALE_CANCEL', 'CREDIT_NOTE')
            THEN 'sales'
          ELSE 'inventory'
        END),
        source_sequence
      )
      WHERE source_device_id IS NOT NULL AND source_sequence IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The wide key lets two flows share one device sequence, and such a row
    // cannot be reconciled from here: the ledger is append-only by trigger
    // (1773000000000), and moving a row out would desynchronise `insumos.stock`
    // from the ledger that 1774000000000 validates on every later insert. The
    // narrow key can only come back while the data still satisfies it, so it is
    // checked FIRST: a rollback of compatible data is unchanged, and a rollback
    // of data that used the wide key names the rows that block it instead of
    // failing with an opaque duplicate-key error. Reconcile explicitly with:
    //
    //   SELECT tenant_id, source_device_id, source_sequence, count(*)
    //   FROM inventory_kardex
    //   WHERE source_device_id IS NOT NULL AND source_sequence IS NOT NULL
    //   GROUP BY 1, 2, 3 HAVING count(*) > 1;
    const conflicts = (await queryRunner.query(`
      SELECT tenant_id, source_device_id, source_sequence
      FROM inventory_kardex
      WHERE source_device_id IS NOT NULL AND source_sequence IS NOT NULL
      GROUP BY 1, 2, 3
      HAVING COUNT(*) > 1
      LIMIT 20
    `)) as KardexSequenceConflictRow[];

    if (conflicts.length > 0) {
      const first = conflicts[0];
      throw new Error(
        `Cannot restore the pre-flow kardex sequence key: ${conflicts.length} device sequence(s) are shared by more than one flow ` +
          `(first: tenant ${first.tenant_id}, device ${first.source_device_id}, sequence ${first.source_sequence}). ` +
          'The kardex is append-only, so reconcile explicitly before rolling back.',
      );
    }

    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_inventory_kardex_source_sequence',
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inventory_kardex_source_sequence
      ON inventory_kardex (tenant_id, source_device_id, source_sequence)
      WHERE source_device_id IS NOT NULL AND source_sequence IS NOT NULL
    `);
  }
}
