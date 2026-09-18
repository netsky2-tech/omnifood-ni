import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class CreateProductionBatchHistory1781000000000 implements MigrationInterface {
  name = 'CreateProductionBatchHistory1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_batch_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        production_document_id varchar NOT NULL,
        recipe_version_id varchar NOT NULL,
        produced_insumo_id varchar NOT NULL,
        produced_batch_number varchar NOT NULL,
        produced_expiration_date date NOT NULL,
        planned_quantity numeric(14,4) NOT NULL,
        actual_quantity numeric(14,4) NOT NULL,
        outcome varchar NOT NULL,
        failure_reason varchar,
        terminal_id varchar NOT NULL,
        source_sequence bigint NOT NULL,
        idempotency_key varchar NOT NULL,
        payload_hash varchar NOT NULL,
        total_consumed_cost_nio numeric(14,4) NOT NULL,
        produced_unit_cost_nio numeric(14,4) NOT NULL,
        movement_references text[] NOT NULL DEFAULT '{}',
        operation_date timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_batch_history_document
      ON production_batch_history (tenant_id, production_document_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_batch_history_source_sequence
      ON production_batch_history (tenant_id, terminal_id, source_sequence)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_batch_history_tenant_operation
      ON production_batch_history (tenant_id, operation_date)
    `);

    await queryRunner.query(`
      ALTER TABLE production_batch_history ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE production_batch_history FORCE ROW LEVEL SECURITY
    `);

    // The predicate form must match the tenant_id column's CURRENT type: a
    // partial-ledger re-run happens after later slices converted the column
    // to uuid, and a hardcoded bare compare would fail with
    // "operator does not exist: uuid = text". The shared resolver reads the
    // catalog once and returns the valid, index-friendly form.
    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'production_batch_history',
    );

    // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_isolation'
        ) THEN
          CREATE POLICY production_batch_history_tenant_isolation ON production_batch_history
          FOR SELECT
          USING (${tenantPredicate});
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_insert'
        ) THEN
          CREATE POLICY production_batch_history_tenant_insert ON production_batch_history
          FOR INSERT
          WITH CHECK (${tenantPredicate});
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_update'
        ) THEN
          CREATE POLICY production_batch_history_tenant_update ON production_batch_history
          FOR UPDATE
          USING (${tenantPredicate})
          WITH CHECK (${tenantPredicate});
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_delete'
        ) THEN
          CREATE POLICY production_batch_history_tenant_delete ON production_batch_history
          FOR DELETE
          USING (${tenantPredicate});
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_production_batch_history_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'production_batch_history is immutable: UPDATE/DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_production_batch_history_immutable ON production_batch_history
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_production_batch_history_immutable
      BEFORE UPDATE OR DELETE ON production_batch_history
      FOR EACH ROW
      EXECUTE FUNCTION reject_production_batch_history_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve immutable production audit history and its protections during rollback.
    await queryRunner.query(`
      ALTER TABLE production_batch_history ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      ALTER TABLE production_batch_history FORCE ROW LEVEL SECURITY
    `);

    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'production_batch_history',
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_isolation'
        ) THEN
          CREATE POLICY production_batch_history_tenant_isolation ON production_batch_history
          FOR SELECT
          USING (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_insert'
        ) THEN
          CREATE POLICY production_batch_history_tenant_insert ON production_batch_history
          FOR INSERT
          WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_update'
        ) THEN
          CREATE POLICY production_batch_history_tenant_update ON production_batch_history
          FOR UPDATE
          USING (${tenantPredicate})
          WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'production_batch_history'
            AND policyname = 'production_batch_history_tenant_delete'
        ) THEN
          CREATE POLICY production_batch_history_tenant_delete ON production_batch_history
          FOR DELETE
          USING (${tenantPredicate});
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_production_batch_history_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'production_batch_history is immutable: UPDATE/DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_production_batch_history_immutable'
        ) THEN
          CREATE TRIGGER trg_production_batch_history_immutable
          BEFORE UPDATE OR DELETE ON production_batch_history
          FOR EACH ROW
          EXECUTE FUNCTION reject_production_batch_history_mutation();
        END IF;
      END;
      $$
    `);
  }
}
