import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * FD-01 (openspec/changes/fiscal-no-se-congela-por-inventario) — the table
 * where a difference between what was sold and what the inventory backed is
 * DECLARED instead of blocking the sale.
 *
 * Why this table exists: the cloud rejected a sale whose outflow the batches
 * could not cover, and that rejection blocked the whole fiscal stream — the
 * terminal's sequence froze and the tenant stopped invoicing. The owner ruled
 * that the invoice is always applied and that what does not add up is
 * recorded, visible and reconcilable.
 *
 * MUTABLE BY DESIGN (unlike the append-only ledgers): a divergence is OPEN
 * until a regularization closes it, and the closure is part of the record
 * (who closed it, when, with which regularization). That is why the RLS
 * posture here is S+I+U and not S+I.
 *
 * RLS: own tenant_id, select + insert + update (the closure), classified
 * `direct:SIU` in scripts/schema-rls-coverage-manifest.txt; the entry MUST
 * exist or scripts/verify-schema-build.sh fails.
 */
export class CreateInventoryDivergences1810080000000 implements MigrationInterface {
  name = 'CreateInventoryDivergences1810080000000';

  private static readonly TABLE = 'inventory_divergences';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = CreateInventoryDivergences1810080000000.TABLE;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        invoice_id uuid NOT NULL,
        invoice_number varchar(64) NOT NULL,
        insumo_id uuid NOT NULL,
        quantity numeric(14,4) NOT NULL,
        unit_cost_nio numeric(14,4) NOT NULL DEFAULT 0,
        amount_nio numeric(14,4) NOT NULL DEFAULT 0,
        cause varchar(48) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'OPEN',
        source_device_id varchar(128),
        source_sequence bigint,
        detail jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        reconciled_at timestamptz,
        reconciliation_ref varchar(128),
        resolution_note text,
        CONSTRAINT chk_inventory_divergences_quantity_positive
          CHECK (quantity > 0),
        CONSTRAINT chk_inventory_divergences_status
          CHECK (status IN ('OPEN', 'RECONCILED')),
        CONSTRAINT chk_inventory_divergences_cause
          CHECK (cause IN ('LOT_COVERAGE_INSUFFICIENT', 'DECLARED_STOCK_INSUFFICIENT')),
        CONSTRAINT uq_inventory_divergences_tenant_invoice_insumo_cause
          UNIQUE (tenant_id, invoice_id, insumo_id, cause),
        CONSTRAINT fk_inventory_divergences_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants (id),
        CONSTRAINT fk_inventory_divergences_invoice
          FOREIGN KEY (invoice_id) REFERENCES invoices (id),
        CONSTRAINT fk_inventory_divergences_insumo
          FOREIGN KEY (insumo_id) REFERENCES insumos (id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_inventory_divergences_tenant_status
         ON ${table} (tenant_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_inventory_divergences_tenant_invoice
         ON ${table} (tenant_id, invoice_id)`,
    );

    // RLS: own tenant_id -> `direct` with S+I+U (the closure is part of the
    // record).
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    const tenantPredicate = await resolveTenantRlsPredicate(queryRunner, table);

    const policies = [
      ['select', `FOR SELECT USING (${tenantPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${tenantPredicate})`],
      ['update', `FOR UPDATE USING (${tenantPredicate})`],
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
    const table = CreateInventoryDivergences1810080000000.TABLE;

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
