import { QueryRunner } from 'typeorm';

export async function ensurePublicAuthTables(runner: QueryRunner): Promise<void> {
  await runner.query(`
    CREATE TABLE IF NOT EXISTS public.tenants (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      ruc varchar(32),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.users (
      id varchar(64) PRIMARY KEY,
      tenant_id varchar(64) NOT NULL,
      name varchar(255) NOT NULL,
      email varchar(255) NOT NULL,
      role varchar(32) NOT NULL,
      password_hash varchar(255) NOT NULL DEFAULT '',
      is_active boolean NOT NULL DEFAULT true,
      security_version int NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
