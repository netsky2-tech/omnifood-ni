import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice C (unit C.3) of issue #286: rebinds the device sync and
 * integrity-alert domain's four tenant_id columns from varchar to uuid and
 * rewrites the six RLS policies the two device tables carry, all inside this
 * migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 6 rows,
 * 4 on device_sync_credentials and 2 on device_sync_credential_events, all
 * matching the `{table}_tenant_{select|insert|update|delete}` convention —
 * note the events table's verbatim abbreviated
 * `device_sync_cred_events_tenant_*` naming from 1807000000000 — and no other
 * policy references any of these tables), so recreating all of them cannot
 * rewrite a non-tenant policy. The previous types are NOT uniform: the device
 * columns were varchar(128) while the alert columns were unbounded varchar,
 * so `down()` restores each target's own measured shape. The two alert tables
 * carry zero policies and no view depends on any of these columns; they are
 * column-only rebinds.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'device_sync_credentials',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'device_sync_credentials',
        policyName: 'device_sync_credentials_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'device_sync_credentials',
        policyName: 'device_sync_credentials_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'device_sync_credentials',
        policyName: 'device_sync_credentials_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'device_sync_credentials',
        policyName: 'device_sync_credentials_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'device_sync_credential_events',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'device_sync_credential_events',
        policyName: 'device_sync_cred_events_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'device_sync_credential_events',
        policyName: 'device_sync_cred_events_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
    ],
  },
  {
    table: 'audit_integrity_alerts',
    previousType: 'character varying',
    policies: [],
  },
  {
    table: 'forensic_alerts',
    previousType: 'character varying',
    policies: [],
  },
];

export class RebindDeviceAndAlertTenantColumns1809130000000 implements MigrationInterface {
  name = 'RebindDeviceAndAlertTenantColumns1809130000000';

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
