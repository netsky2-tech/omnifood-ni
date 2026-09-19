import { QueryResult, type QueryRunner } from 'typeorm';
import { RepairTenantTopologyRevisions1808000000000 } from './1808000000000-RepairTenantTopologyRevisions';

describe('RepairTenantTopologyRevisions1808000000000', () => {
  const migration = new RepairTenantTopologyRevisions1808000000000();

  // The migration resolves the tenant predicate through the shared
  // type-aware resolver, which reads the tenant_id column type from
  // information_schema. The stub answers with the declared data_type; a raw
  // rows array mirrors what PostgresQueryRunner.query returns at runtime.
  const collectSql = async (
    direction: 'up' | 'down' = 'up',
    tenantIdDataType: string = 'character varying',
  ): Promise<string> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([
            { data_type: tenantIdDataType },
          ]) as unknown as Promise<QueryResult>;
        }
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;
    await migration[direction](queryRunner);
    return queries.join('\n');
  };

  describe('empty / missing schema expectations', () => {
    it('creates tenant_topology_revisions table with expected columns and unique constraint', async () => {
      const sql = await collectSql('up');

      for (const fragment of [
        'CREATE TABLE IF NOT EXISTS tenant_topology_revisions',
        'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
        'tenant_id varchar NOT NULL',
        'contract_version integer NOT NULL',
        'revision integer NOT NULL',
        'topology jsonb NOT NULL',
        'hash varchar NOT NULL',
        'created_at timestamptz NOT NULL DEFAULT now()',
        'CONSTRAINT uq_tenant_topology_revisions_revision UNIQUE (tenant_id, revision)',
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it('ensures unique index exists on tenant_id and revision', async () => {
      const sql = await collectSql('up');

      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_topology_revisions_revision',
      );
      expect(sql).toContain(
        'ON tenant_topology_revisions (tenant_id, revision)',
      );
    });

    it('creates immutability function and trigger blocking updates and deletes', async () => {
      const sql = await collectSql('up');

      for (const fragment of [
        'CREATE OR REPLACE FUNCTION reject_tenant_topology_revision_mutation()',
        'RETURNS trigger',
        "RAISE EXCEPTION 'tenant_topology_revisions is immutable'",
        'DROP TRIGGER IF EXISTS tenant_topology_revisions_immutable ON tenant_topology_revisions',
        'CREATE TRIGGER tenant_topology_revisions_immutable',
        'BEFORE UPDATE OR DELETE ON tenant_topology_revisions',
        'FOR EACH ROW',
        'EXECUTE FUNCTION reject_tenant_topology_revision_mutation()',
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it('enables and forces RLS with tenant select and insert policies', async () => {
      const sql = await collectSql('up');

      for (const fragment of [
        'ALTER TABLE tenant_topology_revisions ENABLE ROW LEVEL SECURITY',
        'ALTER TABLE tenant_topology_revisions FORCE ROW LEVEL SECURITY',
        'DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select ON tenant_topology_revisions',
        'CREATE POLICY tenant_topology_revisions_tenant_select ON tenant_topology_revisions',
        'FOR SELECT',
        'DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert ON tenant_topology_revisions',
        'CREATE POLICY tenant_topology_revisions_tenant_insert ON tenant_topology_revisions',
        'FOR INSERT',
        // On a varchar tenant_id the resolver returns the column-cast text
        // form (its canonical answer for non-uuid columns), not the bare
        // compare the migration hardcoded before this resolver existed.
        "USING (tenant_id::text = current_setting('app.tenant_id', true))",
        "WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true))",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it('does not insert any tenant or device seed data', async () => {
      const sql = await collectSql('up');

      expect(sql).not.toContain('INSERT INTO tenant_topology_revisions');
      expect(sql).not.toContain('INSERT INTO');
    });
  });

  describe('already-complete schema & idempotency SQL expectations', () => {
    it('uses IF NOT EXISTS, OR REPLACE, and conditional drops to ensure safe idempotent re-runs', async () => {
      const sql = await collectSql('up');

      // Idempotent table creation
      expect(sql).toMatch(
        /CREATE TABLE IF NOT EXISTS tenant_topology_revisions/,
      );

      // Idempotent index creation
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_topology_revisions_revision/,
      );

      // Idempotent function replacement
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION reject_tenant_topology_revision_mutation/,
      );

      // Safe trigger replacement
      expect(sql).toMatch(
        /DROP TRIGGER IF EXISTS tenant_topology_revisions_immutable/,
      );
      expect(sql).toMatch(/CREATE TRIGGER tenant_topology_revisions_immutable/);

      // Safe policy replacement
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS tenant_topology_revisions_tenant_select/,
      );
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS tenant_topology_revisions_tenant_insert/,
      );

      // Safe FORCE RLS
      expect(sql).toMatch(
        /ALTER TABLE tenant_topology_revisions FORCE ROW LEVEL SECURITY/,
      );
    });
  });

  describe('down migration safety', () => {
    it('guards against data loss if topology revisions exist', async () => {
      const sql = await collectSql('down');

      expect(sql).toContain(
        'IF EXISTS (SELECT 1 FROM tenant_topology_revisions LIMIT 1)',
      );
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql).toContain(
        'DROP TABLE IF EXISTS tenant_topology_revisions CASCADE',
      );
    });
  });

  describe('type-aware tenant predicate', () => {
    it('emits the setting-cast predicate when tenant_id is already uuid (partial-ledger re-run)', async () => {
      // A partial-ledger re-run happens after later slices converted the
      // column to uuid; the recreated policies must use the setting-cast
      // form instead of the hardcoded bare compare.
      const sql = await collectSql('up', 'uuid');

      expect(sql).toContain(
        "tenant_id = current_setting('app.tenant_id', true)::uuid",
      );
      expect(sql).not.toContain(
        "tenant_id::text = current_setting('app.tenant_id', true)",
      );
    });
  });
});
