import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice B1 (unit L3b) of issue #286: rebinds the
 * `sys_parametros_config.tenant_id` column from `character varying` (declared
 * without a length — verified against `information_schema.columns`, which
 * reports `character varying` with a NULL `character_maximum_length`) to
 * uuid, and rewrites its single RLS policy to the target predicate, all
 * inside this migration's single transaction.
 *
 * This is the only table in the repository whose `tenant_id` column is read
 * by a view, so this is the only rebind that also declares a view dependency:
 * `v_sys_parametros_config_active` (the only view in the repository sources)
 * has a `_RETURN` rewrite rule that depends on the column, which blocks the
 * `ALTER` exactly like a policy does. `CREATE OR REPLACE VIEW` cannot lift
 * that dependency — the view's existence is what blocks it — so the emitter
 * drops the view before the column change and recreates it after, with the
 * exact DDL authored by 1784000000000-CreateSystemParametersConfig. The
 * `WITH (security_invoker = true)` option is load-bearing: it keeps the view
 * reading under the caller's RLS context instead of the owner's privileges,
 * so losing it would silently widen every read of the view. That DDL selects
 * named columns (never `SELECT *`), so the same statement serves `up()` and
 * `down()` regardless of the column type in flight.
 *
 * The policy row is authored data taken from `pg_policies`' structural
 * columns on the scratch database `omnifood_schema_build_test` (never from
 * the deparsed `qual`/`with_check` expressions): exactly one policy,
 * `sys_parametros_config_tenant_isolation`, created by 1784000000000 as
 * `FOR ALL` with both halves. No other policy references this table.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'sys_parametros_config',
    previousType: 'character varying',
    views: [
      {
        name: 'v_sys_parametros_config_active',
        createSql: `
      CREATE OR REPLACE VIEW v_sys_parametros_config_active
      WITH (security_invoker = true)
      AS
      SELECT DISTINCT ON (tenant_id, param_key)
        id,
        tenant_id,
        param_key,
        param_value,
        version,
        effective_from,
        effective_to,
        is_active,
        created_by,
        created_at
      FROM sys_parametros_config
      WHERE is_active = true
        AND (effective_to IS NULL OR effective_to > now())
      ORDER BY tenant_id, param_key, version DESC, effective_from DESC;
    `,
      },
    ],
    policies: [
      {
        table: 'sys_parametros_config',
        policyName: 'sys_parametros_config_tenant_isolation',
        cmd: 'ALL',
        using: true,
        check: true,
      },
    ],
  },
];

export class RebindSystemParametersConfigTenantColumn1809090000000 implements MigrationInterface {
  name = 'RebindSystemParametersConfigTenantColumn1809090000000';

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
