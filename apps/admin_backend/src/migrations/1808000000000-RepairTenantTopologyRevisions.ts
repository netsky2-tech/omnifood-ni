import { MigrationInterface, QueryRunner } from 'typeorm';

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

      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select ON tenant_topology_revisions;
      CREATE POLICY tenant_topology_revisions_tenant_select ON tenant_topology_revisions
        FOR SELECT
        USING (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert ON tenant_topology_revisions;
      CREATE POLICY tenant_topology_revisions_tenant_insert ON tenant_topology_revisions
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
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
