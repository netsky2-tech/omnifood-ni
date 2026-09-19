import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

export class RepairTenantTopologyRevisions1808000000000 implements MigrationInterface {
  name = 'RepairTenantTopologyRevisions1808000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_topology_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        contract_version integer NOT NULL,
        revision integer NOT NULL,
        topology jsonb NOT NULL,
        hash varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_topology_revisions_revision UNIQUE (tenant_id, revision)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_topology_revisions_revision
        ON tenant_topology_revisions (tenant_id, revision);

      CREATE OR REPLACE FUNCTION reject_tenant_topology_revision_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'tenant_topology_revisions is immutable';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS tenant_topology_revisions_immutable ON tenant_topology_revisions;
      CREATE TRIGGER tenant_topology_revisions_immutable
        BEFORE UPDATE OR DELETE ON tenant_topology_revisions
        FOR EACH ROW
        EXECUTE FUNCTION reject_tenant_topology_revision_mutation();

      ALTER TABLE tenant_topology_revisions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_topology_revisions FORCE ROW LEVEL SECURITY;
    `);

    // The predicate form must match the tenant_id column's CURRENT type: a
    // partial-ledger re-run happens after later slices converted the column
    // to uuid, and a hardcoded bare compare would fail with
    // "operator does not exist: uuid = text". The shared resolver reads the
    // catalog once and returns the valid, index-friendly form.
    const tenantPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      'tenant_topology_revisions',
    );

    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select ON tenant_topology_revisions;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_topology_revisions'
            AND policyname = 'tenant_topology_revisions_tenant_select'
        ) THEN
          CREATE POLICY tenant_topology_revisions_tenant_select ON tenant_topology_revisions
            FOR SELECT
            USING (${tenantPredicate});
        END IF;
      END;
      $$;

      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert ON tenant_topology_revisions;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'tenant_topology_revisions'
            AND policyname = 'tenant_topology_revisions_tenant_insert'
        ) THEN
          CREATE POLICY tenant_topology_revisions_tenant_insert ON tenant_topology_revisions
            FOR INSERT
            WITH CHECK (${tenantPredicate});
        END IF;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'tenant_topology_revisions'
        ) THEN
          IF EXISTS (SELECT 1 FROM tenant_topology_revisions LIMIT 1) THEN
            RAISE EXCEPTION 'down migration forbidden: tenant topology revisions exist';
          END IF;
        END IF;
      END $$;

      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert ON tenant_topology_revisions;
      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select ON tenant_topology_revisions;
      DROP TRIGGER IF EXISTS tenant_topology_revisions_immutable ON tenant_topology_revisions;
      DROP FUNCTION IF EXISTS reject_tenant_topology_revision_mutation();
      DROP TABLE IF EXISTS tenant_topology_revisions CASCADE;
    `);
  }
}
