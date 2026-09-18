import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice B1 (unit L3a) of issue #286: rebinds the Onboarding & fiscal
 * domain's nine non-view tenant_id columns from varchar(128) to uuid and
 * rewrites their RLS policies to the target predicate, all inside this
 * migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 20 rows
 * across the five policy-carrying tables, all created by
 * 1809000000001-EnforceOnboardingFiscalTenantRls with the
 * `{table}_tenant_{select|insert|update|delete}` naming, and no other policy
 * references any of these tables), so recreating all of them cannot rewrite a
 * non-tenant policy. The four remaining tables carry no policies, so they
 * need the column change only. `sys_parametros_config` and its view belong to
 * the next unit (L3b) and must not appear here.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'fiscal_config_revisions',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'onboarding_activation_attempts',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'onboarding_activation_check_results',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'onboarding_activation_follow_ups',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'onboarding_telemetry_events',
    previousType: 'character varying(128)',
    policies: [
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
    ],
  },
  {
    table: 'onboarding_idempotency_records',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'onboarding_sessions',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'onboarding_template_applications',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'onboarding_template_seed_links',
    previousType: 'character varying(128)',
    policies: [],
  },
];

export class RebindOnboardingFiscalTenantColumns1809080000000 implements MigrationInterface {
  name = 'RebindOnboardingFiscalTenantColumns1809080000000';

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
