import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  ActivationService,
  V1_REQUIRED_ACTIVATION_CHECKS,
} from '../../src/modules/onboarding/services/activation.service';
import { FiscalConfigVersionService } from '../../src/modules/onboarding/services/fiscal-config-version.service';
import { OnboardingCatalogService } from '../../src/modules/onboarding/services/onboarding-catalog.service';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../src/modules/onboarding/entities/activation-attempt.entity';
import {
  ActivationCheckCode,
  ActivationCheckResult,
  ActivationCheckStatus,
} from '../../src/modules/onboarding/entities/activation-check-result.entity';
import {
  ActivationFollowUp,
  ActivationFollowUpStatus,
} from '../../src/modules/onboarding/entities/activation-follow-up.entity';
import {
  OnboardingLifecycleState,
  OnboardingSession,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { FiscalConfigRevision } from '../../src/modules/onboarding/entities/fiscal-config-revision.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../src/modules/inventory/entities/system-parameters-config.entity';
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';

/**
 * THE REAL RLS PROOF for the onboarding activation-attempt path (issue #493
 * T2 closure, last evidence gap).
 *
 * NOT RLS PROOF: the pre-existing activation suites
 * (`src/modules/onboarding/services/activation.service.db.spec.ts` and
 * `test/onboarding/activation-flow.db.e2e-spec.ts`) build their schema with
 * `synchronize: true` and connect with the default superuser (`postgres`)
 * connection. `synchronize` never emits `ENABLE`/`FORCE ROW LEVEL SECURITY`
 * or policies, and a superuser (`rolbypassrls = true`) ignores them even if
 * it did — those suites stayed green through an RLS-binding regression, which
 * is exactly the hole this spec closes.
 *
 * THIS SPEC: the schema is built by RUNNING THE FULL MIGRATION SET (via
 * `test/support/migration-built-schema.helper.ts`), so the policies observed
 * here are the migrations' own output — never a hand-written copy. The
 * PRODUCTION `ActivationService` is constructed exactly as Nest would build
 * it (real `FiscalConfigVersionService`, `OnboardingCatalogService`,
 * `ChangeLogService`; only the cross-domain `OnboardingReadinessEvaluator`
 * and the catalog service's unused collaborators are stubs), with every
 * repository resolved from the fixture's RUNTIME role DataSource:
 * `NOSUPERUSER NOBYPASSRLS`, owner of nothing, ordinary DML grants only.
 *
 * The binding itself is the production mechanism
 * (`runInTenantTransaction` -> transaction-local
 * `set_config('app.tenant_id', ...)`), so a regression that unbinds the
 * service's first protected access makes `startActivation` unable to see the
 * tenant's own SALE_READY session (fail closed) or its INSERT denied by the
 * migrated policies — this suite goes red on both.
 *
 * The superuser (admin) connection seeds synthetic fixtures and reads back
 * cross-tenant facts only; it never runs the services. All seeded values are
 * synthetic (generated UUIDs, synthetic terminal ids, fake invoice numbers).
 *
 * Negative control against vacuity (issue #493 closure requirement): the
 * admin connection sees strictly MORE rows in the protected tables than the
 * tenant-bound runtime role. This control catches removal of FORCE RLS or
 * of the tenant policies: the bound role would then see both tenants and
 * the counts would match. It does NOT by itself catch a lost binding — an
 * unbound role is fail-closed and sees zero rows, so "admin sees strictly
 * more" still holds. Binding regression is caught by this spec's positive
 * assertions: `startActivation` creating exactly one tenant-local attempt,
 * the check-evidence counts, and the tenant-scoped INSERT.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const poolCleanupExtra = { extra: { allowExitOnIdle: true } };

/** The five FORCE-RLS tables the activation flow reads and writes. */
const ACTIVATION_PROTECTED_TABLES = [
  'onboarding_activation_attempts',
  'onboarding_activation_check_results',
  'onboarding_activation_follow_ups',
  'onboarding_sessions',
  'fiscal_config_revisions',
] as const;

/** Everything the flow touches, including the un-protected helpers. */
const ALL_TOUCHED_TABLES = [
  ...ACTIVATION_PROTECTED_TABLES,
  'tenants',
  'sys_parametros_config',
  'products',
  'change_log',
  'invoices',
] as const;

const entities = [
  Tenant,
  SystemParametersConfig,
  SystemParametersConfigActiveView,
  Product,
  Invoice,
  InvoiceItem,
  InvoiceItemModifier,
  Payment,
  OnboardingSession,
  ActivationAttempt,
  ActivationCheckResult,
  ActivationFollowUp,
  FiscalConfigRevision,
  ChangeLog,
];

/** Normalizes DB rows (Dates -> ISO strings) so snapshots compare by value. */
const normalize = (rows: unknown[]): unknown[] =>
  JSON.parse(JSON.stringify(rows));

/** TypeORM's pg driver returns `[rows, rowCount]` for UPDATE/DELETE raws. */
const affectedOf = (raw: unknown): number => {
  if (Array.isArray(raw) && raw.length === 2 && typeof raw[1] === 'number') {
    return raw[1];
  }
  if (Array.isArray(raw)) {
    return raw.length;
  }
  return (raw as { rowCount?: number })?.rowCount ?? -1;
};

describe('ActivationService under migrated FORCE RLS with a table non-owner runtime role (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let admin: DataSource;
  let runtime: DataSource;
  let activationService: ActivationService;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const sessionAId = randomUUID();
  const sessionBId = randomUUID();
  const terminalA = `pos-rls-proof-a-${tenantAId.slice(0, 8)}`;
  const terminalB = `pos-rls-proof-b-${tenantBId.slice(0, 8)}`;
  // change_log.user_id is a uuid column: actors are either a synthetic uuid
  // (A) or the ref path ('' falsy -> actor_ref 'SYSTEM', B).
  const actorAId = randomUUID();

  let aAttemptId = '';
  let bAttemptId = '';
  let foreignSnapshot: Record<string, unknown[]> | null = null;
  let aInvoiceId = '';
  let bInvoiceId = '';

  const countAdmin = async (
    table: string,
    where: string,
    params: unknown[],
  ) => {
    const rows = await admin.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    );
    return rows[0].count;
  };

  /** Runs work on the runtime pool bound to `tenantId` exactly like production. */
  const boundAs = async <T>(
    tenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> =>
    runtime.transaction(async (manager) => {
      await manager.query(TENANT_CONTEXT_SET_CONFIG_SQL, [tenantId]);
      return work(manager);
    });

  const boundCount = (table: string, tenantId: string) =>
    boundAs(tenantId, (manager) =>
      manager
        .query(`SELECT count(*)::int AS count FROM ${table}`)
        .then((rows: Array<{ count: number }>) => rows[0].count),
    );

  const snapshotTenantRows = async (
    tenantId: string,
  ): Promise<Record<string, unknown[]>> => {
    const attempts = normalize(
      await admin.query(
        `SELECT id, status, candidate_terminal_id, trusted_terminal_id,
                verification_ticket_id, warnings_count, failure_code, completed_at
           FROM onboarding_activation_attempts WHERE tenant_id = $1 ORDER BY id`,
        [tenantId],
      ),
    );
    const checks = normalize(
      await admin.query(
        `SELECT id, check_code, status, required, evidence_ref, recorded_at
           FROM onboarding_activation_check_results WHERE tenant_id = $1 ORDER BY id`,
        [tenantId],
      ),
    );
    const followUps = normalize(
      await admin.query(
        `SELECT id, warning_code, status, opened_by, closure_evidence_ref, closed_at
           FROM onboarding_activation_follow_ups WHERE tenant_id = $1 ORDER BY id`,
        [tenantId],
      ),
    );
    const session = normalize(
      await admin.query(
        `SELECT id, lifecycle_state, optimistic_version, current_activation_attempt_id,
                activation_started_at, activated_at, first_successful_sale_at, last_activity_at
           FROM onboarding_sessions WHERE tenant_id = $1 ORDER BY id`,
        [tenantId],
      ),
    );
    return { attempts, checks, followUps, session };
  };

  const expectSnapshotsEqual = (
    before: Record<string, unknown[]>,
    after: Record<string, unknown[]>,
  ) => {
    expect(after.attempts).toEqual(before.attempts);
    expect(after.checks).toEqual(before.checks);
    expect(after.followUps).toEqual(before.followUps);
    expect(after.session).toEqual(before.session);
  };

  const seedTenantFixture = async (tenantId: string, label: string) => {
    await admin.getRepository(Tenant).save({
      id: tenantId,
      name: `Activation RLS Proof Tenant ${label} ${tenantId}`,
      ruc: 'J0310000004321',
      is_active: true,
    });
    await admin.getRepository(OnboardingSession).save({
      id: label === 'A' ? sessionAId : sessionBId,
      tenantId,
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      saleReadyFirstAt: new Date('2026-01-01T00:00:00.000Z'),
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
    });
    await admin.getRepository(SystemParametersConfig).save([
      {
        tenant_id: tenantId,
        paramKey: 'FISCAL_REGIME',
        paramValue: 'REGIMEN_GENERAL',
        isActive: true,
      },
      {
        tenant_id: tenantId,
        paramKey: 'TAX_RATE_IVA',
        paramValue: 0.15,
        isActive: true,
      },
    ]);
    await admin.getRepository(Product).save({
      tenant_id: tenantId,
      name: `Verification Product ${label}`,
      sellPrice: 65,
      uom: 'UN',
      product_type: ProductType.SIMPLE,
      is_active: true,
      stock: 0,
      averageCost: 0,
    });
    // A paid, uncanceled invoice: the verification sale evidence the
    // production finalize path requires (DGI: never deleted, only is_canceled).
    const invoiceId = randomUUID();
    await admin.getRepository(Invoice).save(
      admin.getRepository(Invoice).create({
        id: invoiceId,
        tenant_id: tenantId,
        number: `FAC-ACTRLS-${label}`,
        created_at: new Date('2026-01-02T00:00:00.000Z'),
        userId: randomUUID(),
        subtotal: 65,
        totalTax: 0,
        total: 65,
        paymentStatus: 'paid',
        isCanceled: false,
      }),
    );
    return { invoiceId };
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    process.stdout.write(
      `[timing] migration-built setup = ${fixture.setupDurationMs} ms (migrations alone: ${fixture.migrationDurationMs} ms)\n`,
    );

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      entities,
      ...poolCleanupExtra,
      extra: {
        ...poolCleanupExtra.extra,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. `synchronize` stays false: the schema remains
    // exactly what the migrations built.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      synchronize: false,
      entities,
      ...poolCleanupExtra,
    });
    await runtime.initialize();

    // The production service, built exactly as Nest builds it: repositories
    // resolved from the runtime-role pool that opens the bound transactions.
    const fiscalConfigVersionService = new FiscalConfigVersionService(
      runtime.getRepository(FiscalConfigRevision),
      runtime.getRepository(Tenant),
      runtime,
    );
    const readinessStub = {
      evaluate: async () => ({ saleReady: true }),
    };
    const onboardingCatalogService = new OnboardingCatalogService(
      runtime,
      { ensureOnboardingStarted: async () => undefined } as never,
      readinessStub as never,
      { reconcile: async () => undefined } as never,
    );
    activationService = new ActivationService(
      runtime.getRepository(ActivationAttempt),
      runtime.getRepository(ActivationCheckResult),
      runtime.getRepository(ActivationFollowUp),
      runtime.getRepository(OnboardingSession),
      fiscalConfigVersionService,
      onboardingCatalogService,
      readinessStub as never,
      runtime,
      // Issue #512 slice 7: change_log is tenant-RLS protected, so the
      // service binds its own tenant transactions through the DataSource.
      new ChangeLogService(runtime.getRepository(ChangeLog), runtime),
    );

    // ---- Fixture seeding (admin, superuser, bypasses the FORCED RLS) ----
    await seedTenantFixture(tenantAId, 'A');
    await seedTenantFixture(tenantBId, 'B');
    aInvoiceId = (
      await admin.query(
        `SELECT id FROM invoices WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
        [tenantAId],
      )
    )[0].id;
    bInvoiceId = (
      await admin.query(
        `SELECT id FROM invoices WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
        [tenantBId],
      )
    )[0].id;

    // Foreign tenant B's rows are produced through the same production path
    // (bound to B), so the non-disclosure assertions later have real foreign
    // attempt/check/follow-up data to guard. B ends PASS_WITH_WARNING, which
    // materializes an OPEN follow-up row — one foreign row per protected
    // activation table.
    const bAttempt = await activationService.startActivation(
      tenantBId,
      {
        candidateTerminalId: terminalB,
        idempotencyKey: `foreign-seed-${tenantBId}`,
      },
      '',
    );
    bAttemptId = bAttempt.id;
    for (const code of V1_REQUIRED_ACTIVATION_CHECKS) {
      await activationService.ingestCheck(
        bAttempt.id,
        {
          checkCode: code,
          status:
            code === ActivationCheckCode.POST_RECONNECT_SYNC
              ? ActivationCheckStatus.WARNING
              : ActivationCheckStatus.PASS,
          verificationTicketId:
            code === ActivationCheckCode.OFFLINE_SALE_PAID
              ? bInvoiceId
              : undefined,
          declarativeTenantId: tenantBId,
          declarativeTerminalId: terminalB,
        },
        { tenantId: tenantBId, terminalId: terminalB },
      );
    }
    const bFinalized = await activationService.finalizeActivation(
      tenantBId,
      bAttempt.id,
      '',
    );
    expect(bFinalized.status).toBe(ActivationAttemptStatus.PASS_WITH_WARNING);

    foreignSnapshot = await snapshotTenantRows(tenantBId);
    expect(foreignSnapshot.attempts).toHaveLength(1);
    expect(foreignSnapshot.checks).toHaveLength(
      V1_REQUIRED_ACTIVATION_CHECKS.length,
    );
    expect(foreignSnapshot.followUps).toHaveLength(1);
  });

  afterAll(async () => {
    if (runtime?.isInitialized) await runtime.destroy();
    if (admin?.isInitialized) await admin.destroy();
    if (fixture) await fixture.close();
  });

  it('raw probe: the runtime role is NOSUPERUSER, does not bypass RLS, and owns none of the tables the flow touches', async () => {
    const roles = await admin.query(
      `SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1`,
      [fixture.runtimeRoleName],
    );
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: true,
    });

    // The runtime role must own NOTHING in the scratch schema: under FORCE
    // RLS even an owner is subject to the policies, but a non-owner runtime
    // role is what production stages run as, so the proof binds that shape.
    const owned = await admin.query(
      `SELECT c.relname FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = $2)`,
      [fixture.schema, fixture.runtimeRoleName],
    );
    expect(owned).toEqual([]);

    // Everything the flow touches was created (and is owned) by the
    // migration role the helper provisioned — the schema is migration output.
    const owners = await admin.query(
      `SELECT c.relname, r.rolname AS owner FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_roles r ON r.oid = c.relowner
        WHERE n.nspname = $1 AND c.relname = ANY($2)`,
      [fixture.schema, ALL_TOUCHED_TABLES as unknown as string[]],
    );
    expect(owners.map((o) => o.relname).sort()).toEqual(
      [...ALL_TOUCHED_TABLES].sort(),
    );
    for (const owner of owners) {
      expect(owner.owner).toBe(fixture.migrationRoleName);
    }
  });

  it('raw probe: the activation tables carry FORCE RLS with the migration-emitted tenant policies (pg_policies, not a hand-written copy)', async () => {
    const rls = await admin.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = ANY($2)`,
      [fixture.schema, ACTIVATION_PROTECTED_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(ACTIVATION_PROTECTED_TABLES.length);
    for (const row of rls) {
      expect(row).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }

    // One policy per command, named `{table}_tenant_{command}` by migrations
    // 1809000000001 / 1809080000000 (attempts/checks/follow-ups/revisions)
    // and 1809220000000 (sessions). The predicate must be the production
    // transaction-local binding form, not a hand-rolled variant.
    const policies = await admin.query(
      `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
        WHERE schemaname = $1 AND tablename = ANY($2)
        ORDER BY tablename, policyname`,
      [fixture.schema, ACTIVATION_PROTECTED_TABLES as unknown as string[]],
    );
    for (const table of ACTIVATION_PROTECTED_TABLES) {
      const forTable = policies.filter((p) => p.tablename === table);
      expect(forTable.map((p) => p.cmd).sort()).toEqual([
        'DELETE',
        'INSERT',
        'SELECT',
        'UPDATE',
      ]);
      for (const policy of forTable) {
        expect(policy.policyname).toBe(
          `${table}_tenant_${policy.cmd.toLowerCase()}`,
        );
        if (policy.cmd === 'INSERT') {
          expect(policy.with_check).toContain(
            `current_setting('app.tenant_id'`,
          );
        } else {
          expect(policy.qual).toContain(`current_setting('app.tenant_id'`);
        }
      }
    }
  });

  it('fail-closed control: with no tenant bound, protected reads disclose nothing and writes mutate nothing', async () => {
    // Cold pool, never bound: `current_setting('app.tenant_id', true)` on a
    // session that never set the GUC resolves to NULL; the migrated
    // predicate `tenant_id = NULL::uuid` matches nothing, so SELECT discloses
    // zero rows, UPDATE/DELETE USING match zero rows, and INSERT fails the
    // WITH CHECK. That is the observed mechanism, asserted here directly.
    const probe = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities,
      extra: { max: 1, allowExitOnIdle: true },
    });
    await probe.initialize();
    try {
      for (const table of ACTIVATION_PROTECTED_TABLES) {
        const rows = await probe.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        );
        expect(rows[0].count).toBe(0);
      }

      const unboundUpdateRaw = await probe.query(
        `UPDATE onboarding_activation_attempts
            SET candidate_terminal_id = 'forged-unbound'
          WHERE tenant_id = $1`,
        [tenantAId],
      );
      expect(affectedOf(unboundUpdateRaw)).toBe(0);

      await expect(
        probe.query(
          `INSERT INTO onboarding_activation_attempts
             (id, tenant_id, onboarding_session_id, candidate_terminal_id, status,
              started_by_user_id, started_at, server_time_anchor_at,
              required_fiscal_revision, required_fiscal_fingerprint,
              verification_product_id)
           VALUES ($1, $2, $3, 'forged-unbound', 'CREATED', 'SYSTEM', now(), now(), 1, 'fp', 'p')`,
          [randomUUID(), tenantAId, sessionAId],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await probe.destroy();
    }
  });

  it('startActivation on the bound runtime role creates exactly one tenant-local attempt for tenant A', async () => {
    const attempt = await activationService.startActivation(
      tenantAId,
      {
        candidateTerminalId: terminalA,
        idempotencyKey: `activation-rls-proof-${tenantAId}`,
      },
      actorAId,
    );
    aAttemptId = attempt.id;

    expect(attempt).toMatchObject({
      tenantId: tenantAId,
      candidateTerminalId: terminalA,
      status: ActivationAttemptStatus.CREATED,
    });

    // Exactly one attempt for the bound tenant (admin-side read-back).
    expect(
      await countAdmin('onboarding_activation_attempts', 'tenant_id = $1', [
        tenantAId,
      ]),
    ).toBe(1);
    // The bound runtime role sees its own row.
    expect(await boundCount('onboarding_activation_attempts', tenantAId)).toBe(
      1,
    );
    // The session advanced tenant-locally.
    const session = await admin.query(
      `SELECT lifecycle_state, current_activation_attempt_id FROM onboarding_sessions WHERE tenant_id = $1`,
      [tenantAId],
    );
    expect(session[0]).toMatchObject({
      lifecycle_state: OnboardingLifecycleState.ACTIVATION_IN_PROGRESS,
      current_activation_attempt_id: aAttemptId,
    });
  });

  it('ingestCheck on the bound runtime role persists tenant-local check evidence and the verification ticket', async () => {
    for (const code of V1_REQUIRED_ACTIVATION_CHECKS) {
      await activationService.ingestCheck(
        aAttemptId,
        {
          checkCode: code,
          status:
            code === ActivationCheckCode.POST_RECONNECT_SYNC
              ? ActivationCheckStatus.WARNING
              : ActivationCheckStatus.PASS,
          verificationTicketId:
            code === ActivationCheckCode.OFFLINE_SALE_PAID
              ? aInvoiceId
              : undefined,
          declarativeTenantId: tenantAId,
          declarativeTerminalId: terminalA,
        },
        { tenantId: tenantAId, terminalId: terminalA },
      );
    }

    expect(
      await countAdmin(
        'onboarding_activation_check_results',
        'tenant_id = $1 AND activation_attempt_id = $2',
        [tenantAId, aAttemptId],
      ),
    ).toBe(V1_REQUIRED_ACTIVATION_CHECKS.length);
    expect(
      await boundCount('onboarding_activation_check_results', tenantAId),
    ).toBe(V1_REQUIRED_ACTIVATION_CHECKS.length);

    const attempt = await admin.query(
      `SELECT status, trusted_terminal_id, verification_ticket_id
         FROM onboarding_activation_attempts WHERE id = $1`,
      [aAttemptId],
    );
    expect(attempt[0]).toMatchObject({
      status: ActivationAttemptStatus.IN_PROGRESS,
      trusted_terminal_id: terminalA,
      verification_ticket_id: expect.any(String),
    });
  });

  it('negative control: the admin connection sees strictly MORE protected rows than the bound runtime role, so the isolation assertions are not vacuous', async () => {
    for (const table of [
      'onboarding_activation_attempts',
      'onboarding_activation_check_results',
      'onboarding_activation_follow_ups',
      'onboarding_sessions',
      'fiscal_config_revisions',
    ]) {
      const adminTotal = await countAdmin(table, 'tenant_id = ANY($1)', [
        [tenantAId, tenantBId],
      ]);
      const boundForA = await boundCount(table, tenantAId);
      expect(adminTotal).toBeGreaterThan(boundForA);
    }

    // Concretely: admin 2 attempts (A + B) vs the bound role's 1 (A only);
    // if FORCE RLS or the tenant policies were removed, the bound role
    // would see both tenants and this would fail. A lost binding is NOT
    // caught here (an unbound role is fail-closed and sees zero rows); it
    // is caught by the spec's positive assertions.
    expect(
      await countAdmin(
        'onboarding_activation_attempts',
        'tenant_id = ANY($1)',
        [[tenantAId, tenantBId]],
      ),
    ).toBe(2);
    expect(await boundCount('onboarding_activation_attempts', tenantAId)).toBe(
      1,
    );
  });

  it('foreign-tenant non-disclosure: bound as A, tenant B rows are invisible and a forged cross-tenant read or update affects zero rows', async () => {
    const before = await snapshotTenantRows(tenantBId);
    expectSnapshotsEqual(foreignSnapshot, before);

    await boundAs(tenantAId, async (manager) => {
      // Forged cross-tenant reads: zero rows, per table (attempts have no
      // activation_attempt_id column; each predicate names the right keys).
      for (const [table, predicate, params] of [
        [
          'onboarding_activation_attempts',
          'id = $1 OR tenant_id = $2',
          [bAttemptId, tenantBId],
        ],
        [
          'onboarding_activation_check_results',
          'activation_attempt_id = $1 OR tenant_id = $2',
          [bAttemptId, tenantBId],
        ],
        [
          'onboarding_activation_follow_ups',
          'activation_attempt_id = $1 OR tenant_id = $2',
          [bAttemptId, tenantBId],
        ],
        ['onboarding_sessions', 'tenant_id = $1', [tenantBId]],
      ] as const) {
        const rows = await manager.query(
          `SELECT * FROM ${table} WHERE ${predicate}`,
          [...params],
        );
        // The RLS policy filters the rows before the predicate applies, so
        // even these deliberately over-broad predicates surface nothing.
        expect(rows).toEqual([]);
      }

      // Forged cross-tenant writes: zero rows affected.
      const attemptsRaw = await manager.query(
        `UPDATE onboarding_activation_attempts
            SET candidate_terminal_id = 'forged-by-tenant-a'
          WHERE id = $1`,
        [bAttemptId],
      );
      expect(affectedOf(attemptsRaw)).toBe(0);

      const checksRaw = await manager.query(
        `UPDATE onboarding_activation_check_results SET status = 'FAIL'
          WHERE activation_attempt_id = $1`,
        [bAttemptId],
      );
      expect(affectedOf(checksRaw)).toBe(0);

      const followUpsRaw = await manager.query(
        `UPDATE onboarding_activation_follow_ups SET status = 'CLOSED'
          WHERE activation_attempt_id = $1`,
        [bAttemptId],
      );
      expect(affectedOf(followUpsRaw)).toBe(0);

      const sessionsRaw = await manager.query(
        `UPDATE onboarding_sessions
            SET optimistic_version = optimistic_version + 1
          WHERE tenant_id = $1`,
        [tenantBId],
      );
      expect(affectedOf(sessionsRaw)).toBe(0);
    });

    // The production service read paths fail closed the same way: a foreign
    // attempt is "not found", foreign follow-ups are an empty list.
    await expect(
      activationService.getAttempt(tenantAId, bAttemptId),
    ).rejects.toThrow(/not found/i);
    expect(await activationService.getFollowUps(tenantAId, bAttemptId)).toEqual(
      [],
    );

    // And the foreign rows are byte-identical to the pre-flow snapshot.
    expectSnapshotsEqual(before, await snapshotTenantRows(tenantBId));
  });

  it('finalizeActivation on the bound runtime role transitions tenant A tenant-locally and leaves foreign rows untouched', async () => {
    const finalized = await activationService.finalizeActivation(
      tenantAId,
      aAttemptId,
      actorAId,
    );

    expect(finalized).toMatchObject({
      id: aAttemptId,
      tenantId: tenantAId,
      status: ActivationAttemptStatus.PASS_WITH_WARNING,
      warningsCount: 1,
    });
    expect(finalized.completedAt).not.toBeNull();

    // Tenant-local transition: A's session is ACTIVATED against A's attempt.
    const sessionA = await admin.query(
      `SELECT lifecycle_state, current_activation_attempt_id, activated_at
         FROM onboarding_sessions WHERE tenant_id = $1`,
      [tenantAId],
    );
    expect(sessionA[0]).toMatchObject({
      lifecycle_state: OnboardingLifecycleState.ACTIVATED,
      current_activation_attempt_id: aAttemptId,
    });
    expect(sessionA[0].activated_at).not.toBeNull();

    // A's follow-up was created (tenant-local); the bound role sees exactly
    // one attempt/check/follow-up of its own while admin sees both tenants'.
    expect(
      await countAdmin(
        'onboarding_activation_follow_ups',
        'tenant_id = $1 AND activation_attempt_id = $2',
        [tenantAId, aAttemptId],
      ),
    ).toBe(1);
    expect(
      (
        await admin.query(
          `SELECT status FROM onboarding_activation_follow_ups WHERE tenant_id = $1`,
          [tenantAId],
        )
      )[0]?.status,
    ).toBe(ActivationFollowUpStatus.OPEN);
    expect(
      await boundCount('onboarding_activation_follow_ups', tenantAId),
    ).toBe(1);
    expect(await boundCount('onboarding_activation_attempts', tenantAId)).toBe(
      1,
    );
    expect(
      await countAdmin(
        'onboarding_activation_attempts',
        'tenant_id = ANY($1)',
        [[tenantAId, tenantBId]],
      ),
    ).toBe(2);

    // Foreign rows remain untouched by A's whole flow, finalize included.
    expectSnapshotsEqual(foreignSnapshot, await snapshotTenantRows(tenantBId));
  });
});
