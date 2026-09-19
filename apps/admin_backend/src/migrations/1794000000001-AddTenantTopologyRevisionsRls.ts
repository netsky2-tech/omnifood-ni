import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class AddTenantTopologyRevisionsRls1794000000001 implements MigrationInterface {
  name = 'AddTenantTopologyRevisionsRls1794000000001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE tenant_topology_revisions ENABLE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_topology_revisions FORCE ROW LEVEL SECURITY',
    );
    // The predicate form must match the tenant_id column's CURRENT type: a
    // partial-ledger re-run happens after later slices converted the column
    // to uuid, and a hardcoded bare compare would fail with
    // "operator does not exist: uuid = text". The shared resolver reads the
    // catalog once and returns the valid, index-friendly form.
    const tenantPredicate = await resolveTenantRlsPredicate(
      runner,
      'tenant_topology_revisions',
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
          CREATE POLICY tenant_topology_revisions_tenant_select ON tenant_topology_revisions FOR SELECT USING (${tenantPredicate});
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
          CREATE POLICY tenant_topology_revisions_tenant_insert ON tenant_topology_revisions FOR INSERT WITH CHECK (${tenantPredicate});
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
