import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap the sales-hardware table that exists only as a TypeORM entity
 * declaration and that no migration in the history ever creates.
 *
 * Why this exists: `datafonos_equipos` (card-terminal equipment registry) was
 * provisioned in existing environments with TypeORM `synchronize` before the
 * migration history started. Building the schema from an empty database left
 * the table missing, so the schema build never matched the entity
 * declarations. No later migration alters this table, so the entity
 * declaration is the source of truth for the whole shape.
 *
 * Idempotency is mandatory and not optional: existing environments already
 * hold this table without a ledger row for this timestamp, so TypeORM treats
 * this migration as pending there. The `CREATE TABLE IF NOT EXISTS` body —
 * including constraints and foreign keys — is skipped when the table is
 * already present, and every index uses `IF NOT EXISTS`.
 */
export class CreateBootstrapSalesTables1759000000005
  implements MigrationInterface
{
  name = 'CreateBootstrapSalesTables1759000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS datafonos_equipos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        nombre varchar(100) NOT NULL,
        banco_adquirente varchar(50) NOT NULL,
        numero_afiliacion varchar(50) NOT NULL,
        terminal_id_banco varchar(50) NOT NULL,
        tipo_conexion varchar(30) NOT NULL DEFAULT 'AISLADO',
        ip_address varchar(50),
        port integer,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_datafonos_equipos_tenant ON datafonos_equipos (tenant_id)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_datafonos_equipos_tenant_terminal ON datafonos_equipos (tenant_id, terminal_id_banco)',
    );
  }

  /**
   * Reverses only what a bootstrap could have created, and refuses to destroy
   * data: terminal registrations reference real bank affiliations and must
   * never be dropped silently. A freshly bootstrapped database has no rows,
   * so the normal rollback path stays available.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.datafonos_equipos') IS NOT NULL THEN
          IF EXISTS (SELECT 1 FROM public.datafonos_equipos LIMIT 1) THEN
            RAISE EXCEPTION
              'Refusing to drop table datafonos_equipos because it holds rows; remove the data deliberately first';
          END IF;
        END IF;
      END
      $$;
    `);

    await queryRunner.query('DROP TABLE IF EXISTS datafonos_equipos');
  }
}
