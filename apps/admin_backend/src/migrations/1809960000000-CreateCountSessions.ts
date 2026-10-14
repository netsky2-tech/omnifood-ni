import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * R19 (odd/tasks/nucleo-inventario-conteo-persistente.md, S11-S13) — the
 * physical count session stops being discarded.
 *
 * Until this migration the cloud kept only the ACCOUNTING effect of a count
 * (the variance movement in inventory_kardex, `source_document_id =
 * sessionId`) and threw the document away: who counted, when, and who
 * disputed a line had no home. Without the persisted document the system
 * cannot produce the original lists signed and dated on every page by the
 * people who counted — Reglamento de la Ley 822 (Decreto 01-2013) art. 33,
 * binding requirements `R-05`/`R-06` of docs/inventario_marco_normativo.md.
 *
 * Two tables, not three, per the design decision:
 *   - `count_sessions` — the header. It MUTATES (status moves through its
 *     lifecycle), so its RLS classification is the full `direct:SIUD` with
 *     the four per-command policies, exactly like
 *     1809940000000-CreateInsumoMarketPrices.
 *   - `count_session_entries` — one row per counted entry, the EVIDENCE of
 *     the act of counting. Evidence is appended, never edited: it gets ONLY
 *     select and insert policies (`direct:SI`) — no update, no delete.
 *
 * The frozen fields (`insumo_name`, `uom`, `theoretical_quantity`) are
 * deliberate (S12): the signed sheet must reprint identical years later even
 * after the insumo is renamed. Do not normalise them into a join.
 *
 * `count_sessions.id` is the POS document id (`varchar`, per the DTO's
 * `IsString`), the same string the variance movement stores as
 * `source_document_id` — one document, one ledger effect, one idempotency
 * key (S13). Precedent: inventory_purchase_documents (1776000000000) keys its
 * client-minted document ids the same way. The UNIQUE (tenant_id, id) lets
 * the entries' FK be composite, making a cross-tenant entry impossible.
 */
export class CreateCountSessions1809960000000 implements MigrationInterface {
  name = 'CreateCountSessions1809960000000';

  private static readonly HEADER = 'count_sessions';
  private static readonly ENTRIES = 'count_session_entries';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const header = CreateCountSessions1809960000000.HEADER;
    const entries = CreateCountSessions1809960000000.ENTRIES;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${header} (
        id varchar PRIMARY KEY,
        tenant_id uuid NOT NULL,
        warehouse_id varchar NOT NULL,
        warehouse_name varchar NOT NULL,
        status varchar NOT NULL,
        notes varchar,
        cutoff_at timestamptz NOT NULL,
        posted_at timestamptz,
        movement_references jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_count_sessions_tenant_id
          UNIQUE (tenant_id, id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${entries} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        session_id varchar NOT NULL,
        line_id varchar NOT NULL,
        line_index integer NOT NULL,
        entry_index integer NOT NULL,
        insumo_id uuid NOT NULL,
        insumo_name varchar NOT NULL,
        uom varchar NOT NULL,
        theoretical_quantity numeric(14, 4) NOT NULL,
        counted_quantity numeric(14, 4) NOT NULL,
        counted_at timestamptz,
        actor_label varchar,
        notes varchar,
        is_disputed boolean NOT NULL DEFAULT false,
        is_approved boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_count_session_entries_tenant_session_line_entry
          UNIQUE (tenant_id, session_id, line_id, entry_index),
        CONSTRAINT fk_count_session_entries_session
          FOREIGN KEY (tenant_id, session_id)
          REFERENCES ${header} (tenant_id, id),
        CONSTRAINT fk_count_session_entries_insumo
          FOREIGN KEY (tenant_id, insumo_id) REFERENCES insumos (tenant_id, id)
      )
    `);

    // RLS, both tables: they carry their own uuid tenant_id, so both are
    // classified `direct`. The header mutates -> SIUD; the entries are
    // append-only evidence -> SI only. The predicate form is resolved through
    // the shared seam so it matches the tenant column AS IT IS.
    for (const table of [header, entries]) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }

    const headerPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      header,
    );
    const entriesPredicate = await resolveTenantRlsPredicate(
      queryRunner,
      entries,
    );

    const headerPolicies = [
      ['select', `FOR SELECT USING (${headerPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${headerPredicate})`],
      [
        'update',
        `FOR UPDATE USING (${headerPredicate}) WITH CHECK (${headerPredicate})`,
      ],
      ['delete', `FOR DELETE USING (${headerPredicate})`],
    ] as const;

    for (const [operation, clause] of headerPolicies) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${header}'
              AND policyname = '${header}_tenant_${operation}'
          ) THEN
            CREATE POLICY ${header}_tenant_${operation} ON ${header}
            ${clause};
          END IF;
        END;
        $$
      `);
    }

    const entriesPolicies = [
      ['select', `FOR SELECT USING (${entriesPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${entriesPredicate})`],
    ] as const;

    for (const [operation, clause] of entriesPolicies) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${entries}'
              AND policyname = '${entries}_tenant_${operation}'
          ) THEN
            CREATE POLICY ${entries}_tenant_${operation} ON ${entries}
            ${clause};
          END IF;
        END;
        $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const header = CreateCountSessions1809960000000.HEADER;
    const entries = CreateCountSessions1809960000000.ENTRIES;

    // Count entries are the evidence behind the signed lists (`R-05`), so a
    // populated table is refused rather than dropped silently — the same
    // guard the house uses for its other history tables
    // (1802000000000-CreateProductInventoryMappingVersions). FORCE RLS would
    // hide the rows from this count, so RLS is lifted locally to inspect the
    // true row count and restored before refusing.
    await queryRunner.query(`
      ALTER TABLE ${entries} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${entries} DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${entries} LIMIT 1) THEN
          ALTER TABLE ${entries} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${entries} FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove count_session_entries: count evidence exists';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${entries}`);

    await queryRunner.query(`
      ALTER TABLE ${header} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${header} DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${header} LIMIT 1) THEN
          ALTER TABLE ${header} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${header} FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove count_sessions: session history exists';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${header}`);
  }
}
