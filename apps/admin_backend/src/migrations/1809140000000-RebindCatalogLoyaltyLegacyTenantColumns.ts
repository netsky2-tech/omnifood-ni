import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice C (unit C.4) of issue #286: rebinds the catalog, loyalty and
 * legacy domain's six tenant_id columns from varchar to uuid and rewrites
 * catalog_values' four RLS policies to the target predicate, all inside this
 * migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. `catalog_values` is the only one of the
 * six that carries policies — exactly four, all tenant policies created in
 * 1768000000000-CreateCatalogValues.ts (verified: select/insert/update/delete
 * under the `{table}_tenant_{command}` naming, and no other policy references
 * any of these tables) — so recreating them cannot rewrite a non-tenant
 * policy. The other five tables are column-only targets with zero policies
 * and never enabled RLS, so there is nothing to drop for them. No view
 * depends on any of these six tenant_id columns (the repository's only view
 * reads `sys_parametros_config`), so no target declares views.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'catalog_values',
    previousType: 'character varying',
    policies: [
      {
        table: 'catalog_values',
        policyName: 'catalog_values_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'catalog_values',
        policyName: 'catalog_values_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'catalog_values',
        policyName: 'catalog_values_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'catalog_values',
        policyName: 'catalog_values_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'customer_point_transactions',
    previousType: 'character varying',
    policies: [],
  },
  {
    table: 'customers',
    previousType: 'character varying',
    policies: [],
  },
  {
    table: 'legacy_import_integrity_reports',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'legacy_onboarding_migration_receipts',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'promotions',
    previousType: 'character varying',
    policies: [],
  },
];

export class RebindCatalogLoyaltyLegacyTenantColumns1809140000000 implements MigrationInterface {
  name = 'RebindCatalogLoyaltyLegacyTenantColumns1809140000000';

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
