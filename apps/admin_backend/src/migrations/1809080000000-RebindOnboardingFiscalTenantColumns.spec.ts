import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindOnboardingFiscalTenantColumns1809080000000 } from './1809080000000-RebindOnboardingFiscalTenantColumns';

/**
 * The authored catalog truth for the Onboarding & fiscal domain: nine
 * non-view tables, 20 policies, four tables without any. This is deliberately
 * an independent copy of the migration's targets so the spec cannot pass by
 * construction. The rows were taken from `pg_policies`' structural columns
 * (never `qual`/`with_check`) on the scratch database
 * `omnifood_schema_build_test`, which holds all 102 policies.
 *
 * `sys_parametros_config` and its view are deliberately absent: they belong
 * to the L3b unit, and no statement in this migration may touch them.
 */
const POLICY_TABLES = [
  'fiscal_config_revisions',
  'onboarding_activation_attempts',
  'onboarding_activation_check_results',
  'onboarding_activation_follow_ups',
  'onboarding_telemetry_events',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'fiscal_config_revisions',
    policyName: 'fiscal_config_revisions_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'fiscal_config_revisions',
    policyName: 'fiscal_config_revisions_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'fiscal_config_revisions',
    policyName: 'fiscal_config_revisions_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'fiscal_config_revisions',
    policyName: 'fiscal_config_revisions_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'onboarding_activation_attempts',
    policyName: 'onboarding_activation_attempts_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_attempts',
    policyName: 'onboarding_activation_attempts_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'onboarding_activation_attempts',
    policyName: 'onboarding_activation_attempts_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_attempts',
    policyName: 'onboarding_activation_attempts_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'onboarding_activation_check_results',
    policyName: 'onboarding_activation_check_results_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_check_results',
    policyName: 'onboarding_activation_check_results_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'onboarding_activation_check_results',
    policyName: 'onboarding_activation_check_results_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_check_results',
    policyName: 'onboarding_activation_check_results_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'onboarding_activation_follow_ups',
    policyName: 'onboarding_activation_follow_ups_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_follow_ups',
    policyName: 'onboarding_activation_follow_ups_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'onboarding_activation_follow_ups',
    policyName: 'onboarding_activation_follow_ups_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_activation_follow_ups',
    policyName: 'onboarding_activation_follow_ups_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'onboarding_telemetry_events',
    policyName: 'onboarding_telemetry_events_tenant_delete',
    cmd: 'DELETE',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_telemetry_events',
    policyName: 'onboarding_telemetry_events_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'onboarding_telemetry_events',
    policyName: 'onboarding_telemetry_events_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'onboarding_telemetry_events',
    policyName: 'onboarding_telemetry_events_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
];

const TABLES_WITHOUT_POLICIES = [
  'onboarding_idempotency_records',
  'onboarding_sessions',
  'onboarding_template_applications',
  'onboarding_template_seed_links',
] as const;

const REBOUND_TABLES = [...POLICY_TABLES, ...TABLES_WITHOUT_POLICIES];

const PREVIOUS_TYPES: Record<string, string> = {
  fiscal_config_revisions: 'character varying(128)',
  onboarding_activation_attempts: 'character varying(128)',
  onboarding_activation_check_results: 'character varying(128)',
  onboarding_activation_follow_ups: 'character varying(128)',
  onboarding_telemetry_events: 'character varying(128)',
  onboarding_idempotency_records: 'character varying(128)',
  onboarding_sessions: 'character varying(128)',
  onboarding_template_applications: 'character varying(128)',
  onboarding_template_seed_links: 'character varying(128)',
};

describe('RebindOnboardingFiscalTenantColumns1809080000000', () => {
  const migration = new RebindOnboardingFiscalTenantColumns1809080000000();

  const createQueryRunner = (
    // Column type answered for information_schema lookups; `uuid` mirrors the
    // post-up state the down() rollback runs against.
    columnType: 'character varying' | 'uuid' = 'character varying',
  ) => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        const result = new QueryResult();
        if (sql.includes('information_schema.columns')) {
          result.records = [
            {
              data_type: columnType,
              character_maximum_length: 128,
            },
          ];
        }
        return Promise.resolve(result);
      }),
    } as unknown as QueryRunner;

    return { queryRunner, queries };
  };

  it('reports the migration name required by the migrations ledger', () => {
    expect(migration.name).toBe(
      'RebindOnboardingFiscalTenantColumns1809080000000',
    );
  });

  it('carries exactly 20 authored policy rows, four per policy-carrying table', () => {
    // The catalog on the scratch database holds exactly these 20 rows for the
    // five tables 1809000000001 created policies on; the spec pins the count
    // so a target silently added or dropped here cannot pass.
    expect(POLICY_ROWS).toHaveLength(20);

    for (const table of POLICY_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows.map((row) => row.policyName).sort()).toEqual(
        ['delete', 'insert', 'select', 'update'].map(
          (command) => `${table}_tenant_${command}`,
        ),
      );
    }

    // Every policy-less table is rebound too; nine targets in total.
    expect(REBOUND_TABLES).toHaveLength(9);
    for (const table of TABLES_WITHOUT_POLICIES) {
      expect(POLICY_ROWS.some((row) => row.table === table)).toBe(false);
    }
  });

  it('rebinds all nine tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Nine tables, all rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // 20 policies dropped and recreated against the target predicate.
    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
    expect(
      sql.match(
        new RegExp(
          TENANT_RLS_PREDICATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g',
        ),
      ),
    ).toHaveLength(
      POLICY_ROWS.reduce(
        (sum, row) => sum + (row.using ? 1 : 0) + (row.check ? 1 : 0),
        0,
      ),
    );

    for (const row of POLICY_ROWS) {
      const statement = queries.find((q) =>
        q.includes(`CREATE POLICY "${row.policyName}"`),
      );
      expect(statement).toBeDefined();
      expect(statement).toContain(`ON "${row.table}"`);
      expect(statement).toContain(`FOR ${row.cmd}`);
      expect(!!statement?.includes('USING (')).toBe(row.using);
      expect(!!statement?.includes('WITH CHECK (')).toBe(row.check);
    }
  });

  it('emits no view statement: the view belongs to the L3b unit', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');
    expect(sql).not.toContain('sys_parametros_config');
    expect(sql).not.toContain('v_sys_parametros_config_active');
  });

  it('recreates the four policy-less tables with the column change only', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    for (const table of TABLES_WITHOUT_POLICIES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    // No policy statement may touch the policy-less tables.
    const policyStatementsOnPolicyless = queries.filter(
      (q) =>
        (q.includes('DROP POLICY') || q.includes('CREATE POLICY')) &&
        TABLES_WITHOUT_POLICIES.some((table) => q.includes(`ON "${table}"`)),
    );
    expect(policyStatementsOnPolicyless).toHaveLength(0);
  });

  it('restores the previous column types and text predicate in down()', async () => {
    const { queryRunner, queries } = createQueryRunner('uuid');

    await migration.down(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(PREVIOUS_TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(TENANT_RLS_PREDICATE);

    for (const [table, previousType] of Object.entries(PREVIOUS_TYPES)) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE ${previousType} ` +
          'USING "tenant_id"::text',
      );
    }

    expect(sql.match(/DROP POLICY IF EXISTS/g)).toHaveLength(
      POLICY_ROWS.length,
    );
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(POLICY_ROWS.length);
  });
});
