import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice B2 (unit B2.3, part 2 of the slice) of issue #286: rebinds
 * the human authorization domain's last four tenant_id columns from
 * varchar(128) to uuid and rewrites their RLS policies to the target
 * predicate, all inside this migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 10 rows
 * across these four tables, all matching the
 * `{table}_tenant_{select|insert|update}` naming, and no other policy
 * references any of these tables), so recreating all of them cannot rewrite a
 * non-tenant policy. The append-only tables carry select+insert only; the
 * mutable ones add update. No view depends on any of these columns: the
 * repository has exactly one view and slice B1 already rebound it.
 * `sys_parametros_config` must not appear here.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'human_auth_verification_events',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'human_auth_verification_events',
        policyName: 'human_auth_verification_events_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'human_auth_verification_events',
        policyName: 'human_auth_verification_events_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'human_auth_rollout_cohorts',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'human_auth_rollout_cohorts',
        policyName: 'human_auth_rollout_cohorts_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'human_auth_rollout_cohorts',
        policyName: 'human_auth_rollout_cohorts_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'human_auth_rollout_cohorts',
        policyName: 'human_auth_rollout_cohorts_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'human_auth_tenant_publication_state',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'human_auth_tenant_publication_state',
        policyName: 'human_auth_tenant_publication_state_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'human_auth_tenant_publication_state',
        policyName: 'human_auth_tenant_publication_state_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'human_auth_tenant_publication_state',
        policyName: 'human_auth_tenant_publication_state_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'human_auth_policy_snapshots',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'human_auth_policy_snapshots',
        policyName: 'human_auth_policy_snapshots_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'human_auth_policy_snapshots',
        policyName: 'human_auth_policy_snapshots_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
    ],
  },
];

export class RebindHumanAuthorizationStateColumns1809110000000 implements MigrationInterface {
  name = 'RebindHumanAuthorizationStateColumns1809110000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await rebindTenantColumns(queryRunner, TARGETS, TENANT_RLS_PREDICATE);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await rebindTenantColumns(
      queryRunner,
      TARGETS,
      PREVIOUS_TENANT_RLS_PREDICATE,
      (target) => target.previousType,
    );
  }
}
