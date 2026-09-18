import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice A of issue #286: rebinds the Inventory & Kardex domain's
 * tenant_id columns from varchar to uuid and rewrites their RLS policies to
 * the target predicate, all inside this migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns; every policy on the eight
 * policy-carrying tables references app.tenant_id (verified: 0 exceptions), so
 * recreating all of them cannot rewrite a non-tenant policy. The two
 * remaining tables are not FORCE ROW LEVEL SECURITY and carry no policies, so
 * they need the column change only.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'inventory_kardex',
    previousType: 'character varying',
    policies: [
      {
        table: 'inventory_kardex',
        policyName: 'credit_note_inventory_kardex_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
      {
        table: 'inventory_kardex',
        policyName: 'credit_note_inventory_kardex_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_kardex',
        policyName: 'credit_note_inventory_kardex_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'inventory_kardex',
        policyName: 'credit_note_inventory_kardex_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'inventory_kardex',
        policyName: 'sync_ledger_inventory_kardex_append_only_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
      {
        table: 'inventory_kardex',
        policyName: 'sync_ledger_inventory_kardex_append_only_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'inventory_kardex',
        policyName: 'sync_ledger_inventory_kardex_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_kardex',
        policyName: 'sync_ledger_inventory_kardex_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'inventory_purchase_documents',
    previousType: 'character varying',
    policies: [
      {
        table: 'inventory_purchase_documents',
        policyName: 'inventory_purchase_documents_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
      {
        table: 'inventory_purchase_documents',
        policyName: 'inventory_purchase_documents_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_purchase_documents',
        policyName: 'inventory_purchase_documents_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'inventory_purchase_documents',
        policyName: 'inventory_purchase_documents_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'inventory_remediation_receipts',
    previousType: 'character varying(128)',
    policies: [
      {
        table: 'inventory_remediation_receipts',
        policyName: 'remediation_receipts_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_remediation_receipts',
        policyName: 'remediation_receipts_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'inventory_sync_outbox',
    previousType: 'character varying',
    policies: [
      {
        table: 'inventory_sync_outbox',
        policyName: 'sync_ledger_inventory_sync_outbox_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_sync_outbox',
        policyName: 'sync_ledger_inventory_sync_outbox_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'inventory_sync_outbox',
        policyName: 'sync_ledger_inventory_sync_outbox_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'inventory_sync_receipts',
    previousType: 'character varying',
    policies: [
      {
        table: 'inventory_sync_receipts',
        policyName: 'sync_ledger_inventory_sync_receipts_append_only_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
      {
        table: 'inventory_sync_receipts',
        policyName: 'sync_ledger_inventory_sync_receipts_append_only_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'inventory_sync_receipts',
        policyName: 'sync_ledger_inventory_sync_receipts_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'inventory_sync_receipts',
        policyName: 'sync_ledger_inventory_sync_receipts_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
    ],
  },
  {
    table: 'kardex_correction',
    previousType: 'character varying',
    policies: [
      {
        table: 'kardex_correction',
        policyName: 'kardex_correction_tenant_isolation',
        cmd: 'ALL',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'kardex_recalculate_queue',
    previousType: 'character varying',
    policies: [
      {
        table: 'kardex_recalculate_queue',
        policyName: 'kardex_queue_tenant_isolation',
        cmd: 'ALL',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'production_batch_history',
    previousType: 'character varying',
    policies: [
      {
        table: 'production_batch_history',
        policyName: 'production_batch_history_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
      {
        table: 'production_batch_history',
        policyName: 'production_batch_history_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'production_batch_history',
        policyName: 'production_batch_history_tenant_isolation',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'production_batch_history',
        policyName: 'production_batch_history_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
    ],
  },
  {
    table: 'product_import_sessions',
    previousType: 'character varying(128)',
    policies: [],
  },
  {
    table: 'staging_importacion_productos',
    previousType: 'character varying(128)',
    policies: [],
  },
];

export class RebindInventoryKardexTenantColumns1809070000000 implements MigrationInterface {
  name = 'RebindInventoryKardexTenantColumns1809070000000';

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
