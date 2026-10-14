import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1.7 (DT 09-2007) "numeración inalterable": the invoice number is the
 * fiscal identity of the document. DELETE is already blocked by the
 * append-only protections and `(tenant_id, invoice_number)` uniqueness
 * (1809270000000), but an UPDATE could still rewrite the number in place
 * (the upsert merges on `id`). This trigger scopes the immutability to the
 * fiscal number only: legitimate column updates (settlement state,
 * cancellation, sync transitions) keep flowing — exactly like the kardex
 * mold (1773000000000), which guards the whole row because the kardex is
 * append-only, while invoices are mutable-but-numbered.
 */
export class EnforceInvoiceNumberImmutability1810000000000 implements MigrationInterface {
  name = 'EnforceInvoiceNumberImmutability1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_invoice_number_mutation()
      RETURNS trigger
      AS $$
        BEGIN
          RAISE EXCEPTION 'invoice_number is immutable: DT 09-2007 ordinal 1.7 requires unalterable numbering';
        END;
        $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_invoice_number_immutable ON invoices
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_invoice_number_immutable
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      WHEN (NEW.invoice_number IS DISTINCT FROM OLD.invoice_number)
      EXECUTE FUNCTION reject_invoice_number_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_invoice_number_immutable ON invoices',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS reject_invoice_number_mutation()',
    );
  }
}
