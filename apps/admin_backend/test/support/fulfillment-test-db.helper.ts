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
  //
  // `users` carries the post-migration shape the identity flow needs. In
  // particular `hashed_refresh_token` comes from the bootstrap migration
  // 1759000000001 itself (no later migration ever adds it: 1783000000000 only
  // adds security_version/refresh_token_family_id/refresh_token_revoked_at),
  // so it MUST exist in the CREATE plus the idempotent ALTER fallback below
  // (mirroring the tenants ALTERs) — when fulfillment/* suites seed
  // public.users ahead of the onboarding/seed suites, 1759000000001's whole
  // `CREATE TABLE IF NOT EXISTS` is skipped and the column would otherwise be
  // missing, breaking login/refresh-token flows in later suites.
  await runner.query(`
    CREATE TABLE IF NOT EXISTS public.tenants (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      slug varchar NOT NULL,
      ruc varchar(32),
      phone varchar,
      email varchar,
      address varchar,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug varchar;
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS phone varchar;
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS email varchar;
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address varchar;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON public.tenants (slug);
    ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;

    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hashed_refresh_token varchar;

    CREATE TABLE IF NOT EXISTS public.users (
      id varchar(64) PRIMARY KEY,
      tenant_id varchar(64) NOT NULL,
      name varchar(255) NOT NULL,
      email varchar(255) NOT NULL,
      role varchar(32) NOT NULL,
      password_hash varchar(255) NOT NULL DEFAULT '',
      hashed_refresh_token varchar,
      is_active boolean NOT NULL DEFAULT true,
      security_version int NOT NULL DEFAULT 1,
      attempt_reset_generation bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
