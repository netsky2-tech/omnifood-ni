import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveTenantRlsPredicate } from '../core/database/tenant-rls-policy';

/**
 * Creates device_linking_codes for pre-auth device linking (issue #556
 * stage 3, founder design): before any login attempt the device LINKS to its
 * tenant by exchanging a single-use, short-expiry 6-character code for the
 * tenant binding (tenantId + persisted slug). The slug stays pre-auth
 * context, never authority; no permissive login RLS policy exists or is
 * needed for it.
 *
 * Why the first OR-branch policy in this repository (reviewed, founder
 * approval 2026-09-24)
 * -----------------------------
 * Every pre-auth seam so far is DECLARATIVE-TENANT: the client already knows
 * its tenant id (device-sync token renewal binds app.tenant_id from the
 * declarative tenant before its SELECT), or the lookup lives on a global
 * pre-tenant table (tenants.slug). Neither shape fits the linking claim: the
 * whole point of the code is that the device knows NOTHING pre-login, so the
 * bcrypt compare must run over the bounded candidate set across tenants.
 * A global classification is impossible — the gate fails any tenant-bearing
 * global table (tenant-bearing-global), and the founder column set mandates
 * tenant_id uuid NOT NULL REFERENCES tenants(id). The minimal consistent
 * mechanism is therefore a NARROW claim branch on this table's policies:
 *
 *   USING (tenant_id = current_setting('app.tenant_id', true)::uuid
 *          OR current_setting('app.linking_claim', true) = 'on')
 *
 * Invariants of the branch:
 * - It appears ONLY in the SELECT USING and the UPDATE USING/WITH CHECK
 *   halves. INSERT and DELETE keep the pure tenant predicate, so the claim
 *   transaction can never write or remove rows and generation stays
 *   strictly tenant-bound.
 * - The flag is a TRANSACTION-LOCAL set_config issued by DeviceLinkingService
 *   inside the claim transaction only. It is NEVER accepted from client
 *   input, never session-scoped, and can never leak across pooled
 *   connections: PostgreSQL discards it at commit/rollback.
 * - The tenant predicate remains in every expression, so the schema-build
 *   invariants hold (policy expressions reference app.tenant_id; uuid-form
 *   predicate preserved) and tenant-bound operations behave exactly like
 *   every other direct table.
 * - The claim still grants nothing but the binding: single-use is enforced
 *   by a conditional UPDATE ... WHERE status = 'ACTIVE' at the SQL level,
 *   and the response exposes only tenantId, slug, deviceId, linkedAt.
 *
 * Contract
 * --------
 * - code_hash is the bcrypt digest (cost 10) of the NORMALIZED plaintext
 *   code; no plaintext column exists.
 * - status lifecycle: ACTIVE -> CLAIMED (claim), or EXPIRED/REVOKED by
 *   explicit maintenance. Expired rows are unreachable through the claim
 *   predicate (expires_at > now()) even before cleanup runs.
 * - Indexes: (tenant_id, status) for the human-auth tenant view, expires_at
 *   for cleanup sweeps, and the partial unique index uq_device_linking_codes_active_hash
 *   on (code_hash) WHERE status = 'ACTIVE': the same plaintext can never be
 *   ACTIVE in two tenants at once, so a random collision can never mis-bind
 *   a claimant to the lowest-id matching tenant (the claim scan picks the
 *   first match; with the index, there is at most one). Generation retries
 *   deterministically on collision (bounded loop in DeviceLinkingService).
 * - Idempotent for the partial-ledger scenario (guarded CREATE POLICY,
 *   IF NOT EXISTS everywhere); down() drops the table and its policies.
 */
export class CreateDeviceLinkingCodes1809360000000 implements MigrationInterface {
  name = 'CreateDeviceLinkingCodes1809360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_linking_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        code_hash varchar(255) NOT NULL,
        status varchar(64) NOT NULL DEFAULT 'ACTIVE',
        device_id varchar(128) NULL,
        created_by_user_id varchar(128) NOT NULL,
        expires_at timestamptz NOT NULL,
        claimed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_device_linking_codes_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_device_linking_codes_tenant_status
        ON device_linking_codes (tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_device_linking_codes_expires_at
        ON device_linking_codes (expires_at);

      -- Partial unique: only ACTIVE rows compete, so a CLAIMED/EXPIRED row
      -- never blocks a fresh code with the same plaintext (verified by the
      -- db spec: duplicate ACTIVE inserts are rejected, post-claim reuse is
      -- allowed).
      CREATE UNIQUE INDEX IF NOT EXISTS uq_device_linking_codes_active_hash
        ON device_linking_codes (code_hash) WHERE status = 'ACTIVE';

      -- FORCE ROW LEVEL SECURITY keeps the tenant boundary authoritative for
      -- every role, including the table owner. The claim branch below is the
      -- only pre-auth read/write seam and is scoped exactly as documented.
      ALTER TABLE device_linking_codes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE device_linking_codes FORCE ROW LEVEL SECURITY;
    `);

    // The table resolves its OWN predicate from the catalog: the migration
    // must emit the form that matches the column type AS IT IS, so partial
    // ledger re-runs and future type rebinds stay correct.
    const predicate = await resolveTenantRlsPredicate(
      queryRunner,
      'device_linking_codes',
    );
    const claimPredicate = `(${predicate} OR current_setting('app.linking_claim', true) = 'on')`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_linking_codes'
            AND policyname = 'device_linking_codes_tenant_select'
        ) THEN
          CREATE POLICY device_linking_codes_tenant_select ON device_linking_codes
            FOR SELECT USING (${claimPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_linking_codes'
            AND policyname = 'device_linking_codes_tenant_insert'
        ) THEN
          CREATE POLICY device_linking_codes_tenant_insert ON device_linking_codes
            FOR INSERT WITH CHECK (${predicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_linking_codes'
            AND policyname = 'device_linking_codes_tenant_update'
        ) THEN
          CREATE POLICY device_linking_codes_tenant_update ON device_linking_codes
            FOR UPDATE USING (${claimPredicate})
            WITH CHECK (${claimPredicate});
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = current_schema()
            AND tablename = 'device_linking_codes'
            AND policyname = 'device_linking_codes_tenant_delete'
        ) THEN
          CREATE POLICY device_linking_codes_tenant_delete ON device_linking_codes
            FOR DELETE USING (${predicate});
        END IF;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_device_linking_codes_active_hash;
      DROP TABLE IF EXISTS device_linking_codes CASCADE;
    `);
  }
}
