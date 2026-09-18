import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantFulfillmentRecords1795000000000 implements MigrationInterface {
  name = 'CreateTenantFulfillmentRecords1795000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE IF NOT EXISTS tenant_fulfillment_records (
        id varchar(128) PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        sale_id varchar(128),
        topology_snapshot_id varchar(128),
        topology_revision integer,
        channel varchar(64) NOT NULL,
        route_state varchar(64) NOT NULL,
        delivery_state varchar(64) NOT NULL DEFAULT 'PENDING',
        lines_payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        synced_at timestamptz DEFAULT now()
      )`,
    );

    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_fulfillment_tenant_sale ON tenant_fulfillment_records (tenant_id, sale_id)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_tenant_fulfillment_tenant_created ON tenant_fulfillment_records (tenant_id, created_at)`,
    );

    await runner.query(
      'ALTER TABLE tenant_fulfillment_records ENABLE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_fulfillment_records FORCE ROW LEVEL SECURITY',
    );

    // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_fulfillment_records'
            AND policyname = 'tenant_fulfillment_records_tenant_select'
        ) THEN
          CREATE POLICY tenant_fulfillment_records_tenant_select ON tenant_fulfillment_records FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_fulfillment_records'
            AND policyname = 'tenant_fulfillment_records_tenant_insert'
        ) THEN
          CREATE POLICY tenant_fulfillment_records_tenant_insert ON tenant_fulfillment_records FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_fulfillment_records'
            AND policyname = 'tenant_fulfillment_records_tenant_update'
        ) THEN
          CREATE POLICY tenant_fulfillment_records_tenant_update ON tenant_fulfillment_records FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_fulfillment_records'
            AND policyname = 'tenant_fulfillment_records_tenant_delete'
        ) THEN
          CREATE POLICY tenant_fulfillment_records_tenant_delete ON tenant_fulfillment_records FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'DROP POLICY IF EXISTS tenant_fulfillment_records_tenant_delete ON tenant_fulfillment_records',
    );
    await runner.query(
      'DROP POLICY IF EXISTS tenant_fulfillment_records_tenant_update ON tenant_fulfillment_records',
    );
    await runner.query(
      'DROP POLICY IF EXISTS tenant_fulfillment_records_tenant_insert ON tenant_fulfillment_records',
    );
    await runner.query(
      'DROP POLICY IF EXISTS tenant_fulfillment_records_tenant_select ON tenant_fulfillment_records',
    );
    await runner.query(
      'ALTER TABLE tenant_fulfillment_records NO FORCE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_fulfillment_records DISABLE ROW LEVEL SECURITY',
    );
    await runner.query('DROP TABLE IF EXISTS tenant_fulfillment_records');
  }
}
