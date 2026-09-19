import { QueryResult, type QueryRunner } from 'typeorm';
import { CreateDeviceSyncCredentials1807000000000 } from './1807000000000-CreateDeviceSyncCredentials';

describe('CreateDeviceSyncCredentials1807000000000', () => {
  const migration = new CreateDeviceSyncCredentials1807000000000();

  // The migration resolves the tenant predicate through the shared
  // type-aware resolver, which reads each table's tenant_id column type
  // from information_schema. The stub answers per table (the resolver binds
  // the table name as $1) with the declared data_type; a raw rows array
  // mirrors what PostgresQueryRunner.query returns at runtime.
  const createQueryRunner = (
    tenantIdDataTypes: Record<string, string> = {},
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(
        (sql: string, parameters?: unknown[]): Promise<QueryResult> => {
          queries.push(sql);
          if (sql.includes('information_schema.columns')) {
            const table =
              typeof parameters?.[0] === 'string' ? parameters[0] : '';
            return Promise.resolve([
              { data_type: tenantIdDataTypes[table] ?? 'character varying' },
            ]) as unknown as Promise<QueryResult>;
          }
          return Promise.resolve(new QueryResult());
        },
      ),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataTypes?: Record<string, string>,
  ): Promise<string> => {
    const { queryRunner, queries } = createQueryRunner(tenantIdDataTypes);
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  it('creates device_sync_credentials table with expected columns, linkage, and indexes', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS device_sync_credentials',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'activation_attempt_id uuid NOT NULL',
      'renewal_secret_hash varchar(255) NOT NULL',
      'scopes jsonb NOT NULL',
      'version integer NOT NULL DEFAULT 1',
      "status varchar(64) NOT NULL DEFAULT 'PENDING'",
      'expires_at timestamptz NOT NULL',
      'issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'rotated_at timestamptz NULL',
      'revoked_at timestamptz NULL',
      'revocation_reason varchar(255) NULL',
      'created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'CONSTRAINT fk_device_sync_credentials_activation_attempt',
      'REFERENCES onboarding_activation_attempts(id)',
      'uq_device_sync_credentials_attempt_version',
      'idx_device_sync_credentials_tenant',
      'idx_device_sync_credentials_attempt',
      'idx_device_sync_credentials_status',
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).not.toContain("DEFAULT 'ACTIVE'");
  });

  it('enables and forces RLS on device_sync_credentials with tenant policies', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'ALTER TABLE device_sync_credentials ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE device_sync_credentials FORCE ROW LEVEL SECURITY',
      'CREATE POLICY device_sync_credentials_tenant_select ON device_sync_credentials',
      'CREATE POLICY device_sync_credentials_tenant_insert ON device_sync_credentials',
      'CREATE POLICY device_sync_credentials_tenant_update ON device_sync_credentials',
      'CREATE POLICY device_sync_credentials_tenant_delete ON device_sync_credentials',
      "current_setting('app.tenant_id', true)",
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('creates device_sync_credential_events append-only table with immutability triggers and RLS', async () => {
    const sql = await collectSql('up');

    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS device_sync_credential_events',
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'tenant_id varchar(128) NOT NULL',
      'credential_id uuid NOT NULL',
      'event_type varchar(64) NOT NULL',
      'metadata jsonb NOT NULL',
      'occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'CONSTRAINT fk_device_sync_credential_events_credential',
      'REFERENCES device_sync_credentials(id)',
      'ALTER TABLE device_sync_credential_events ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE device_sync_credential_events FORCE ROW LEVEL SECURITY',
      'CREATE POLICY device_sync_cred_events_tenant_select ON device_sync_credential_events',
      'CREATE POLICY device_sync_cred_events_tenant_insert ON device_sync_credential_events',
      'guard_device_sync_credential_events_immutability',
      'BEFORE UPDATE OR DELETE ON device_sync_credential_events',
      'device_sync_credential_events is append-only',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('down migration drops tables cleanly and safely', async () => {
    const sql = await collectSql('down');

    for (const fragment of [
      'DROP TABLE IF EXISTS device_sync_credential_events CASCADE',
      'DROP TABLE IF EXISTS device_sync_credentials CASCADE',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('emits the setting-cast predicate on both tables when tenant_id is already uuid (partial-ledger re-run)', async () => {
    // A partial-ledger re-run happens after later slices converted the
    // columns to uuid; the recreated policies must use the setting-cast form
    // instead of the hardcoded bare compare.
    const sql = await collectSql('up', {
      device_sync_credentials: 'uuid',
      device_sync_credential_events: 'uuid',
    });

    expect(sql).toContain(
      "tenant_id = current_setting('app.tenant_id', true)::uuid",
    );
    expect(sql).not.toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );
  });

  it('resolves the predicate per table, never one shared answer across tables', async () => {
    // The two tables resolve independently: a shared resolution would give
    // one table the other's answer when the column types differ mid-slice.
    const { queryRunner, queries } = createQueryRunner({
      device_sync_credentials: 'uuid',
      device_sync_credential_events: 'character varying',
    });

    await migration.up(queryRunner);

    const credentialsSelect = queries.find((q) =>
      q.includes('device_sync_credentials_tenant_select'),
    );
    const eventsSelect = queries.find((q) =>
      q.includes('device_sync_cred_events_tenant_select'),
    );

    expect(credentialsSelect).toBeDefined();
    expect(eventsSelect).toBeDefined();
    expect(credentialsSelect).toContain(
      "tenant_id = current_setting('app.tenant_id', true)::uuid",
    );
    expect(eventsSelect).not.toContain('::uuid');
    expect(eventsSelect).toContain(
      "tenant_id::text = current_setting('app.tenant_id', true)",
    );
  });
});
