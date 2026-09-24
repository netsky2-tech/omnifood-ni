import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { User } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 9: tenant isolation for the `parent-owned` identity
 * child — `security_profiles` (one-hop: child -> users, predicate reads
 * users.tenant_id directly).
 *
 * The schema is built by RUNNING THE FULL MIGRATION SET (via
 * test/support/migration-built-schema.helper.ts), so the RLS shape asserted
 * here is migration 1809330000000's own output — never a hand-written copy.
 * The application-shaped connection is the fixture's runtime role:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, holding exactly ordinary
 * SELECT/INSERT/UPDATE/DELETE on the scratch schema's tables. Under FORCEd
 * row-level security every query it makes is subject to the migrated
 * policies; the superuser connection exists only to seed tenants and the
 * fixture rows.
 *
 * The table has NO tenant_id column: isolation flows through the
 * parent-walking EXISTS policy. Every runtime-role observation runs inside a
 * transaction that binds the tenant context with the production SQL
 * (TENANT_CONTEXT_SET_CONFIG_SQL, transaction-local) and is then ROLLED
 * BACK: the GUC is discarded with the transaction, so the pool is never left
 * with a defined-and-empty `app.tenant_id` (the issue #358 poisoning), and
 * the runtime role never mutates the fixtures. An insert "success" is proven
 * inside its own transaction — the statement returning a row IS the WITH
 * CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `users.tenant_id` is `uuid NOT NULL` with a real FK to tenants(id);
 *   `users.role` is the users_role_enum NOT NULL, so seeded users carry
 *   'OWNER'. `users` itself stays classified `debt` in the RLS coverage
 *   manifest (founder decision) and has NO row level security — the policy
 *   here does not depend on users having policies, only on the column's
 *   value, which is why the predicate can read users.tenant_id directly.
 * - `security_profiles.user_id` is uuid NOT NULL with a real FK to
 *   users(id) AND a GLOBAL unique constraint (uq on user_id, not per
 *   tenant). The cross-tenant INSERT case below therefore targets an
 *   UNPROFILED foreign user: the FK resolves, the unique constraint is not
 *   violated, and ONLY the WITH CHECK's parent walk rejects the row — the
 *   RLS verdict is never masked by a constraint error.
 * - pin_hash / totp_secret_seed are nullable; every other non-key column has
 *   a default, so the minimal insert proofs fail (or pass) on RLS alone,
 *   never on a missing NOT NULL value.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

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
function returningRows(
  result: unknown,
): Array<{ id: string; user_id?: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('security_profiles tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
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

  // Two users per tenant A and B: the first already holds the seeded probe
  // profile, the second is unprofiled so the cross-tenant INSERT case is
  // decided by RLS alone (FK resolves, global unique constraint untouched).
  const userA1Id = randomUUID();
  const userA2Id = randomUUID();
  const userB1Id = randomUUID();
  const userB2Id = randomUUID();
  const userCId = randomUUID();

  // Seeded probe profiles, one per tenant (A and B).
  const profileAId = randomUUID();
  const profileBId = randomUUID();

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    schema = fixture.schema;
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    // Superuser connection: seeding and catalog facts only. It bypasses the
    // FORCED row-level security, which is what makes cross-tenant seeding
    // possible. search_path is pinned so unqualified SQL lands in the
    // scratch schema.
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
        'security-profile-rls-tenant-a',
        tenantBId,
        'security-profile-rls-tenant-b',
        tenantCId,
        'security-profile-rls-tenant-c',
        tenantDId,
        'security-profile-rls-tenant-d',
                normalizeTenantSlug('security-profile-rls-tenant-a'),
        normalizeTenantSlug('security-profile-rls-tenant-b'),
        normalizeTenantSlug('security-profile-rls-tenant-c'),
        normalizeTenantSlug('security-profile-rls-tenant-d'),
      ],
    );

    // Two users per tenant A and B, one for C (the own-tenant INSERT proof).
    await admin.query(
      `INSERT INTO users (id, tenant_id, name, role)
       VALUES ($1, $2, 'Owner A1', 'OWNER'),
              ($3, $2, 'Owner A2', 'OWNER'),
              ($4, $5, 'Owner B1', 'OWNER'),
              ($6, $5, 'Owner B2', 'OWNER'),
              ($7, $8, 'Owner C', 'OWNER')`,
      [userA1Id, tenantAId, userA2Id, userB1Id, tenantBId, userB2Id, userCId, tenantCId],
    );

    // Seeded probe profiles, one per tenant A and B. Every other column has
    // a default or is nullable.
    await admin.query(
      `INSERT INTO security_profiles (id, user_id) VALUES ($1, $3), ($2, $4)`,
      [profileAId, profileBId, userA1Id, userB1Id],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation. The
    // identity entities are registered so the bound transaction query-shape
    // regressions below can exercise the exact repository/QueryBuilder
    // shapes the services use — never raw SQL stand-ins. Metadata only:
    // no synchronize and no migrations on this connection.
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

  it('seeds both tenants through the superuser and proves the runtime role is a table non-owner that cannot bypass RLS', async () => {
    const seeded = await admin.query(
      `SELECT (SELECT count(*)::int FROM security_profiles) AS profiles,
              (SELECT count(*)::int FROM users) AS users`,
    );
    expect(seeded[0]).toEqual({ profiles: 2, users: 5 });

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
          AND tablename IN ('security_profiles')
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
          AND c.relname IN ('security_profiles')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      { relname: 'security_profiles', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('security_profiles')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies: an extra policy would widen access
    // beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      { tablename: 'security_profiles', policyname: 'security_profiles_tenant_delete', cmd: 'DELETE' },
      { tablename: 'security_profiles', policyname: 'security_profiles_tenant_insert', cmd: 'INSERT' },
      { tablename: 'security_profiles', policyname: 'security_profiles_tenant_select', cmd: 'SELECT' },
      { tablename: 'security_profiles', policyname: 'security_profiles_tenant_update', cmd: 'UPDATE' },
    ]);

    // Every defined expression is the ONE-HOP parent walk over users with
    // the uuid-cast setting form.
    const exprs = await admin.query(
      `SELECT policyname, qual, with_check FROM pg_policies
        WHERE schemaname = $1 AND tablename = 'security_profiles'
        ORDER BY policyname`,
      [schema],
    );
    for (const expr of exprs) {
      for (const half of [expr.qual, expr.with_check]) {
        if (half === null) continue;
        expect(half).toContain('users');
        // PostgreSQL deparses the setting with an implicit ::text cast on
        // the literal; assert on the stable prefix, never on the exact
        // written spelling.
        expect(half).toContain("current_setting('app.tenant_id'");
        expect(half).toContain('::uuid');
      }
    }
  });

  it('denies an unbound runtime role every row of the table', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const profiles = (await runner.query(
        `SELECT count(*)::int AS count FROM security_profiles`,
      )) as Array<{ count: number }>;
      expect(profiles[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own profile, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const profiles = (await runner.query(
        `SELECT id FROM security_profiles`,
      )) as Array<{ id: string }>;
      expect(profiles.map((r) => r.id)).toEqual([profileAId]);
    });
  });

  it('shows tenant B only its own profile (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const profiles = (await runner.query(
        `SELECT id FROM security_profiles`,
      )) as Array<{ id: string }>;
      expect(profiles.map((r) => r.id)).toEqual([profileBId]);
    });
  });

  it('blocks a tenant-bound id-keyed SELECT of the other tenant’s profile', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const foreign = (await runner.query(
        `SELECT id FROM security_profiles WHERE id = $1`,
        [profileBId],
      )) as Array<{ id: string }>;
      expect(foreign).toEqual([]);
    });
  });

  it('accepts a tenant-bound runtime role inserting a profile for its own user', async () => {
    // Bound to tenant A, profiling A's UNPROFILED second user: the statement
    // returning its row IS the WITH CHECK half passing. Proven inside the
    // rolled-back transaction.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const inserted = returningRows(
        await runner.query(
          `INSERT INTO security_profiles (user_id) VALUES ($1) RETURNING id, user_id`,
          [userA2Id],
        ),
      );
      expect(inserted).toHaveLength(1);
      expect(inserted[0].user_id).toBe(userA2Id);
    });
  });

  it('rejects a tenant-bound runtime role inserting a profile whose user belongs to another tenant', async () => {
    // Bound to A, profiling B's UNPROFILED second user: the FK resolves and
    // the global unique constraint is untouched, so ONLY the WITH CHECK's
    // parent walk over users.tenant_id rejects the row. One statement per
    // transaction: the RLS rejection aborts the transaction it happens in.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO security_profiles (user_id) VALUES ($1) RETURNING id`,
          [userB2Id],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own profile', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE security_profiles SET is_totp_enabled = true WHERE id = $1 RETURNING id`,
          [profileAId],
        ),
      );
      expect(updated.map((r) => r.id)).toEqual([profileAId]);

      // Delete of a throwaway own row: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwaway = returningRows(
        await runner.query(
          `INSERT INTO security_profiles (user_id) VALUES ($1) RETURNING id`,
          [userA2Id],
        ),
      );
      const deleted = returningRows(
        await runner.query(
          `DELETE FROM security_profiles WHERE id = $1 RETURNING id`,
          [throwaway[0].id],
        ),
      );
      expect(deleted.map((r) => r.id)).toEqual([throwaway[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s profile', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updated = returningRows(
        await runner.query(
          `UPDATE security_profiles SET is_totp_enabled = false WHERE id = $1 RETURNING id`,
          [profileBId],
        ),
      );
      expect(updated).toEqual([]);

      const deleted = returningRows(
        await runner.query(
          `DELETE FROM security_profiles WHERE id = $1 RETURNING id`,
          [profileBId],
        ),
      );
      expect(deleted).toEqual([]);
    });
  });

  describe('cross-tenant isolation through the user id (issue #512 T3 slice 9)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on this table (or bypassed by the role). The
    // guard is what keeps this suite from passing vacuously: a tenant-less
    // invariant (e.g. asserting only "the query returns a row") would hold
    // with or without policies.
    //
    //   SELECT user_id FROM security_profiles WHERE user_id = <B's user>
    //     -> ONE row — B's profile, readable by tenant A through the user id.
    //   UPDATE security_profiles SET ... WHERE user_id = <B's user>
    //        RETURNING id
    //     -> ONE row — tenant A would mutate B's security profile through
    //        the user id.
    //   INSERT with a foreign user id
    //     -> ACCEPTED — a profile row lands under another tenant's user
    //        because the FK (which ignores RLS) resolves.
    //
    // Every `toEqual([])` below pins ZERO foreign rows, so a missing or
    // bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns no foreign profile through the user id lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM security_profiles WHERE user_id = $1`,
          [userB1Id],
        )) as Array<{ id: string }>;
        expect(rows).toEqual([]);
      });
    });

    it('scopes a user-keyed UPDATE to the bound tenant’s own profile only', async () => {
      // A user-keyed write mirrors the supervisor-override flow re-profiling
      // a cashier; under an absent policy it would RETURN B's id and
      // overwrite B's security profile.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE security_profiles SET is_pin_enabled = false
              WHERE user_id = $1 RETURNING id`,
            [userB1Id],
          ),
        );
        expect(updated).toEqual([]);
      });
    });

    it('rejects a foreign-tenant INSERT profiling a foreign user from the fresh synthetic tenant C', async () => {
      // Bound to C, profiling B's UNPROFILED user: the values match B's user
      // textually, and only the WITH CHECK half stands between this
      // statement and B's security profile. One statement per transaction.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO security_profiles (user_id) VALUES ($1) RETURNING id`,
            [userB2Id],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });

  // Issue #512 T3 slice 9 REWORK regression coverage: the first slice
  // shipped FORCE RLS without binding the three production read paths that
  // query security_profiles through pooled repositories, and an unbind
  // would have been invisible to this suite. Each test below runs the
  // EXACT query shape a service uses — the supervisor-override-shaped
  // findOne, the staff-sync-shaped users JOIN security_profiles, and the
  // permissions-shaped user-then-profile findOne — through the manager of
  // a tenant-bound transaction against the migration-built schema, and
  // proves both sides of the tenant contract: rows for the owning tenant,
  // nothing (or a masked JOIN side) for a foreign one. A future revert of
  // the binding makes the owning-tenant assertions fail here at the db
  // level, not only in production.
  describe('bound transaction query shapes (slice 9 rework regression)', () => {
    it('supervisor-override-shaped bound findOne returns the owning profile and nothing for a foreign user', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const manager = runner.manager;

        // SupervisorOverrideService.authorizeOverride shape: the bound
        // manager's SecurityProfile repository, keyed by user_id, with the
        // production select list.
        const own = await manager.getRepository(SecurityProfile).findOne({
          where: { user_id: userA1Id },
          select: [
            'id',
            'user_id',
            'pin_hash',
            'totp_secret_seed',
            'is_pin_enabled',
            'is_totp_enabled',
            'custom_permissions',
          ],
        });
        expect(own).not.toBeNull();
        expect(own?.user_id).toBe(userA1Id);

        // The same shape keyed by a FOREIGN user resolves to nothing.
        const foreign = await manager
          .getRepository(SecurityProfile)
          .findOne({ where: { user_id: userB1Id } });
        expect(foreign).toBeNull();
      });
    });

    it('permissions-shaped bound findOne (user then dependent profile) returns rows for the owning tenant and nothing for a foreign one', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const manager = runner.manager;

        // UserService.getUserEffectivePermissions shape: User findOne by
        // (id, tenant_id, is_active), then the dependent SecurityProfile
        // findOne by user_id — both through the bound manager.
        const user = await manager.getRepository(User).findOne({
          where: { id: userA1Id, tenant_id: tenantAId, is_active: true },
        });
        expect(user).not.toBeNull();

        const profile = await manager
          .getRepository(SecurityProfile)
          .findOne({ where: { user_id: user!.id } });
        expect(profile).not.toBeNull();
        expect(profile?.user_id).toBe(userA1Id);

        // The user lookup itself is tenant-scoped by its where clause:
        // a foreign user never satisfies (id, foreign-tenant, active).
        const foreignUser = await manager.getRepository(User).findOne({
          where: { id: userB1Id, tenant_id: tenantAId, is_active: true },
        });
        expect(foreignUser).toBeNull();
      });
    });

    it('staff-sync-shaped bound JOIN keeps the security_profiles side visible for the owning tenant and masked for a foreign one', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const manager = runner.manager;

        // AuthService.getStaffForSync shape: the bound manager's User
        // repository QueryBuilder with the LEFT JOIN security_profiles.
        // This is the offline-first critical path: an unbound (or
        // foreign-bound) JOIN collapses the profile side to null.
        const own = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.security_profile', 'security_profile')
          .select([
            'user.id',
            'user.name',
            'user.role',
            'user.is_active',
            'user.email',
            'user.tenant_id',
            'security_profile.user_id',
            'security_profile.is_totp_enabled',
            'security_profile.is_pin_enabled',
          ])
          .where('user.tenant_id = :tenantId', { tenantId: tenantAId })
          .andWhere('user.is_active = :isActive', { isActive: true })
          .getMany();

        const ownWithProfile = own.find((u) => u.id === userA1Id);
        expect(ownWithProfile).toBeDefined();
        // The joined side SURVIVED RLS: without the bound transaction the
        // FORCE policy filters every security_profiles row and this is null.
        expect(ownWithProfile?.security_profile?.user_id).toBe(userA1Id);
        // The profiled user's unprofiled tenant-mate has no profile row —
        // LEFT JOIN, not an INNER JOIN through the policy.
        const ownWithoutProfile = own.find((u) => u.id === userA2Id);
        expect(ownWithoutProfile).toBeDefined();
        expect(ownWithoutProfile?.security_profile).toBeNull();

        // Foreign shape: A-bound session reading B's users. users has no
        // RLS so the user rows return, but the security_profiles side is
        // masked by the policy — proving the JOIN is not an RLS bypass.
        const foreign = await manager
          .getRepository(User)
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.security_profile', 'security_profile')
          .where('user.tenant_id = :tenantId', { tenantId: tenantBId })
          .getMany();
        expect(foreign.map((u) => u.id).sort()).toEqual(
          [userB1Id, userB2Id].sort(),
        );
        expect(foreign.every((u) => u.security_profile === null)).toBe(true);
      });
    });
  });
});
