import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice B2 (unit B2.2, part 1 of the slice) of issue #286: rebinds
 * the human authorization domain's first five tenant_id columns from
 * varchar(128) to uuid and rewrites their RLS policies to the target
 * predicate, all inside this migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 12 rows
 * across these five tables, all matching the
 * `{table}_tenant_{select|insert|update}` naming, and no other policy
 * references any of these tables), so recreating all of them cannot rewrite a
 * non-tenant policy. The append-only tables carry select+insert only; the
 * mutable ones add update. The four remaining human authorization tables
 * belong to unit B2.3 and must not appear here.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'human_auth_policy_epochs',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'human_auth_terminal_ack_history',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'human_auth_terminal_ack_floor',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'human_auth_recovery_tokens',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'human_auth_recovery_events',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
];

export class RebindHumanAuthorizationTenantColumns1809100000000 implements MigrationInterface {
  name = 'RebindHumanAuthorizationTenantColumns1809100000000';

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
