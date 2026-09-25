import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../src/core/database/tenant-transaction';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * Issue #512 T3 slice 9: tenant isolation for the `parent-owned` sales
 * children — `invoice_item_modifiers` (two-hop: child -> invoice_items ->
 * invoices) and `invoice_payments` (one-hop: child -> invoices).
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
 * These tables have NO tenant_id column: isolation flows through the
 * parent-walking EXISTS policies. Every runtime-role observation runs inside
 * a transaction that binds the tenant context with the production SQL
 * (TENANT_CONTEXT_SET_CONFIG_SQL, transaction-local) and is then ROLLED
 * BACK: the GUC is discarded with the transaction, so the pool is never left
 * with a defined-and-empty `app.tenant_id` (the issue #358 poisoning), and
 * the runtime role never mutates the fixtures. An insert "success" is proven
 * inside its own transaction — the statement returning a row IS the WITH
 * CHECK passing.
 *
 * Real-schema constraint hygiene (nothing may mask the RLS verdict):
 * - `invoices.tenant_id` is `uuid NOT NULL` with a real FK to tenants(id);
 *   `user_id` is uuid NOT NULL with NO FK constraint, so it is seeded with a
 *   synthetic uuid — the RLS verdict never depends on a user row.
 * - `invoice_number` carries only an index (no unique constraint), so two
 *   tenants CAN hold the same invoice number — the identical-invoice
 *   cross-tenant setup below is ordinary production data, and the shared
 *   number is what a policy-less table would leak through.
 * - `invoice_payments` and `invoice_item_modifiers` have no unique
 *   constraints at all: every cross-tenant INSERT below is rejected by the
 *   WITH CHECK half alone, never by a constraint.
 * - Every NOT NULL column is supplied by the insert proofs, so each proof
 *   fails (or passes) on RLS alone, never on a missing NOT NULL value.
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
function returningRows(result: unknown): Array<{ id: string }> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<{ id: string }>;
  }
  return (Array.isArray(result) ? result : []) as Array<{ id: string }>;
}

describe('parent-owned sales children tenant RLS (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(180000);

  let admin: DataSource;
  let runtime: DataSource;
  let schema: string;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;

  // A and B own the seeded invoice chains; C and D are fresh synthetic
  // tenant contexts for the INSERT proofs. Tenants exist as real rows —
  // invoices carry a real FK to tenants(id).
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const tenantCId = randomUUID();
  const tenantDId = randomUUID();

  // Two tenants holding an IDENTICAL invoice number: invoice_number is
  // indexed but NOT unique, so this is ordinary production data.
  const SHARED_INVOICE_NUMBER = 'FCT-SHARED-0001';

  // Seeded probe rows, one full chain per tenant (A and B): invoice -> item
  // -> modifier, and invoice -> payment.
  const invoiceAId = randomUUID();
  const invoiceBId = randomUUID();
  const itemAId = randomUUID();
  const itemBId = randomUUID();
  const modifierAId = randomUUID();
  const modifierBId = randomUUID();
  const paymentAId = randomUUID();
  const paymentBId = randomUUID();

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

    // Real tenant rows first: invoices carry a real FK to tenants(id).
    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $9), ($3, $4, $10), ($5, $6, $11), ($7, $8, $12)`,
      [
        tenantAId,
        'parent-owned-rls-tenant-a',
        tenantBId,
        'parent-owned-rls-tenant-b',
        tenantCId,
        'parent-owned-rls-tenant-c',
        tenantDId,
        'parent-owned-rls-tenant-d',
        normalizeTenantSlug('parent-owned-rls-tenant-a'),
        normalizeTenantSlug('parent-owned-rls-tenant-b'),
        normalizeTenantSlug('parent-owned-rls-tenant-c'),
        normalizeTenantSlug('parent-owned-rls-tenant-d'),
      ],
    );

    // One full invoice chain per tenant, with the IDENTICAL invoice number:
    // invoices.user_id has no FK, so a synthetic uuid is ordinary data.
    await admin.query(
      `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, user_id, subtotal, total_tax, total)
       VALUES ($1, $2, $4, now(), $5, 100.00, 15.00, 115.00),
              ($3, $6, $4, now(), $5, 100.00, 15.00, 115.00)`,
      [
        invoiceAId,
        tenantAId,
        invoiceBId,
        SHARED_INVOICE_NUMBER,
        randomUUID(),
        tenantBId,
      ],
    );

    await admin.query(
      `INSERT INTO invoice_items (id, invoice_id, tenant_id, product_id, product_name, quantity, unit_price, original_tax_rate, applied_tax_rate, tax_amount, total)
       VALUES ($1, $3, $6, $5, 'Espresso', 1, 100.00, 15, 15, 15.00, 115.00),
              ($2, $4, $7, $5, 'Espresso', 1, 100.00, 15, 15, 15.00, 115.00)`,
      [
        itemAId,
        itemBId,
        invoiceAId,
        invoiceBId,
        randomUUID(),
        tenantAId,
        tenantBId,
      ],
    );

    await admin.query(
      `INSERT INTO invoice_item_modifiers (id, invoice_item_id, name, extra_price)
       VALUES ($1, $3, 'Extra shot', 10.00),
              ($2, $4, 'Extra shot', 10.00)`,
      [modifierAId, modifierBId, itemAId, itemBId],
    );

    await admin.query(
      `INSERT INTO invoice_payments (id, invoice_id, method, amount)
       VALUES ($1, $3, 'CASH', 115.00),
              ($2, $4, 'CASH', 115.00)`,
      [paymentAId, paymentBId, invoiceAId, invoiceBId],
    );

    // The fixture's runtime role: NOSUPERUSER NOBYPASSRLS, non-owner, exact
    // ordinary DML grants. Production-shaped for RLS evaluation.
    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
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
      `SELECT (SELECT count(*)::int FROM invoice_item_modifiers) AS modifiers,
              (SELECT count(*)::int FROM invoice_payments) AS payments,
              (SELECT count(*)::int FROM invoice_items) AS items,
              (SELECT count(*)::int FROM invoices) AS invoices`,
    );
    expect(seeded[0]).toEqual({
      modifiers: 2,
      payments: 2,
      items: 2,
      invoices: 2,
    });

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
          AND tablename IN ('invoice_item_modifiers', 'invoice_payments')
          AND tableowner = $2`,
      [schema, fixture.runtimeRoleName],
    );
    expect(ownership[0].count).toBe(0);
  });

  it('enables AND forces row level security on both tables with exactly one command-specific policy per command', async () => {
    const facts = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('invoice_item_modifiers', 'invoice_payments')
        ORDER BY c.relname`,
      [schema],
    );

    expect(facts).toEqual([
      {
        relname: 'invoice_item_modifiers',
        rls_enabled: true,
        rls_forced: true,
      },
      { relname: 'invoice_payments', rls_enabled: true, rls_forced: true },
    ]);

    const policies = await admin.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
        WHERE schemaname = $1 AND tablename IN ('invoice_item_modifiers', 'invoice_payments')
        ORDER BY tablename, policyname`,
      [schema],
    );
    // EXACTLY the four command policies per table: an extra policy would
    // widen access beyond the tenant contract, a missing one narrows it.
    expect(policies).toEqual([
      {
        tablename: 'invoice_item_modifiers',
        policyname: 'invoice_item_modifiers_tenant_delete',
        cmd: 'DELETE',
      },
      {
        tablename: 'invoice_item_modifiers',
        policyname: 'invoice_item_modifiers_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'invoice_item_modifiers',
        policyname: 'invoice_item_modifiers_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'invoice_item_modifiers',
        policyname: 'invoice_item_modifiers_tenant_update',
        cmd: 'UPDATE',
      },
      {
        tablename: 'invoice_payments',
        policyname: 'invoice_payments_tenant_delete',
        cmd: 'DELETE',
      },
      {
        tablename: 'invoice_payments',
        policyname: 'invoice_payments_tenant_insert',
        cmd: 'INSERT',
      },
      {
        tablename: 'invoice_payments',
        policyname: 'invoice_payments_tenant_select',
        cmd: 'SELECT',
      },
      {
        tablename: 'invoice_payments',
        policyname: 'invoice_payments_tenant_update',
        cmd: 'UPDATE',
      },
    ]);

    // Every defined expression walks the parent tenant_id with the uuid-cast
    // setting form: the two-hop walk for modifiers, one-hop for payments.
    const exprs = await admin.query(
      `SELECT tablename, policyname, qual, with_check FROM pg_policies
        WHERE schemaname = $1
          AND tablename IN ('invoice_item_modifiers', 'invoice_payments')
        ORDER BY tablename, policyname`,
      [schema],
    );
    for (const expr of exprs) {
      for (const half of [expr.qual, expr.with_check]) {
        if (half === null) continue;
        expect(half).toContain('invoices');
        // PostgreSQL deparses the setting with an implicit ::text cast on
        // the literal, so the catalog form is
        // current_setting('app.tenant_id'::text, true) — assert on the
        // stable prefix, never on the exact written spelling.
        expect(half).toContain("current_setting('app.tenant_id'");
        expect(half).toContain('::uuid');
      }
    }
  });

  it('denies an unbound runtime role every row of both tables', async () => {
    await asRuntimeRole(runtime, null, async (runner) => {
      const modifiers = (await runner.query(
        `SELECT count(*)::int AS count FROM invoice_item_modifiers`,
      )) as Array<{ count: number }>;
      expect(modifiers[0].count).toBe(0);

      const payments = (await runner.query(
        `SELECT count(*)::int AS count FROM invoice_payments`,
      )) as Array<{ count: number }>;
      expect(payments[0].count).toBe(0);
    });
  });

  it('shows tenant A only its own modifier and payment rows, never tenant B’s', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const modifiers = (await runner.query(
        `SELECT id FROM invoice_item_modifiers`,
      )) as Array<{ id: string }>;
      expect(modifiers.map((r) => r.id)).toEqual([modifierAId]);

      const payments = (await runner.query(
        `SELECT id FROM invoice_payments`,
      )) as Array<{ id: string }>;
      expect(payments.map((r) => r.id)).toEqual([paymentAId]);
    });
  });

  it('shows tenant B only its own rows (triangulation)', async () => {
    await asRuntimeRole(runtime, tenantBId, async (runner) => {
      const modifiers = (await runner.query(
        `SELECT id FROM invoice_item_modifiers`,
      )) as Array<{ id: string }>;
      expect(modifiers.map((r) => r.id)).toEqual([modifierBId]);

      const payments = (await runner.query(
        `SELECT id FROM invoice_payments`,
      )) as Array<{ id: string }>;
      expect(payments.map((r) => r.id)).toEqual([paymentBId]);
    });
  });

  it('blocks a tenant-bound id-keyed SELECT of the other tenant’s rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const foreignModifier = (await runner.query(
        `SELECT id FROM invoice_item_modifiers WHERE id = $1`,
        [modifierBId],
      )) as Array<{ id: string }>;
      expect(foreignModifier).toEqual([]);

      const foreignPayment = (await runner.query(
        `SELECT id FROM invoice_payments WHERE id = $1`,
        [paymentBId],
      )) as Array<{ id: string }>;
      expect(foreignPayment).toEqual([]);
    });
  });

  it('accepts a tenant-bound runtime role inserting its own rows into both tables', async () => {
    // Bound to tenant A, writing children of A's OWN invoice chain: the
    // statement returning its row IS the WITH CHECK half passing. Proven
    // inside the rolled-back transaction.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const insertedModifier = returningRows(
        await runner.query(
          `INSERT INTO invoice_item_modifiers (invoice_item_id, name, extra_price)
           VALUES ($1, 'Soy milk', 15.00) RETURNING id`,
          [itemAId],
        ),
      );
      expect(insertedModifier).toHaveLength(1);

      const insertedPayment = returningRows(
        await runner.query(
          `INSERT INTO invoice_payments (invoice_id, method, amount)
           VALUES ($1, 'CARD', 115.00) RETURNING id`,
          [invoiceAId],
        ),
      );
      expect(insertedPayment).toHaveLength(1);
    });
  });

  it('rejects a tenant-bound runtime role inserting a modifier whose parent item belongs to another tenant', async () => {
    // Bound to A, parented on B's item: the FK would accept it (FK checks
    // ignore RLS), so ONLY the WITH CHECK's two-hop walk stands between this
    // statement and B's invoice. One statement per transaction: the RLS
    // rejection aborts the transaction it happens in.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO invoice_item_modifiers (invoice_item_id, name, extra_price)
           VALUES ($1, 'Hijack modifier', 99.00) RETURNING id`,
          [itemBId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('rejects a tenant-bound runtime role inserting a payment whose parent invoice belongs to another tenant', async () => {
    // The POS-originated direct-INSERT case: a payment row pointing at a
    // foreign invoice id must be rejected by /row-level security/, never
    // silently accepted because the FK resolves.
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      await expect(
        runner.query(
          `INSERT INTO invoice_payments (invoice_id, method, amount)
           VALUES ($1, 'CASH', 115.00) RETURNING id`,
          [invoiceBId],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('lets tenant A update and delete its own rows in both tables', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedModifier = returningRows(
        await runner.query(
          `UPDATE invoice_item_modifiers SET extra_price = 12.00 WHERE id = $1 RETURNING id`,
          [modifierAId],
        ),
      );
      expect(updatedModifier.map((r) => r.id)).toEqual([modifierAId]);

      const updatedPayment = returningRows(
        await runner.query(
          `UPDATE invoice_payments SET amount = 110.00 WHERE id = $1 RETURNING id`,
          [paymentAId],
        ),
      );
      expect(updatedPayment.map((r) => r.id)).toEqual([paymentAId]);

      // Delete of throwaway own rows: insert then delete inside the same
      // transaction, proving DELETE's USING clause admits tenant A's rows.
      const throwawayModifier = returningRows(
        await runner.query(
          `INSERT INTO invoice_item_modifiers (invoice_item_id, name, extra_price)
           VALUES ($1, 'Delete proof', 1.00) RETURNING id`,
          [itemAId],
        ),
      );
      const deletedModifier = returningRows(
        await runner.query(
          `DELETE FROM invoice_item_modifiers WHERE id = $1 RETURNING id`,
          [throwawayModifier[0].id],
        ),
      );
      expect(deletedModifier.map((r) => r.id)).toEqual([
        throwawayModifier[0].id,
      ]);

      const throwawayPayment = returningRows(
        await runner.query(
          `INSERT INTO invoice_payments (invoice_id, method, amount)
           VALUES ($1, 'CASH', 1.00) RETURNING id`,
          [invoiceAId],
        ),
      );
      const deletedPayment = returningRows(
        await runner.query(
          `DELETE FROM invoice_payments WHERE id = $1 RETURNING id`,
          [throwawayPayment[0].id],
        ),
      );
      expect(deletedPayment.map((r) => r.id)).toEqual([throwawayPayment[0].id]);
    });
  });

  it('stops tenant A’s UPDATE and DELETE from touching tenant B’s rows in either table', async () => {
    await asRuntimeRole(runtime, tenantAId, async (runner) => {
      const updatedModifier = returningRows(
        await runner.query(
          `UPDATE invoice_item_modifiers SET extra_price = 0.01 WHERE id = $1 RETURNING id`,
          [modifierBId],
        ),
      );
      expect(updatedModifier).toEqual([]);

      const updatedPayment = returningRows(
        await runner.query(
          `UPDATE invoice_payments SET amount = 0.01 WHERE id = $1 RETURNING id`,
          [paymentBId],
        ),
      );
      expect(updatedPayment).toEqual([]);

      const deletedModifier = returningRows(
        await runner.query(
          `DELETE FROM invoice_item_modifiers WHERE id = $1 RETURNING id`,
          [modifierBId],
        ),
      );
      expect(deletedModifier).toEqual([]);

      const deletedPayment = returningRows(
        await runner.query(
          `DELETE FROM invoice_payments WHERE id = $1 RETURNING id`,
          [paymentBId],
        ),
      );
      expect(deletedPayment).toEqual([]);
    });
  });

  describe('identical-invoice cross-tenant isolation (issue #512 T3 slice 9)', () => {
    // VACUITY GUARD — what each assertion below would look like if row level
    // security were ABSENT on the child tables (or bypassed by the role).
    // The guard is what keeps this suite from passing vacuously: a
    // tenant-less invariant (e.g. asserting only "the query returns a row")
    // would hold with or without policies.
    //
    //   SELECT id FROM invoice_item_modifiers WHERE invoice_item_id = <B's item>
    //     -> ONE row — B's modifier, readable by tenant A through the item id.
    //   SELECT id FROM invoice_payments WHERE invoice_id = <B's invoice>
    //     -> ONE row — B's payment, readable through the shared invoice
    //        number's sibling document.
    //   UPDATE invoice_payments SET ... WHERE invoice_id = <B's invoice>
    //        RETURNING id
    //     -> ONE row — tenant A would mutate B's payment through the parent
    //        invoice id.
    //   INSERT with a foreign parent id
    //     -> ACCEPTED — a child row lands under another tenant's invoice
    //        because the FK (which ignores RLS) resolves.
    //
    // Every `toEqual([])` below pins ZERO foreign rows, so a missing or
    // bypassed policy makes these tests fail on the extra foreign row —
    // they cannot pass vacuously.
    it('returns no foreign modifier through the parent item id lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM invoice_item_modifiers WHERE invoice_item_id = $1`,
          [itemBId],
        )) as Array<{ id: string }>;
        expect(rows).toEqual([]);
      });
    });

    it('returns no foreign payment through the parent invoice id lookup', async () => {
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const rows = (await runner.query(
          `SELECT id FROM invoice_payments WHERE invoice_id = $1`,
          [invoiceBId],
        )) as Array<{ id: string }>;
        expect(rows).toEqual([]);
      });
    });

    it('scopes a parent-keyed UPDATE to the bound tenant’s own payment only', async () => {
      // A parent-keyed write mirrors the POS payment receiver updating a
      // payment by invoice; under an absent policy it would RETURN B's id
      // and overwrite B's payment row.
      await asRuntimeRole(runtime, tenantAId, async (runner) => {
        const updated = returningRows(
          await runner.query(
            `UPDATE invoice_payments SET amount = 111.00
              WHERE invoice_id = $1 RETURNING id`,
            [invoiceBId],
          ),
        );
        expect(updated).toEqual([]);
      });
    });

    it('rejects a foreign-tenant INSERT carrying the shared invoice number’s parent chain', async () => {
      // Bound to C, parented on B's item: the values match B's chain
      // textually, and only the WITH CHECK half stands between this
      // statement and B's invoice document. One statement per transaction.
      await asRuntimeRole(runtime, tenantCId, async (runner) => {
        await expect(
          runner.query(
            `INSERT INTO invoice_item_modifiers (invoice_item_id, name, extra_price)
             VALUES ($1, 'Foreign proof', 20.00) RETURNING id`,
            [itemBId],
          ),
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
