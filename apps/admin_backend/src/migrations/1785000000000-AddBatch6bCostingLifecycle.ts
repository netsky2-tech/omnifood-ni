import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatch6bCostingLifecycle1785000000000
  implements MigrationInterface
{
  name = 'AddBatch6bCostingLifecycle1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add costing lifecycle columns to inventory_kardex
    await queryRunner.query(`
      ALTER TABLE inventory_kardex
        ADD COLUMN IF NOT EXISTS estado_costeo integer NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS intentos_count integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bloqueo_motivo varchar,
        ADD COLUMN IF NOT EXISTS autorizado_por_usuario_id varchar,
        ADD COLUMN IF NOT EXISTS fecha_autorizacion timestamptz;
    `);

    // Backfill estado_costeo = 10 (PROVISIONAL) for existing negative-stock movements
    await queryRunner.query(`
      UPDATE inventory_kardex
      SET estado_costeo = 10
      WHERE stock_after < 0 AND estado_costeo = 30;
    `);

    // 2. Create kardex_recalculate_queue table with RLS
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kardex_recalculate_queue (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        origin_movement_id bigint NOT NULL,
        trigger_movement_id bigint NOT NULL,
        status varchar NOT NULL DEFAULT 'PENDING',
        attempts integer NOT NULL DEFAULT 0,
        claimed_at timestamptz,
        claimed_by varchar,
        last_error varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kardex_queue_tenant_status
        ON kardex_recalculate_queue (tenant_id, status, created_at ASC);
      
      CREATE UNIQUE INDEX IF NOT EXISTS uq_kardex_queue_origin_trigger
        ON kardex_recalculate_queue (tenant_id, origin_movement_id, trigger_movement_id);
    `);

    await queryRunner.query(`
      ALTER TABLE kardex_recalculate_queue ENABLE ROW LEVEL SECURITY;
      ALTER TABLE kardex_recalculate_queue FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS kardex_queue_tenant_isolation ON kardex_recalculate_queue;
      CREATE POLICY kardex_queue_tenant_isolation ON kardex_recalculate_queue
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);

    // 3. Create kardex_correction table with RLS and append-only trigger
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kardex_correction (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        origin_movement_id bigint NOT NULL,
        trigger_movement_id bigint NOT NULL,
        previous_unit_cost_nio NUMERIC(14,4) NOT NULL,
        recalculated_unit_cost_nio NUMERIC(14,4) NOT NULL,
        delta_unit_cost_nio NUMERIC(14,4) NOT NULL,
        total_delta_cost_nio NUMERIC(14,4) NOT NULL,
        affected_quantity NUMERIC(14,4) NOT NULL,
        lineage_hash varchar NOT NULL,
        authorized_by_user_id varchar,
        authorized_by_role varchar,
        authorization_method varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kardex_correction_tenant_insumo
        ON kardex_correction (tenant_id, insumo_id, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_kardex_correction_lineage
        ON kardex_correction (tenant_id, lineage_hash);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_kardex_correction_mutation()
      RETURNS trigger
      AS $$
      BEGIN
        RAISE EXCEPTION 'kardex_correction is append-only: UPDATE and DELETE are forbidden';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_kardex_correction_immutable ON kardex_correction;
      CREATE TRIGGER trg_kardex_correction_immutable
      BEFORE UPDATE OR DELETE ON kardex_correction
      FOR EACH ROW
      EXECUTE FUNCTION reject_kardex_correction_mutation();
    `);

    await queryRunner.query(`
      ALTER TABLE kardex_correction ENABLE ROW LEVEL SECURITY;
      ALTER TABLE kardex_correction FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS kardex_correction_tenant_isolation ON kardex_correction;
      CREATE POLICY kardex_correction_tenant_isolation ON kardex_correction
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS kardex_correction_tenant_isolation ON kardex_correction;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_kardex_correction_immutable ON kardex_correction;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS reject_kardex_correction_mutation();`);
    await queryRunner.query(`DROP TABLE IF EXISTS kardex_correction;`);

    await queryRunner.query(`DROP POLICY IF EXISTS kardex_queue_tenant_isolation ON kardex_recalculate_queue;`);
    await queryRunner.query(`DROP TABLE IF EXISTS kardex_recalculate_queue;`);

    await queryRunner.query(`
      ALTER TABLE inventory_kardex
        DROP COLUMN IF EXISTS fecha_autorizacion,
        DROP COLUMN IF EXISTS autorizado_por_usuario_id,
        DROP COLUMN IF EXISTS bloqueo_motivo,
        DROP COLUMN IF EXISTS intentos_count,
        DROP COLUMN IF EXISTS estado_costeo;
    `);
  }
}
