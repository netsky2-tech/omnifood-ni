import type { EntityManager } from 'typeorm';
import {
  readStaffPolicySourceRecords,
  resolveTenantCohortDecision,
  STAFF_POLICY_COHORT_DECISION,
} from './staff-policy-source-reader';

const TENANT = 'a1b2c3d4-0000-4000-8000-000000000001';
const BUILD = 'backend-2025.01.0';
const USER_A = 'd4c3b2a1-0000-4000-8000-00000000000a';

interface QueryCall {
  sql: string;
  params?: unknown[];
}

const makeManager = (rows: { sources?: unknown[]; cohort?: unknown[] }) => {
  const calls: QueryCall[] = [];
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('FROM users')) return rows.sources ?? [];
    if (sql.includes('FROM human_auth_rollout_cohorts'))
      return rows.cohort ?? [];
    throw new Error(`unexpected query: ${sql}`);
  });
  return { calls, manager: { query } as unknown as EntityManager };
};

describe('staff-policy source reader', () => {
  it('reads sources through one parameterized LEFT JOIN with an explicit uuid tenant predicate', async () => {
    const { calls, manager } = makeManager({});
    await readStaffPolicySourceRecords(manager, TENANT);
    const call = calls[0];
    expect(call.sql).toContain('LEFT JOIN security_profiles');
    expect(call.sql).toContain('sp.user_id = u.id');
    expect(call.sql).toContain('u.tenant_id = $1::uuid');
    expect(call.params).toEqual([TENANT]);
    expect(call.sql).not.toContain(TENANT);
  });

  it.each([
    [
      'array custom permissions',
      {
        id: USER_A,
        role: 'MANAGER',
        is_active: true,
        attempt_reset_generation: '2',
        pin_hash: '$2b$12$KIXQeQ1vZqZ5uYyZ0O1zXe',
        custom_permissions: ['sales:void_invoice', 'sales:void_invoice'],
      },
      {
        isActive: true,
        pinHash: '$2b$12$KIXQeQ1vZqZ5uYyZ0O1zXe',
        attemptResetGeneration: '2',
        customPermissions: ['sales:void_invoice', 'sales:void_invoice'],
      },
    ],
    [
      'null custom permissions',
      {
        id: USER_A,
        role: 'WAITER',
        is_active: false,
        attempt_reset_generation: '0',
        pin_hash: null,
        custom_permissions: null,
      },
      {
        isActive: false,
        pinHash: null,
        attemptResetGeneration: '0',
        customPermissions: null,
      },
    ],
    [
      'non-array custom permissions',
      {
        id: USER_A,
        role: 'WAITER',
        is_active: true,
        attempt_reset_generation: '0',
        pin_hash: null,
        custom_permissions: { sales: ['void_invoice'] },
      },
      {
        isActive: true,
        pinHash: null,
        customPermissions: null,
      },
    ],
    [
      'missing security profile row',
      {
        id: USER_A,
        role: 'CASHIER',
        is_active: true,
        attempt_reset_generation: '0',
        pin_hash: null,
        custom_permissions: null,
      },
      {
        isActive: true,
        pinHash: null,
        attemptResetGeneration: '0',
        customPermissions: null,
      },
    ],
  ])('maps %s without inventing values', async (_name, row, expected) => {
    const { manager } = makeManager({ sources: [row] });
    const [record] = await readStaffPolicySourceRecords(manager, TENANT);
    expect(record?.userId).toBe(USER_A);
    expect(record?.role).toBe(row.role);
    expect(record).toMatchObject(expected);
  });

  it.each([
    ['ELIGIBLE', [{ ok: 1 }]],
    ['DISABLED', []],
  ])('resolves the tenant cohort decision as %s', async (decision, cohort) => {
    const { calls, manager } = makeManager({ cohort });
    const result = await resolveTenantCohortDecision(manager, TENANT, BUILD);
    expect(result).toBe(
      STAFF_POLICY_COHORT_DECISION[
        decision as keyof typeof STAFF_POLICY_COHORT_DECISION
      ],
    );
    const call = calls[0];
    expect(call.sql).toContain('FROM human_auth_rollout_cohorts');
    expect(call.sql).toContain('enabled = TRUE');
    expect(call.sql).toContain('backend_build = $2');
    expect(call.params).toEqual([TENANT, BUILD]);
    expect(call.sql).not.toContain(TENANT);
  });
});
