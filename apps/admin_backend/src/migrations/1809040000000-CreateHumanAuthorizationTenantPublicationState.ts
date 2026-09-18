import { MigrationInterface, QueryRunner } from 'typeorm';

// Design §11.2 decision 16 (user decision): a staff/profile mutation marks the tenant dirty in its
// own transaction, and a serialized publisher holding an advisory lock on the tenant sequence builds
// and inserts the immutable epoch. The dirty marker needs durable storage: one mutable marker row per
// tenant, keyed by tenant_id, CAS-guarded by a monotonic revision. This slice provisions only the
// marker table; the publisher and projection live in slice 2b-2c. No FK and no entity registration
// belong to this migration.
const TENANT_GUARD = 'guard_human_auth_tenant_publication_state_mutation';
const TRIGGER = 'trg_human_auth_tenant_publication_state_guard';

export class CreateHumanAuthorizationTenantPublicationState1809040000000 implements MigrationInterface {
  name = 'CreateHumanAuthorizationTenantPublicationState1809040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS human_auth_tenant_publication_state (
        tenant_id varchar(128) PRIMARY KEY,
        dirty boolean NOT NULL DEFAULT true,
        revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
        marked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      COMMENT ON TABLE human_auth_tenant_publication_state IS
        'One mutable publication marker per tenant. dirty=true means a staff/profile mutation awaits
        epoch publication; the serialized publisher clears it and stamps published_at. revision is
        monotonic for compare-and-set: a concurrent marker/publisher pair retries on revision
        conflict. Starts dirty by default so a lost first signal is never silently dropped.';
    `);

    await this.enableTenantRls(queryRunner);

    // Mutable-marker enforcement, not append-only: the publisher MUST clear dirty and advance
    // revision, so updates stay legal. The guard only forbids tenant re-identification (rebinding a
    // marker to another tenant) and revision regression (which would break CAS monotonicity).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ${TENANT_GUARD}() RETURNS trigger AS $$
      BEGIN
        IF NEW.tenant_id <> OLD.tenant_id THEN
          RAISE EXCEPTION 'tenant re-identification is forbidden on %', TG_TABLE_NAME;
        END IF;
        IF NEW.revision < OLD.revision THEN
          RAISE EXCEPTION 'revision regression is forbidden on % (old %, new %)',
            TG_TABLE_NAME, OLD.revision, NEW.revision;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS ${TRIGGER} ON human_auth_tenant_publication_state;
      CREATE TRIGGER ${TRIGGER}
        BEFORE UPDATE ON human_auth_tenant_publication_state
        FOR EACH ROW
        EXECUTE FUNCTION ${TENANT_GUARD}();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Marker retention is normative (design §11/§12): rollback must not erase publication state or
    // the evidence of pending publication. This removes only the enforcement objects this migration
    // added: its trigger first, then its own guard function. The table and every row stay in place,
    // dropping them is an explicit operator action outside the migration path, and up() is
    // idempotent, so re-applying after a revert is safe.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS ${TRIGGER} ON human_auth_tenant_publication_state;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS ${TENANT_GUARD}();
    `);
  }

  private async enableTenantRls(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'human_auth_tenant_publication_state';
    const tenantPredicate =
      "tenant_id = current_setting('app.tenant_id', true)";

    await queryRunner.query(`
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS ${tableName}_tenant_select ON ${tableName};
      CREATE POLICY ${tableName}_tenant_select ON ${tableName}
        FOR SELECT USING (${tenantPredicate});

      DROP POLICY IF EXISTS ${tableName}_tenant_insert ON ${tableName};
      CREATE POLICY ${tableName}_tenant_insert ON ${tableName}
        FOR INSERT WITH CHECK (${tenantPredicate});

      DROP POLICY IF EXISTS ${tableName}_tenant_update ON ${tableName};
      CREATE POLICY ${tableName}_tenant_update ON ${tableName}
        FOR UPDATE USING (${tenantPredicate})
        WITH CHECK (${tenantPredicate});
    `);
  }
}
