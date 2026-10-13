import { MigrationInterface, QueryRunner } from 'typeorm';
import { UOM_CATALOG } from '../modules/inventory/uom-catalog';

/**
 * Zona A (S1/S2): platform units-of-measure catalog.
 *
 * A PLATFORM-GLOBAL table (no tenant_id): universal units carry exact
 * physical anchors (mass → g, volume → ml, count → unidad) while container
 * and serving units deliberately carry NULL — their conversion to a physical
 * unit is per-insumo business data (the insumo's conversionFactor = content
 * declaration), never a platform constant and never a seeder default.
 *
 * Rows are seeded from the UOM_CATALOG protocol constant (single source:
 * src/modules/inventory/uom-catalog.ts) — the table exists so the catalog is
 * queryable and referentially visible, not so it can drift per environment.
 * Idempotent: ON CONFLICT (code) DO NOTHING.
 *
 * Rollback: drops the table. The constant remains the protocol source.
 */
export class CreateUomCatalog1809850000000 implements MigrationInterface {
  name = 'CreateUomCatalog1809850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS uom_catalog (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar NOT NULL UNIQUE,
        name varchar NOT NULL,
        dimension varchar NOT NULL CHECK (
          dimension IN ('mass', 'volume', 'count', 'container', 'serving')
        ),
        factor_to_anchor numeric(18, 8),
        aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const entry of UOM_CATALOG) {
      await queryRunner.query(
        `INSERT INTO uom_catalog (code, name, dimension, factor_to_anchor, aliases)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (code) DO NOTHING`,
        [
          entry.code,
          entry.name,
          entry.dimension,
          entry.factorToAnchor,
          JSON.stringify(entry.aliases),
        ],
      );
    }

    // S2: container/serving rows must never acquire a platform factor.
    const bad = (await queryRunner.query(
      `SELECT count(*)::int AS total FROM uom_catalog
        WHERE dimension IN ('container', 'serving')
          AND factor_to_anchor IS NOT NULL`,
    )) as Array<{ total: number }>;
    if (Number(bad[0].total) > 0) {
      throw new Error(
        'UOM_CATALOG drift: container/serving entries must not carry a factor_to_anchor',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS uom_catalog`);
  }
}
