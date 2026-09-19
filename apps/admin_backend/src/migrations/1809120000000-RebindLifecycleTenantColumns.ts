import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice C (unit C.2) of issue #286: rebinds the tenant lifecycle
 * domain's three tenant_id columns from varchar to uuid and rewrites their
 * RLS policies to the target predicate, all inside this migration's single
 * transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 10 rows
 * across these three tables, and no other policy references any of these
 * tables, so recreating all of them cannot rewrite a non-tenant policy).
 * Note the naming break: `tenant_capability_event`'s policy names OMIT the
 * `_tenant_` infix the other tables use. The append-only tables carry
 * select+insert only; the mutable ones add update and delete. The previous
 * types are NOT uniform — two unbounded varchars (from DDL
 * `tenant_id varchar NOT NULL`) and one varchar(64) — and `down()` restores
 * each. The devices, catalog/loyalty, sales, and alerts tables belong to
 * units C.3-C.5 and must not appear here. No view depends on any of these
 * columns, so no `views` entry is needed.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'tenant_capability_event',
    previousType: 'character varying',
    policies: [
      {
        table: 'tenant_capability_event',
        policyName: 'tenant_capability_event_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'tenant_capability_event',
        policyName: 'tenant_capability_event_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'tenant_capability_event',
        policyName: 'tenant_capability_event_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'tenant_capability_event',
        policyName: 'tenant_capability_event_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'tenant_topology_revisions',
    previousType: 'character varying',
    policies: [
      {
        table: 'tenant_topology_revisions',
        policyName: 'tenant_topology_revisions_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'tenant_topology_revisions',
        policyName: 'tenant_topology_revisions_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
    ],
  },
  {
    table: 'tenant_fulfillment_records',
    previousType: 'character varying(64)',
    policies: [
      {
        table: 'tenant_fulfillment_records',
        policyName: 'tenant_fulfillment_records_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'tenant_fulfillment_records',
        policyName: 'tenant_fulfillment_records_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'tenant_fulfillment_records',
        policyName: 'tenant_fulfillment_records_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: false,
      },
      {
        table: 'tenant_fulfillment_records',
        policyName: 'tenant_fulfillment_records_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
    ],
  },
];

export class RebindLifecycleTenantColumns1809120000000 implements MigrationInterface {
  name = 'RebindLifecycleTenantColumns1809120000000';

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
