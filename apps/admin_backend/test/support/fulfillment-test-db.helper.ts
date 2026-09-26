import { QueryRunner } from 'typeorm';

export async function ensurePublicAuthTables(
  runner: QueryRunner,
): Promise<void> {
  // `tenants` here models the migrated public table, so it carries the slice 11
  // slug column exactly like 1809350000000-AddTenantSlug: NOT NULL with the
  // `uq_tenants_slug` unique index. The extra ALTER ... ADD COLUMN IF NOT
  // EXISTS keeps the helper idempotent against a pre-existing public.tenants
  // created by an older snapshot of this DDL (fresh CI creates the table with
  // slug already; a dev database migrated before slice 11 gets the column
  // added without rewriting existing rows).
  await runner.query(`
    CREATE TABLE IF NOT EXISTS public.tenants (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      slug varchar NOT NULL,
      ruc varchar(32),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON public.tenants (slug);
    ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;

    CREATE TABLE IF NOT EXISTS public.users (
      id varchar(64) PRIMARY KEY,
      tenant_id varchar(64) NOT NULL,
      name varchar(255) NOT NULL,
      email varchar(255) NOT NULL,
      role varchar(32) NOT NULL,
      password_hash varchar(255) NOT NULL DEFAULT '',
      is_active boolean NOT NULL DEFAULT true,
      security_version int NOT NULL DEFAULT 1,
      attempt_reset_generation bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
