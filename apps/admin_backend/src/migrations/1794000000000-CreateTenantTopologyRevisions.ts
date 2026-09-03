import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantTopologyRevisions1794000000000 implements MigrationInterface {
  name = 'CreateTenantTopologyRevisions1794000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE tenant_topology_revisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar NOT NULL, contract_version integer NOT NULL, revision integer NOT NULL, topology jsonb NOT NULL, hash varchar NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_tenant_topology_revisions_revision UNIQUE (tenant_id, revision))`,
    );
    await runner.query(
      `CREATE FUNCTION reject_tenant_topology_revision_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'tenant_topology_revisions is immutable'; END; $$ LANGUAGE plpgsql`,
    );
    await runner.query(
      'CREATE TRIGGER tenant_topology_revisions_immutable BEFORE UPDATE OR DELETE ON tenant_topology_revisions FOR EACH ROW EXECUTE FUNCTION reject_tenant_topology_revision_mutation()',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE IF EXISTS tenant_topology_revisions');
    await runner.query(
      'DROP FUNCTION IF EXISTS reject_tenant_topology_revision_mutation()',
    );
  }
}
