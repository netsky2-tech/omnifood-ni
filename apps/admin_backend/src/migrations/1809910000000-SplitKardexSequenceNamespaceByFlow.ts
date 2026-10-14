import type { MigrationInterface, QueryRunner } from 'typeorm';

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
export class SplitKardexSequenceNamespaceByFlow1809910000000
  implements MigrationInterface
{
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
