import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeterministicSyncSequencing1780000000000 implements MigrationInterface {
  name = 'AddDeterministicSyncSequencing1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS flow_type varchar NOT NULL DEFAULT 'inventory'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS result_status varchar NOT NULL DEFAULT 'ACCEPTED'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_receipts
      ADD COLUMN IF NOT EXISTS result_code varchar
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS flow_type varchar NOT NULL DEFAULT 'inventory'
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS payload_hash varchar NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_sync_outbox
      ADD COLUMN IF NOT EXISTS result_code varchar
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_sync_receipts_identity
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_receipts_stream_sequence
      ON inventory_sync_receipts (tenant_id, source_device_id, flow_type, source_sequence)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_receipts_idempotency_key
      ON inventory_sync_receipts (tenant_id, idempotency_key, flow_type)
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_inventory_sync_outbox_source_seq
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_sync_outbox_stream_sequence
      ON inventory_sync_outbox (tenant_id, source_device_id, flow_type, source_sequence)
    `);

    await this.enableTenantRls(queryRunner, 'inventory_sync_receipts', {
      allowUpdate: false,
    });
    await this.enableTenantRls(queryRunner, 'inventory_sync_outbox', {
      allowUpdate: true,
    });
    await this.enableTenantRls(queryRunner, 'inventory_kardex', {
      allowUpdate: false,
    });
    await this.preventAppendOnlyMutations(
      queryRunner,
      'inventory_sync_receipts',
    );
    await this.preventAppendOnlyMutations(queryRunner, 'inventory_kardex');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve append-only sync metadata during rollback.
    await queryRunner.query('SELECT 1');
  }

  private async enableTenantRls(
    queryRunner: QueryRunner,
    tableName: string,
    options: { allowUpdate: boolean },
  ): Promise<void> {
    const tenantPredicate =
      "tenant_id = current_setting('app.tenant_id', true)";

    await queryRunner.query(`
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS sync_ledger_${tableName}_tenant_select ON ${tableName}
    `);
    await queryRunner.query(`
      CREATE POLICY sync_ledger_${tableName}_tenant_select
      ON ${tableName}
      FOR SELECT
      USING (${tenantPredicate})
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS sync_ledger_${tableName}_tenant_insert ON ${tableName}
    `);
    await queryRunner.query(`
      CREATE POLICY sync_ledger_${tableName}_tenant_insert
      ON ${tableName}
      FOR INSERT
      WITH CHECK (${tenantPredicate})
    `);

    if (!options.allowUpdate) {
      await queryRunner.query(`
        DROP POLICY IF EXISTS sync_ledger_${tableName}_append_only_update ON ${tableName}
      `);
      await queryRunner.query(`
        CREATE POLICY sync_ledger_${tableName}_append_only_update
        ON ${tableName}
        FOR UPDATE
        USING (${tenantPredicate})
        WITH CHECK (${tenantPredicate})
      `);
      await queryRunner.query(`
        DROP POLICY IF EXISTS sync_ledger_${tableName}_append_only_delete ON ${tableName}
      `);
      await queryRunner.query(`
        CREATE POLICY sync_ledger_${tableName}_append_only_delete
        ON ${tableName}
        FOR DELETE
        USING (${tenantPredicate})
      `);
      return;
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS sync_ledger_${tableName}_tenant_update ON ${tableName}
    `);
    await queryRunner.query(`
      CREATE POLICY sync_ledger_${tableName}_tenant_update
      ON ${tableName}
      FOR UPDATE
      USING (${tenantPredicate})
      WITH CHECK (${tenantPredicate})
    `);
  }

  private async preventAppendOnlyMutations(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_append_only_replay_table_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only and cannot be updated or deleted', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS ${tableName}_append_only_guard ON ${tableName}
    `);
    await queryRunner.query(`
      CREATE TRIGGER ${tableName}_append_only_guard
      BEFORE UPDATE OR DELETE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION prevent_append_only_replay_table_mutation()
    `);
  }
}
