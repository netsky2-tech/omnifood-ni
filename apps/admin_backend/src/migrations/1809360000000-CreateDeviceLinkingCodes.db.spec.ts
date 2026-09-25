import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { CreateDeviceLinkingCodes1809360000000 } from './1809360000000-CreateDeviceLinkingCodes';
import {
  CLAIM_LINKING_CODE_SQL,
  asQueryRows,
} from '../modules/onboarding/services/device-linking.service';

/**
 * Real-PostgreSQL contract for the device linking codes migration (issue
 * #556 stage 3): migration-built schema reversibility, idempotent
 * re-application, the policy command/branch placement, and the SQL-level
 * single-use guarantee of the conditional claim UPDATE.
 *
 * The migration is exercised in isolation against a scratch schema holding
 * the minimal `tenants` shape the FK references, so the spec proves the
 * migration's own behavior without depending on the full bootstrap ledger.
 */

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const TENANTS_DDL = (schema: string) => `
  CREATE TABLE "${schema}".tenants (
    id uuid PRIMARY KEY,
    name varchar NOT NULL,
    slug varchar,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
`;

async function withFreshSchema(
  work: (dataSource: DataSource, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `linking_codes_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  let dataSource: DataSource | null = null;
  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(TENANTS_DDL(schema));

    // search_path is pinned per connection (the same recipe as
    // 1809350000000-AddTenantSlug.db.spec.ts): pooled connections and
    // migration QueryRunners all resolve the unqualified table names in the
    // migration SQL to the scratch schema.
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();

    await work(dataSource, schema);
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

const runUp = (dataSource: DataSource) =>
  new CreateDeviceLinkingCodes1809360000000().up(
    dataSource.createQueryRunner(),
  );

const runDown = (dataSource: DataSource) =>
  new CreateDeviceLinkingCodes1809360000000().down(
    dataSource.createQueryRunner(),
  );

interface PolicyRow {
  policyname: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

const readPolicies = async (dataSource: DataSource): Promise<PolicyRow[]> =>
  await dataSource.query(
    `SELECT policyname, cmd, qual, with_check FROM pg_policies
      WHERE schemaname = current_schema() AND tablename = 'device_linking_codes'
      ORDER BY policyname`,
  );

// pg_policies deparses expressions with its own spelling (it renders the
// setting as current_setting('app.tenant_id'::text, true)::uuid), so the
// spec judges the deparse-tolerant facts: the tenant setting plus the uuid
// cast in the expression, and the reviewed branch presence — never the
// exact source string.
const hasTenantPredicate = (expression: string): boolean =>
  expression.includes('app.tenant_id') && expression.includes('::uuid');

const hasClaimBranch = (expression: string): boolean =>
  expression.includes('app.linking_claim');

describe('CreateDeviceLinkingCodes1809360000000 (db)', () => {
  it(
    'builds the table with FORCE RLS and the exact policy/branch placement, ' +
      'and re-applies idempotently',
    async () => {
      await withFreshSchema(async (dataSource) => {
        await runUp(dataSource);
        await expect(runUp(dataSource)).resolves.toBeUndefined();

        const policies = await readPolicies(dataSource);
        expect(policies.map((p) => `${p.policyname}:${p.cmd}`).sort()).toEqual([
          'device_linking_codes_tenant_delete:DELETE',
          'device_linking_codes_tenant_insert:INSERT',
          'device_linking_codes_tenant_select:SELECT',
          'device_linking_codes_tenant_update:UPDATE',
        ]);

        for (const policy of policies) {
          // Every expression still carries the tenant predicate: the branch
          // is additive, never a replacement for tenant scoping.
          if (policy.qual !== null) {
            expect(hasTenantPredicate(policy.qual)).toBe(true);
          }
          if (policy.with_check !== null) {
            expect(hasTenantPredicate(policy.with_check)).toBe(true);
          }

          if (policy.policyname.endsWith('_select')) {
            expect(hasClaimBranch(policy.qual)).toBe(true);
            expect(policy.with_check).toBeNull();
          }
          if (policy.policyname.endsWith('_insert')) {
            expect(hasClaimBranch(policy.with_check)).toBe(false);
            expect(policy.qual).toBeNull();
          }
          if (policy.policyname.endsWith('_update')) {
            expect(hasClaimBranch(policy.qual)).toBe(true);
            expect(hasClaimBranch(policy.with_check)).toBe(true);
          }
          if (policy.policyname.endsWith('_delete')) {
            expect(hasClaimBranch(policy.qual)).toBe(false);
            expect(policy.with_check).toBeNull();
          }
        }
      });
    },
    30_000,
  );

  it('is reversible: down removes the table, up rebuilds it with policies', async () => {
    await withFreshSchema(async (dataSource) => {
      await runUp(dataSource);
      await runDown(dataSource);

      const afterDown = await dataSource.query(
        `SELECT count(*)::int AS count FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = 'device_linking_codes'`,
      );
      expect(afterDown[0].count).toBe(0);

      await runUp(dataSource);
      const policies = await readPolicies(dataSource);
      expect(policies).toHaveLength(4);
    });
  }, 30_000);

  it(
    'enforces single-use at the SQL level: the conditional claim UPDATE ' +
      'claims exactly once and never re-claims or claims expired rows',
    async () => {
      await withFreshSchema(async (dataSource) => {
        await runUp(dataSource);

        const tenantId = randomUUID();
        await dataSource.query(
          `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant Uno', 'tenant-uno')`,
          [tenantId],
        );

        const liveCodeHash = await bcrypt.hash('ABCD23', 4);
        const otherCodeHash = await bcrypt.hash('WXYZ89', 4);
        await dataSource.query(
          `INSERT INTO device_linking_codes
             (tenant_id, code_hash, status, created_by_user_id, expires_at)
           VALUES ($1, $2, 'ACTIVE', 'user-9', now() + interval '15 minutes'),
                  ($1, $3, 'ACTIVE', 'user-9', now() - interval '1 minute'),
                  ($1, $3, 'CLAIMED', 'user-9', now() + interval '15 minutes'),
                  ($1, $3, 'REVOKED', 'user-9', now() + interval '15 minutes')`,
          [tenantId, liveCodeHash, otherCodeHash],
        );

        const liveCodeId = (
          await dataSource.query(
            `SELECT id FROM device_linking_codes WHERE code_hash = $1`,
            [liveCodeHash],
          )
        )[0].id as string;

        const expiredCodeId = (
          await dataSource.query(
            `SELECT id FROM device_linking_codes WHERE code_hash = $1 AND status = 'ACTIVE'
              AND expires_at < now()`,
            [otherCodeHash],
          )
        )[0].id as string;

        // Expired rows are never claimable, even by direct id.
        //
        // The claim runs through a transaction manager — the exact runtime
        // shape the service uses (the repo precedent treats manager.query
        // with RETURNING as the flat rows array; DataSource.query outside a
        // transaction returns a different raw shape and is deliberately not
        // used for the claim contract here).
        const first = asQueryRows<{ tenant_id: string }>(
          await dataSource.transaction(async (manager) =>
            manager.query(CLAIM_LINKING_CODE_SQL, [liveCodeId, 'POS-01']),
          ),
        );
        expect(first).toHaveLength(1);
        expect(first[0].tenant_id).toBe(tenantId);

        const expiredClaim = asQueryRows<unknown>(
          await dataSource.transaction(async (manager) =>
            manager.query(CLAIM_LINKING_CODE_SQL, [expiredCodeId, 'POS-01']),
          ),
        );
        expect(expiredClaim).toHaveLength(0);

        // The stored row records the claim.
        const claimedRow = (
          await dataSource.query(
            `SELECT status, device_id, claimed_at FROM device_linking_codes WHERE id = $1`,
            [liveCodeId],
          )
        )[0];
        expect(claimedRow.status).toBe('CLAIMED');
        expect(claimedRow.device_id).toBe('POS-01');
        expect(claimedRow.claimed_at).not.toBeNull();

        // Second claim of the same row matches zero rows: single-use.
        const second = asQueryRows<unknown>(
          await dataSource.transaction(async (manager) =>
            manager.query(CLAIM_LINKING_CODE_SQL, [liveCodeId, 'POS-02']),
          ),
        );
        expect(second).toHaveLength(0);
      });
    },
    30_000,
  );

  it('rejects a duplicate ACTIVE code_hash (partial unique index) and allows reuse after the code is claimed', async () => {
    await withFreshSchema(async (dataSource) => {
      await runUp(dataSource);

      const tenantId = randomUUID();
      await dataSource.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant Uno', 'tenant-uno')`,
        [tenantId],
      );

      const sharedHash = await bcrypt.hash('ABCD23', 4);
      await dataSource.query(
        `INSERT INTO device_linking_codes
             (tenant_id, code_hash, status, created_by_user_id, expires_at)
           VALUES ($1, $2, 'ACTIVE', 'user-9', now() + interval '15 minutes')`,
        [tenantId, sharedHash],
      );

      // A second ACTIVE row with the same plaintext is rejected: the
      // partial unique index makes cross-tenant ACTIVE collisions
      // impossible, so the claim scan can never mis-bind.
      await expect(
        dataSource.query(
          `INSERT INTO device_linking_codes
               (tenant_id, code_hash, status, created_by_user_id, expires_at)
             VALUES ($1, $2, 'ACTIVE', 'user-9', now() + interval '15 minutes')`,
          [tenantId, sharedHash],
        ),
      ).rejects.toThrow(/uq_device_linking_codes_active_hash|duplicate key/);

      // Claim the first row: the partial index only constrains ACTIVE
      // rows, so the same plaintext may be minted fresh again.
      const liveCodeId = (
        await dataSource.query(
          `SELECT id FROM device_linking_codes WHERE code_hash = $1`,
          [sharedHash],
        )
      )[0].id as string;
      await dataSource.transaction(async (manager) =>
        manager.query(CLAIM_LINKING_CODE_SQL, [liveCodeId, 'POS-01']),
      );

      await expect(
        dataSource.query(
          `INSERT INTO device_linking_codes
               (tenant_id, code_hash, status, created_by_user_id, expires_at)
             VALUES ($1, $2, 'ACTIVE', 'user-9', now() + interval '15 minutes')`,
          [tenantId, sharedHash],
        ),
      ).resolves.toBeDefined();
    });
  }, 30_000);
});
