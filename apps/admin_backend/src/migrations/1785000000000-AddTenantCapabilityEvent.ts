import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantCapabilityEvent1785000000000 implements MigrationInterface {
  name = 'AddTenantCapabilityEvent1785000000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE tenant_capability_event (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar NOT NULL, actor_user_id varchar NOT NULL, previous_version varchar NOT NULL, new_version varchar NOT NULL, contract_version integer NOT NULL, reason varchar NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_tenant_capability_event_revision UNIQUE (tenant_id, revision))`,
    );
    await runner.query(
      'ALTER TABLE tenant_capability_event ENABLE ROW LEVEL SECURITY',
    );
    await runner.query(
      'ALTER TABLE tenant_capability_event FORCE ROW LEVEL SECURITY',
    );
    await runner.query(
      "CREATE POLICY tenant_capability_event_select ON tenant_capability_event FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true))",
    );
    await runner.query(
      "CREATE POLICY tenant_capability_event_insert ON tenant_capability_event FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true))",
    );
    await runner.query(
      "CREATE POLICY tenant_capability_event_update ON tenant_capability_event FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))",
    );
    await runner.query(
      "CREATE POLICY tenant_capability_event_delete ON tenant_capability_event FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true))",
    );
    await runner.query(
      `CREATE FUNCTION reject_tenant_capability_event_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'tenant_capability_event is append-only'; END; $$ LANGUAGE plpgsql`,
    );
    await runner.query(
      'CREATE TRIGGER tenant_capability_event_immutable BEFORE UPDATE OR DELETE ON tenant_capability_event FOR EACH ROW EXECUTE FUNCTION reject_tenant_capability_event_mutation()',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE IF EXISTS tenant_capability_event');
    await runner.query(
      'DROP FUNCTION IF EXISTS reject_tenant_capability_event_mutation()',
    );
  }
}
