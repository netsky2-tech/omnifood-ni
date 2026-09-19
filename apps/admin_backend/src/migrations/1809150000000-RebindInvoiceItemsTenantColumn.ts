import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  type TenantRlsTarget,
} from '../core/database/tenant-rls-policy';

/**
 * Phase 2 slice C (unit C.5, the final code unit of the slice) of issue
 * #286: rebinds `invoice_items.tenant_id` from varchar to uuid and rewrites
 * the table's RLS policies to the target predicate, all inside this
 * migration's single transaction.
 *
 * PostgreSQL refuses `ALTER COLUMN TYPE` while a policy depends on the
 * column, so the shared emitter drops every policy, changes the column, and
 * recreates every policy with the predicate defined once in
 * core/database/tenant-rls-policy.ts. The `using`/`check` halves are authored
 * data taken from the catalog's structural columns (verified: exactly 4 rows
 * on `invoice_items`, all created by `1782000000000-AddCreditNoteProvenance`
 * with the `credit_note_` prefix — NOT the `{table}_tenant_{command}`
 * convention — and no other policy references the table), so recreating all
 * of them cannot rewrite a non-tenant policy. `1809060000000` owns the
 * `invoices` policies only and its spec asserts it never mentions
 * `invoice_items`, so this unit owns all four rows.
 *
 * No view depends on `invoice_items.tenant_id` — the repository's only view
 * reads `sys_parametros_config` — so the target declares no views.
 *
 * The provenance migration is type-aware (slice A) and listed in
 * `partial_ledger_names`, so when it re-runs in scenario 2 it re-emits these
 * four policies with the uuid predicate read from the now-uuid column and
 * needs no edit. The column was added by `1770000000000` as a bare
 * `tenant_id varchar`, so the previous type carries no width.
 */
const TARGETS: TenantRlsTarget[] = [
  {
    table: 'invoice_items',
    previousType: 'character varying',
    policies: [
      {
        table: 'invoice_items',
        policyName: 'credit_note_invoice_items_tenant_select',
        cmd: 'SELECT',
        using: true,
        check: false,
      },
      {
        table: 'invoice_items',
        policyName: 'credit_note_invoice_items_tenant_insert',
        cmd: 'INSERT',
        using: false,
        check: true,
      },
      {
        table: 'invoice_items',
        policyName: 'credit_note_invoice_items_tenant_update',
        cmd: 'UPDATE',
        using: true,
        check: true,
      },
      {
        table: 'invoice_items',
        policyName: 'credit_note_invoice_items_tenant_delete',
        cmd: 'DELETE',
        using: true,
        check: false,
      },
    ],
  },
];

export class RebindInvoiceItemsTenantColumn1809150000000 implements MigrationInterface {
  name = 'RebindInvoiceItemsTenantColumn1809150000000';

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
