import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * R3 (odd/tasks/nucleo-inventario-remediacion-pre-integracion.md, S6) — the
 * batch trace that makes a sale-cancellation reversible.
 *
 * Why this table exists: `drawBatchOutflow` decrements `batches.remaining_stock`
 * in FEFO order, but the CLOUD never knew which physical lot the POS consumed,
 * so a `SALE_CANCEL` (an inflow) had no lot to restore and the aggregate stock
 * and the batch balances diverged on every cancellation (measured: stock 6 vs
 * batches 4). A positive movement cannot invent a lot because
 * `batches.expiration_date` is NOT NULL.
 *
 * The trace records, per Kardex movement, exactly which batch left and by how
 * much. A cancellation reads the trace of the SALE movement it compensates
 * (already linked by `compensation_for_kardex_id`) and returns those exact
 * quantities to those exact batches, so
 * `insumos.stock == SUM(batches.remaining_stock)` survives a cancellation.
 *
 * Append-only, like the ledgers: SI only (select + insert), no update and no
 * delete path. Classified `direct:SI` in scripts/schema-rls-coverage-manifest.txt;
 * the entry MUST exist or scripts/verify-schema-build.sh fails.
 */
export class CreateBatchOutflowTraces1810010000000 implements MigrationInterface {
  name = 'CreateBatchOutflowTraces1810010000000';

  private static readonly TABLE = 'batch_outflow_traces';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = CreateBatchOutflowTraces1810010000000.TABLE;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        movement_id bigint NOT NULL,
        batch_id uuid NOT NULL,
        quantity numeric(14,4) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_batch_outflow_traces_quantity_positive
          CHECK (quantity > 0),
        CONSTRAINT uq_batch_outflow_traces_movement_batch
          UNIQUE (movement_id, batch_id),
        CONSTRAINT uq_batch_outflow_traces_tenant_id
          UNIQUE (tenant_id, id),
        CONSTRAINT fk_batch_outflow_traces_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id),
        CONSTRAINT fk_batch_outflow_traces_movement
          FOREIGN KEY (movement_id) REFERENCES inventory_kardex (id),
        CONSTRAINT fk_batch_outflow_traces_batch
          FOREIGN KEY (batch_id) REFERENCES batches (id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_batch_outflow_traces_tenant_movement
         ON ${table} (tenant_id, movement_id)`,
    );

    // RLS: own tenant_id -> `direct` with S+I only (append-only trace).
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    const tenantPredicate = await resolveTenantRlsPredicate(queryRunner, table);

    const policies = [
      ['select', `FOR SELECT USING (${tenantPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${tenantPredicate})`],
    ] as const;

    for (const [operation, clause] of policies) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_${operation}'
          ) THEN
            CREATE POLICY ${table}_tenant_${operation} ON ${table}
            ${clause};
          END IF;
        END;
        $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = CreateBatchOutflowTraces1810010000000.TABLE;

    // Append-only evidence: a populated trace is refused rather than dropped
    // silently. FORCE RLS hides the rows from this count, so RLS is lifted
    // locally to inspect the true row count and restored before refusing.
    await queryRunner.query(`
      ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${table} LIMIT 1) THEN
          ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove batch_outflow_traces: trace rows exist';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
