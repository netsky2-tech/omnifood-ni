import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
} from '../core/database/tenant-rls-policy';
import { RebindHumanAuthorizationTenantColumns1809100000000 } from './1809100000000-RebindHumanAuthorizationTenantColumns';

/**
 * The authored catalog truth for the human authorization domain, slice part
 * 1: five tables, 12 policies, every one of them policy-carrying. This is
 * deliberately an independent copy of the migration's targets so the spec
 * cannot pass by construction. The rows were taken from `pg_policies`'
 * structural columns (never `qual`/`with_check`) on the scratch database
 * `omnifood_schema_build_test`, which holds all 102 policies.
 *
 * The four remaining human authorization tables are deliberately absent: they
 * belong to unit B2.3, and no statement in this migration may touch them.
 * No view depends on any of these columns.
 */
const REBOUND_TABLES = [
  'human_auth_policy_epochs',
  'human_auth_terminal_ack_history',
  'human_auth_terminal_ack_floor',
  'human_auth_recovery_tokens',
  'human_auth_recovery_events',
] as const;

const POLICY_ROWS: Array<{
  table: string;
  policyName: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: boolean;
  check: boolean;
}> = [
  {
    table: 'human_auth_policy_epochs',
    policyName: 'human_auth_policy_epochs_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'human_auth_policy_epochs',
    policyName: 'human_auth_policy_epochs_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'human_auth_terminal_ack_history',
    policyName: 'human_auth_terminal_ack_history_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'human_auth_terminal_ack_history',
    policyName: 'human_auth_terminal_ack_history_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'human_auth_terminal_ack_floor',
    policyName: 'human_auth_terminal_ack_floor_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'human_auth_terminal_ack_floor',
    policyName: 'human_auth_terminal_ack_floor_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'human_auth_terminal_ack_floor',
    policyName: 'human_auth_terminal_ack_floor_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'human_auth_recovery_tokens',
    policyName: 'human_auth_recovery_tokens_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'human_auth_recovery_tokens',
    policyName: 'human_auth_recovery_tokens_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
  {
    table: 'human_auth_recovery_tokens',
    policyName: 'human_auth_recovery_tokens_tenant_update',
    cmd: 'UPDATE',
    using: true,
    check: true,
  },
  {
    table: 'human_auth_recovery_events',
    policyName: 'human_auth_recovery_events_tenant_insert',
    cmd: 'INSERT',
    using: false,
    check: true,
  },
  {
    table: 'human_auth_recovery_events',
    policyName: 'human_auth_recovery_events_tenant_select',
    cmd: 'SELECT',
    using: true,
    check: false,
  },
];

// Read from information_schema.columns on the scratch database: every one of
// these five columns is varchar(128) today, but each is measured, not assumed.
const PREVIOUS_TYPES: Record<string, string> = {
  human_auth_policy_epochs: 'character varying(128)',
  human_auth_terminal_ack_history: 'character varying(128)',
  human_auth_terminal_ack_floor: 'character varying(128)',
  human_auth_recovery_tokens: 'character varying(128)',
  human_auth_recovery_events: 'character varying(128)',
};

describe('RebindHumanAuthorizationTenantColumns1809100000000', () => {
  const migration = new RebindHumanAuthorizationTenantColumns1809100000000();

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
      'RebindHumanAuthorizationTenantColumns1809100000000',
    );
  });

  it('carries exactly 12 authored policy rows matching the catalog convention', () => {
    // The catalog on the scratch database holds exactly these 12 rows for the
    // five tables 1809000000000/1809000000001 created policies on; the spec
    // pins the count so a target silently added or dropped here cannot pass.
    expect(POLICY_ROWS).toHaveLength(12);

    // Policy counts per table: append-only tables carry select+insert; the
    // mutable ones add update. All five tables in this unit are policy-carrying.
    const expectedCommands: Record<(typeof REBOUND_TABLES)[number], string[]> =
      {
        human_auth_policy_epochs: ['insert', 'select'],
        human_auth_terminal_ack_history: ['insert', 'select'],
        human_auth_terminal_ack_floor: ['insert', 'select', 'update'],
        human_auth_recovery_tokens: ['insert', 'select', 'update'],
        human_auth_recovery_events: ['insert', 'select'],
      };

    for (const table of REBOUND_TABLES) {
      const rows = POLICY_ROWS.filter((row) => row.table === table);
      expect(rows.map((row) => row.policyName).sort()).toEqual(
        expectedCommands[table].map((command) => `${table}_tenant_${command}`),
      );
    }
  });

  it('rebinds all five tables with the target uuid predicate in up()', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain(TENANT_RLS_PREDICATE);
    expect(sql).not.toContain(PREVIOUS_TENANT_RLS_PREDICATE);

    // Five tables, all rebound to uuid with the column-side cast.
    for (const table of REBOUND_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" TYPE uuid ` +
          'USING "tenant_id"::uuid',
      );
    }
    expect(
      queries.filter((q) => q.includes('ALTER COLUMN "tenant_id" TYPE uuid')),
    ).toHaveLength(REBOUND_TABLES.length);

    // 12 policies dropped and recreated against the target predicate.
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

  it('emits no view statement and does not touch the B2.3 tables', async () => {
    const { queryRunner, queries } = createQueryRunner();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const sql = queries.join('\n');

    // The repository has exactly one view and slice B1 already rebound it;
    // no statement in this migration may create or drop a view.
    expect(sql).not.toContain('DROP VIEW');
    expect(sql).not.toContain('CREATE VIEW');

    // The four remaining human authorization tables belong to B2.3.
    for (const table of [
      'human_auth_verification_events',
      'human_auth_rollout_cohorts',
      'human_auth_tenant_publication_state',
      'human_auth_policy_snapshots',
    ]) {
      expect(sql).not.toContain(`"${table}"`);
    }
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
