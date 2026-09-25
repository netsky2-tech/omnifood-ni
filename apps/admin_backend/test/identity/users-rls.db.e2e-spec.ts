import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { AuthService } from '../../src/modules/identity/services/auth.service';
import type { IdentityJwtConfig } from '../../src/modules/identity/config/identity-jwt.config';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #556 stage 12d: tenant isolation for the identity boundary itself —
 * `users` ENABLE + FORCE row level security with the four command policies.
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809370000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * Every runtime-role observation runs inside a transaction that binds the
 * tenant context with the production SQL (TENANT_CONTEXT_SET_CONFIG_SQL,
 * transaction-local) and is then ROLLED BACK: the GUC is discarded with the
 * transaction, so the pool is never left with a defined-and-empty
 * `app.tenant_id` (the issue #358 poisoning), and the runtime role never
 * mutates the fixtures — with ONE deliberate exception: the bound login
 * proof COMMITS the rotated refresh-session columns (hashed_refresh_token /
 * refresh_token_family_id) on its own-tenant row, because the stage-12d
 * contract being proven is exactly that bound write path. An insert
 * "success" is proven inside its own transaction — the statement returning
 * a row IS the WITH CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `users.tenant_id` is `uuid NOT NULL` with a real FK to tenants(id);
 *   `users.role` is the users_role_enum NOT NULL, so seeded users carry
 *   'OWNER'.
 * - `uq_users_email` stays GLOBAL (founder decision): the cross-tenant login
 *   proof below depends on the tenant-B email being globally unique but
 *   INVISIBLE to a tenant-A-bound connection — only the policy hides it.
 * - Every other non-key column has a default or is nullable, so the minimal
 *   insert proofs fail (or pass) on RLS alone, never on a missing NOT NULL.
 * - The bound login proof runs the REAL AuthService (slug -> bind -> read)
 *   against the migration-built schema through the runtime role, so the
 *   stage-12d contract is proven end-to-end, not against mocks.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

const jwtConfig: IdentityJwtConfig = {
  secret: 'test-only-jwt-secret-with-at-least-thirty-two-bytes',
  issuer: 'omnifood-admin-test',
  audience: 'omnifood-pos-test',
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 604800,
  clockToleranceSeconds: 5,
  algorithm: 'HS256',
};

/**
 * Runs `assertion` on the runtime role inside a rolled-back transaction,
 * bound to `tenantId` through the production set_config binding (or
 * genuinely unbound when `tenantId` is null).
 */
async function asRuntimeRole<T>(
  runtime: DataSource,
  tenantId: string | null,
  assertion: (
    runner: ReturnType<DataSource['createQueryRunner']>,
  ) => Promise<T>,
): Promise<T> {
  const runner = runtime.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    if (tenantId !== null) {
      await runner.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]);
    }
    return await assertion(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

/**
 * TypeORM's postgres query runner hands DML-with-RETURNING results back as
 * `[rows, affectedRowCount]` while SELECTs arrive as a plain rows array.
 * Normalizes both shapes to the rows array so assertions read on `id`.
 */
function returningRows(result: unknown): Array<{ id: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('users tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded users; C and D are fresh synthetic tenant
  // contexts for the INSERT proofs. Tenants exist as real rows — users
  // carries a real FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Two users per tenant A and B (owner + staff), one for C (the own-tenant
  // INSERT proof).
  const userA1Id = randomUUID();
  const userA2Id = randomUUID();
  const userB1Id = randomUUID();
  const userB2Id = randomUUID();
  const userCId = randomUUID();

  const password = 'Password123!';

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${schema},public`,
      },
    });
    await admin.initialize();

    // Real tenant rows first: users carry a real FK to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'users-rls-tenant-a',
        tenantBId,
        'users-rls-tenant-b',
        tenantCId,
        'users-rls-tenant-c',
        tenantDId,
        'users-rls-tenant-d',
        normalizeTenantSlug('users-rls-tenant-a'),
        normalizeTenantSlug('users-rls-tenant-b'),
        normalizeTenantSlug('users-rls-tenant-c'),
        normalizeTenantSlug('users-rls-tenant-d'),
      ],
    );

    // Two users per tenant A and B with REAL password hashes so the bound
    // login proof exercises the full authentication flow. One user for C
    // (the own-tenant INSERT proof target).
    const passwordHash = await bcrypt.hash(password, 4);
    await admin.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, 'Owner A1', $3, $8, 'OWNER'),
              ($4, $2, 'Staff A2', $5, $8, 'CASHIER'),
              ($6, $7, 'Owner B1', $9, $8, 'OWNER'),
              ($10, $7, 'Staff B2', $11, $8, 'CASHIER'),
              ($12, $13, 'Owner C', $14, $8, 'OWNER')`,
      [
        userA1Id,
        tenantAId,
        'owner-a1@users-rls.test',
        userA2Id,
        'staff-a2@users-rls.test',
        userB1Id,
        tenantBId,
        passwordHash,
        'owner-b1@users-rls.test',
        userB2Id,
        'staff-b2@users-rls.test',
        userCId,
        tenantCId,
        'owner-c@users-rls.test',
      ],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation. The
    // identity entities are registered so the bound login proof exercises
    // the exact repository shapes AuthService uses — never raw SQL
    // stand-ins. Metadata only: no synchronize and no migrations.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [User, SecurityProfile, Tenant],
      ...poolCleanupExtra,
    });
    await runtime.initialize();
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('seeds the tenants through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM tenants) AS tenants,
              (SELECT count(*)::int FROM users) AS users`,
    );
    expect(seeded[0]).toEqual({ tenants: 4, users: 5 });

    const role = (
      await admin.query(
        `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [fixture.runtimeRoleName],
      )
    )[0];
    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);

    const ownership = await admin.query(
      `SELECT count(*)::int AS count
         FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('users')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security with exactly one command-specific policy per command (4 total)', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('users')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'users', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('users')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies: an extra policy would widen access
    // beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      { tablename: 'users', policyname: 'users_tenant_delete', cmd: 'DELETE' },
      { tablename: 'users', policyname: 'users_tenant_insert', cmd: 'INSERT' },
      { tablename: 'users', policyname: 'users_tenant_select', cmd: 'SELECT' },
      { tablename: 'users', policyname: 'users_tenant_update', cmd: 'UPDATE' },
    ]);

    // Every defined expression is the plain tenant_id predicate with the
    // uuid-cast setting form (users.tenant_id is uuid, correct post-rebind).
    const exprs: Array<{
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }> = await admin.query(
      `SELECT policyname, qual, with_check FROM pg_policies
        WHERE schemaname = $1 AND tablename = 'users'
        ORDER BY policyname`,
      [schema],
    );
    for (const expr of exprs) {
      for (const half of [expr.qual, expr.with_check]) {
        if (half === null) continue;
        expect(half).toContain('tenant_id');
        // PostgreSQL deparses the setting with an implicit ::text cast on
        // the literal; assert on the stable prefix, never on the exact
        // written spelling.
        expect(half).toContain("current_setting('app.tenant_id'");
        expect(half).toContain('::uuid');
      }
    }

    // Vacuity guards: each command's half is actually DEFINED — a policy
    // whose only half were null would be a deny-all silent trap.
    const byName = new Map(exprs.map((e) => [e.policyname, e] as const));
    expect(byName.get('users_tenant_select')?.qual).not.toBeNull();
    expect(byName.get('users_tenant_insert')?.with_check).not.toBeNull();
    expect(byName.get('users_tenant_update')?.qual).not.toBeNull();
    expect(byName.get('users_tenant_update')?.with_check).not.toBeNull();
    expect(byName.get('users_tenant_delete')?.qual).not.toBeNull();
  });

  it('denies an unbound runtime role every row of the table (deny-all teeth)', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const users = (await runner.query(
        `SELECT count(*)::int AS count FROM users`,
      )) as Array<{ count: number }>;
      expect(users[0].count).toBe(0);
    });
  });

  it('an unbound TypeORM repository SELECT sees zero users rows (RLS teeth on the pooled-repo shape)', async () => {
    // The regression for the removed legacy paths: the pooled repository
    // shape (no transaction, no binding) must return ZERO rows, never a
    // cross-tenant leak.
    const users = await runtime.getRepository(User).find();
    expect(users).toEqual([]);
  });

  it('shows tenant A only its own users, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const users = (await runner.query(
        `SELECT id FROM users ORDER BY name`,
      )) as Array<{ id: string }>;
      expect(users.map((r) => r.id).sort()).toEqual(
        [userA1Id, userA2Id].sort(),
      );
    });
  });

  it('shows tenant B only its own users (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const users = (await runner.query(
        `SELECT id FROM users ORDER BY name`,
      )) as Array<{ id: string }>;
      expect(users.map((r) => r.id).sort()).toEqual(
        [userB1Id, userB2Id].sort(),
      );
    });
  });

  it('blocks a cross-tenant UPDATE: tenant A cannot touch tenant B’s rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const result = await runner.query(
        `UPDATE users SET name = 'hijacked' WHERE id = $1 RETURNING id`,
        [userB1Id],
      );
      expect(returningRows(result)).toEqual([]);
    });

    // The row is untouched.
    const after = await admin.query(`SELECT name FROM users WHERE id = $1`, [
      userB1Id,
    ]);
    expect(after[0].name).toBe('Owner B1');
  });

  it('blocks a cross-tenant DELETE: tenant A cannot delete tenant B’s rows', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const result = await runner.query(
        `DELETE FROM users WHERE id = $1 RETURNING id`,
        [userB2Id],
      );
      expect(returningRows(result)).toEqual([]);
    });

    const after = await admin.query(
      `SELECT count(*)::int AS count FROM users WHERE id = $1`,
      [userB2Id],
    );
    expect(after[0].count).toBe(1);
  });

  it('admits an own-tenant INSERT under the bound context and rejects a cross-tenant one', async () => {
    const ownUserId = randomUUID();
    await asRuntimeRole(runtime, tenantCId, async (runner) => {
      // The statement returning a row IS the WITH CHECK passing.
      const result = await runner.query(
        `INSERT INTO users (id, tenant_id, name, role) VALUES ($1, $2, 'Staff C', 'CASHIER') RETURNING id`,
        [ownUserId, tenantCId],
      );
      expect(returningRows(result)).toEqual([{ id: ownUserId }]);
    });

    // The row was rolled back with its transaction, so tenant D's fresh
    // context proves the cross-tenant INSERT verdict on an UNPROFILED
    // target: the FK would resolve (tenant C exists), only the WITH CHECK
    // rejects.
    await asRuntimeRole(runtime, tenantDId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO users (id, tenant_id, name, role) VALUES ($1, $2, 'Smuggled', 'CASHIER') RETURNING id`,
          [randomUUID(), tenantCId],
        ),
      ).rejects.toThrow();
    });
  });

  describe('the bound login path proven end-to-end against the migration-built schema', () => {
    it('resolves the slug, binds the tenant, finds the user, and issues tokens', async () => {
      const jwtService = new JwtService({ secret: jwtConfig.secret });
      const service = new AuthService(
        runtime.getRepository(User),
        jwtService,
        runtime,
        jwtConfig,
      );

      const result = await service.login(
        'owner-a1@users-rls.test',
        password,
        normalizeTenantSlug('users-rls-tenant-a'),
      );

      expect(result.user).toMatchObject({
        id: userA1Id,
        tenant_id: tenantAId,
        role: 'OWNER',
      });
      expect(typeof result.access_token).toBe('string');
      expect(typeof result.refresh_token).toBe('string');

      // The refresh path is bound too: slug -> bind -> rotate.
      const refreshed = await service.refreshTokens(
        userA1Id,
        result.refresh_token,
        normalizeTenantSlug('users-rls-tenant-a'),
      );
      expect(typeof refreshed.access_token).toBe('string');
    });

    it('fails generically when a valid tenant-B email is presented under tenant A’s slug (RLS hides the row)', async () => {
      const jwtService = new JwtService({ secret: jwtConfig.secret });
      const service = new AuthService(
        runtime.getRepository(User),
        jwtService,
        runtime,
        jwtConfig,
      );

      // The credentials are CORRECT for tenant B. Under tenant A's slug the
      // FORCED policy hides B's row, so the lookup sees nothing and the
      // generic failure fires — the email's global uniqueness (uq_users_email)
      // never leaks its existence across the boundary.
      await expect(
        service.login(
          'owner-b1@users-rls.test',
          password,
          normalizeTenantSlug('users-rls-tenant-a'),
        ),
      ).rejects.toThrow('Credenciales inválidas');
    });

    it('fails generically for an unknown slug before any users row is read', async () => {
      const jwtService = new JwtService({ secret: jwtConfig.secret });
      const service = new AuthService(
        runtime.getRepository(User),
        jwtService,
        runtime,
        jwtConfig,
      );

      await expect(
        service.login('owner-a1@users-rls.test', password, 'no-such-slug'),
      ).rejects.toThrow('Credenciales inválidas');
    });
  });
});
