import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * S9 (L33) — the client's own market price, with its date.
 *
 * R-01 (Ley 822 art. 44) requires inventory to be valued at the lower of
 * acquisition cost or MARKET PRICE. Until now the system had no market price
 * at all: it only ever knew its own cost. That is why the reference used to be
 * "the last purchase cost" by necessity rather than by choice.
 *
 * The owner's decision (L33) makes the market price a FIRST-CLASS input the
 * client owns, carrying its own date, and keeps the last purchase cost only as
 * a DECLARED fallback for when the client has not defined one — so the
 * approximation is the client's responsibility for lack of its own
 * information, instead of a system limitation dressed up as compliance.
 *
 * Why a table and not two columns on `insumos`: the price carries a DATE and
 * the reference is "the most recent price not later than the closing date".
 * That is a series, and a single pair of columns would keep only the latest
 * value — making a past period's writedown unexplainable after one new price
 * arrives.
 *
 * `effective_date` is a `date` column, never a timestamp: it is a calendar day
 * on the client's own terms, and the codebase reads `date` columns as ISO
 * strings end to end (src/core/database/calendar-day.ts). The "not later than"
 * comparison is then a plain string comparison on ISO days.
 *
 * Tenant-scoped from birth: `tenant_id` is uuid, so the RLS coverage ratchet
 * classifies it `direct:SIUD` in
 * scripts/schema-rls-coverage-manifest.txt — an entry that MUST be added with
 * this table, because scripts/verify-schema-build.sh and
 * tenant-rls-coverage.db.spec.ts both evaluate that manifest and a table
 * missing from it breaks the gate. The tenant-type manifest
 * (schema-tenant-type-manifest.txt) only tracks tenant columns that are NOT
 * uuid, so a uuid `tenant_id` needs no entry there.
 *
 * The composite tenant FK (tenant_id, insumo_id) → insumos (tenant_id, id)
 * makes a cross-tenant row impossible; insumos already carries
 * uq_insumos_tenant_insumo_id.
 */
export class CreateInsumoMarketPrices1809940000000 implements MigrationInterface {
  name = 'CreateInsumoMarketPrices1809940000000';

  private static readonly TABLE = 'insumo_market_prices';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = CreateInsumoMarketPrices1809940000000.TABLE;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        insumo_id uuid NOT NULL,
        market_price_nio numeric(14, 4) NOT NULL,
        effective_date date NOT NULL,
        source_note varchar,
        created_by_user_id varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_insumo_market_prices_non_negative
          CHECK (market_price_nio >= 0),
        CONSTRAINT uq_insumo_market_prices_tenant_insumo_date
          UNIQUE (tenant_id, insumo_id, effective_date),
        CONSTRAINT uq_insumo_market_prices_tenant_id
          UNIQUE (tenant_id, id),
        CONSTRAINT fk_insumo_market_prices_insumo
          FOREIGN KEY (tenant_id, insumo_id) REFERENCES insumos (tenant_id, id)
      )
    `);

    // RLS: the table carries its own tenant_id, so it is classified `direct`
    // with a full per-command policy set. The predicate form is resolved
    // through the shared seam, so a later column-type change emits the form
    // that matches the column AS IT IS.
    await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    const tenantPredicate = await resolveTenantRlsPredicate(queryRunner, table);

    const policies = [
      ['select', `FOR SELECT USING (${tenantPredicate})`],
      ['insert', `FOR INSERT WITH CHECK (${tenantPredicate})`],
      [
        'update',
        `FOR UPDATE USING (${tenantPredicate}) WITH CHECK (${tenantPredicate})`,
      ],
      ['delete', `FOR DELETE USING (${tenantPredicate})`],
    ] as const;

    for (const [operation, clause] of policies) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = '${table}'
              AND policyname = '${table}_tenant_${operation}'
          ) THEN
            CREATE POLICY ${table}_tenant_${operation} ON ${table}
            ${clause};
          END IF;
        END;
        $$
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = CreateInsumoMarketPrices1809940000000.TABLE;

    // A market price is the evidence of the reference a writedown used, so a
    // populated table is refused rather than dropped silently — the same guard
    // the house uses for its other history tables
    // (1802000000000-CreateProductInventoryMappingVersions). FORCE RLS would
    // hide the rows from this count, so RLS is lifted locally to inspect the
    // true row count.
    await queryRunner.query(`
      ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${table} LIMIT 1) THEN
          ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
          RAISE EXCEPTION 'refusing to remove insumo_market_prices: valuation evidence exists';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
