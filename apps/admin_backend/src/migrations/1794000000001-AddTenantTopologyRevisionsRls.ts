import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantTopologyRevisionsRls1794000000001 implements MigrationInterface {
  name = 'AddTenantTopologyRevisionsRls1794000000001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE tenant_topology_revisions ENABLE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_topology_revisions FORCE ROW LEVEL SECURITY',
    );
    // PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so guard on the catalog.
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_topology_revisions'
            AND policyname = 'tenant_topology_revisions_tenant_select'
        ) THEN
          CREATE POLICY tenant_topology_revisions_tenant_select ON tenant_topology_revisions FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
    await runner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_topology_revisions'
            AND policyname = 'tenant_topology_revisions_tenant_insert'
        ) THEN
          CREATE POLICY tenant_topology_revisions_tenant_insert ON tenant_topology_revisions FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
        END IF;
      END $$;`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert ON tenant_topology_revisions',
    );
    await runner.query(
      'DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select ON tenant_topology_revisions',
    );
    await runner.query(
      'ALTER TABLE tenant_topology_revisions NO FORCE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_topology_revisions DISABLE ROW LEVEL SECURITY',
    );
  }
}
