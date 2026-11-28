import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  createMigrationBuiltSchemaFixture,
  MigrationBuiltSchemaFixture,
} from '../../../../test/support/migration-built-schema.helper';
import { UserRole } from '../../identity/entities/user.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

interface ExplainAnalyzeResult {
  Plan: Record<string, unknown>;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

function collectPlanNodeTypes(
  node: Record<string, unknown>,
  acc: string[] = [],
): string[] {
  if (typeof node['Node Type'] === 'string') {
    const indexName =
      typeof node['Index Name'] === 'string' ? `(${node['Index Name']})` : '';
    acc.push(`${node['Node Type']}${indexName}`);
  }
  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      if (child && typeof child === 'object') {
        collectPlanNodeTypes(child as Record<string, unknown>, acc);
      }
    }
  }
  return acc;
}

describe('Pilot 30-Day Volume Gate G4.5 & #534 Q-B1/Q-B2 (real PostgreSQL 16 DB)', () => {
  const TEST_TIMEOUT_MS = 120000;
  const TENANT_PILOT = randomUUID();
  const TENANT_ANOMALY = randomUUID();
  const USER_PILOT = randomUUID();
  const USER_ANOMALY = randomUUID();

  // Fixed 30-day window: 2026-03-01 .. 2026-03-30 (100 invoices/day = 3,000)
  const WINDOW_START = '2026-03-01T00:00:00.000-06:00';
  const WINDOW_END = '2026-03-30T23:59:59.999-06:00';

  let fixture: MigrationBuiltSchemaFixture;
  let dataSource: DataSource;

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${fixture.schema},public -c statement_timeout=30000`,
      },
    });
    await dataSource.initialize();

    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
       VALUES ($1, 'Pilot Cafe 30d', $2, true, now(), now()),
              ($3, 'Anomaly Test Tenant', $4, true, now(), now())`,
      [
        TENANT_PILOT,
        normalizeTenantSlug(`pilot-30d-${TENANT_PILOT.slice(0, 8)}`),
        TENANT_ANOMALY,
        normalizeTenantSlug(`anomaly-${TENANT_ANOMALY.slice(0, 8)}`),
      ],
    );

    await dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, 'cashier-pilot@test.local', 'hash', 'Pilot Cashier', $3, true, now(), now()),
              ($4, $5, 'cashier-anom@test.local', 'hash', 'Anomaly Cashier', $3, true, now(), now())`,
      [
        USER_PILOT,
        TENANT_PILOT,
        UserRole.CASHIER,
        USER_ANOMALY,
        TENANT_ANOMALY,
      ],
    );

    // Seed 3,000 invoices (100/day x 30 days) + 9,000 invoice_items (3/invoice)
    await dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        TENANT_PILOT,
      ]);

      await manager.query(
        `
        WITH days AS (
          SELECT generate_series(0, 29) AS day_idx
        ),
        per_day AS (
          SELECT generate_series(1, 100) AS slot_idx
        ),
        seq AS (
          SELECT
            (day_idx * 100 + slot_idx) AS n,
            day_idx,
            slot_idx,
            ('2026-03-01T08:00:00-06:00'::timestamptz
              + (day_idx || ' days')::interval
              + ((slot_idx * 7) || ' minutes')::interval) AS ts
          FROM days CROSS JOIN per_day
        )
        INSERT INTO invoices (
          id, tenant_id, invoice_number, created_at, local_issue_date, user_id,
          subtotal, total_tax, total, is_canceled, payment_status,
          global_tax_override, type, updated_at
        )
        SELECT
          uuid_generate_v4(),
          $1::uuid,
          '001-001-01-' || lpad(n::text, 8, '0'),
          ts,
          (ts AT TIME ZONE 'America/Managua')::date,
          $2::uuid,
          260.87,
          39.13,
          300.00,
          false,
          'PAID',
          false,
          'regular',
          ts
        FROM seq
        `,
        [TENANT_PILOT, USER_PILOT],
      );

      // 3 items per invoice = 9,000 invoice_items across 15 café products
      await manager.query(
        `
        WITH prod_catalog AS (
          SELECT
            idx,
            ('00000000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid AS product_id,
            CASE idx
              WHEN 1 THEN 'Café Americano'
              WHEN 2 THEN 'Latte Vainilla'
              WHEN 3 THEN 'Cappuccino'
              WHEN 4 THEN 'Croissant Jamón y Queso'
              WHEN 5 THEN 'Panini Caprese'
              WHEN 6 THEN 'Smoothie Mango'
              WHEN 7 THEN 'Espresso Doble'
              WHEN 8 THEN 'Frappé Mocha'
              WHEN 9 THEN 'Bagel Queso Crema'
              WHEN 10 THEN 'Té Chai Latte'
              WHEN 11 THEN 'Muffin Arándanos'
              WHEN 12 THEN 'Jugo Naranja Natural'
              WHEN 13 THEN 'Sándwich Club'
              WHEN 14 THEN 'Brownie Chocolate'
              ELSE 'Agua Embotellada'
            END AS product_name
          FROM generate_series(1, 15) AS idx
        ),
        inv_numbered AS (
          SELECT id, row_number() OVER (ORDER BY invoice_number) AS rn
          FROM invoices
          WHERE tenant_id = $1
        )
        INSERT INTO invoice_items (
          id, tenant_id, invoice_id, product_id, product_name,
          quantity, unit_price, original_tax_rate, applied_tax_rate,
          tax_amount, total, discount
        )
        SELECT
          uuid_generate_v4(),
          $1::uuid,
          inv.id,
          p.product_id,
          p.product_name,
          1,
          100.00,
          0.15,
          0.15,
          13.04,
          100.00,
          0
        FROM inv_numbered inv
        CROSS JOIN generate_series(1, 3) AS line_no
        JOIN prod_catalog p
          ON p.idx = (((inv.rn + line_no - 2) % 15) + 1)
        `,
        [TENANT_PILOT],
      );
    });

    // Seed anomaly tenant: 00000001, 00000002, 00000004 (1 sequence gap at 00000003)
    // Duplicate 00000002 is injected inside the Q-B1/Q-B2 test after verifying uq_invoices_tenant_invoice_number.
    await dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        TENANT_ANOMALY,
      ]);
      await manager.query(
        `INSERT INTO invoices (
           id, tenant_id, invoice_number, created_at, local_issue_date, user_id,
           subtotal, total_tax, total, is_canceled, payment_status,
           global_tax_override, type, updated_at
         ) VALUES
         ($1, $2, '001-001-01-00000001', '2026-03-01T10:00:00-06:00', '2026-03-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now()),
         ($4, $2, '001-001-01-00000002', '2026-03-01T10:05:00-06:00', '2026-03-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now()),
         ($5, $2, '001-001-01-00000004', '2026-03-01T10:15:00-06:00', '2026-03-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now())`,
        [
          randomUUID(),
          TENANT_ANOMALY,
          USER_ANOMALY,
          randomUUID(),
          randomUUID(),
        ],
      );
    });

    await dataSource.query('ANALYZE invoices');
    await dataSource.query('ANALYZE invoice_items');
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await dataSource?.destroy().catch(() => undefined);
    await fixture?.close().catch(() => undefined);
  });

  async function runBenchQuery<T>(
    label: string,
    tenantId: string,
    sql: string,
    params: unknown[],
  ): Promise<{
    rows: T[];
    wallMs: number;
    execMs: number;
    planNodes: string[];
  }> {
    return dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);

      const t0 = performance.now();
      const rows = (await manager.query(sql, params)) as T[];
      const wallMs = Number((performance.now() - t0).toFixed(2));

      const explainRows = (await manager.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
        params,
      )) as Array<{ 'QUERY PLAN': ExplainAnalyzeResult[] | string }>;

      const rawPlan = explainRows[0]['QUERY PLAN'];
      const parsed = (
        typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan
      ) as ExplainAnalyzeResult[];
      const top = parsed[0];
      const execMs = Number((top['Execution Time'] ?? wallMs).toFixed(2));
      const planNodes = collectPlanNodeTypes(top.Plan);

      process.stdout.write(
        `[G4.5_PG16_BENCH] ${label}: wallMs=${wallMs}ms execMs=${execMs}ms plan=${planNodes.join(' -> ')}\n`,
      );

      return { rows, wallMs, execMs, planNodes };
    });
  }

  it(
    'G4.5: daily sales, top products, and monthly fiscal summary all execute < 500ms on 3,000 invoices / 9,000 items',
    async () => {
      const counts = await dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          TENANT_PILOT,
        ]);
        const [invCount] = (await manager.query(
          `SELECT COUNT(*)::int AS cnt FROM invoices WHERE tenant_id = $1`,
          [TENANT_PILOT],
        )) as Array<{ cnt: number }>;
        const [itemCount] = (await manager.query(
          `SELECT COUNT(*)::int AS cnt FROM invoice_items WHERE tenant_id = $1`,
          [TENANT_PILOT],
        )) as Array<{ cnt: number }>;
        return { invCount: invCount.cnt, itemCount: itemCount.cnt };
      });
      expect(counts.invCount).toBe(3000);
      expect(counts.itemCount).toBe(9000);

      // 1. Daily sales aggregation over 30 days
      const daily = await runBenchQuery<{
        day: string;
        invoice_count: number;
        total: string;
      }>(
        'daily_sales_30d',
        TENANT_PILOT,
        `SELECT
           date_trunc('day', created_at AT TIME ZONE 'America/Managua')::date AS day,
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(subtotal), 0)::numeric(12,2) AS subtotal,
           COALESCE(SUM(total_tax), 0)::numeric(12,2) AS total_tax,
           COALESCE(SUM(total), 0)::numeric(12,2) AS total
         FROM invoices
         WHERE tenant_id = $1
           AND is_canceled = false
           AND created_at >= $2::timestamptz
           AND created_at <= $3::timestamptz
         GROUP BY 1
         ORDER BY 1 ASC`,
        [TENANT_PILOT, WINDOW_START, WINDOW_END],
      );
      expect(daily.rows).toHaveLength(30);
      expect(daily.wallMs).toBeLessThan(500);
      expect(daily.execMs).toBeLessThan(500);

      // 2. Top products aggregation over 30 days (invoice_items join invoices)
      const topProducts = await runBenchQuery<{
        product_id: string;
        product_name: string;
        units_sold: string;
        gross_sales: string;
      }>(
        'top_products_30d',
        TENANT_PILOT,
        `SELECT
           ii.product_id,
           ii.product_name,
           SUM(ii.quantity)::numeric(12,2) AS units_sold,
           SUM(ii.total)::numeric(12,2) AS gross_sales
         FROM invoice_items ii
         INNER JOIN invoices i
           ON i.id = ii.invoice_id
          AND i.tenant_id = ii.tenant_id
         WHERE i.tenant_id = $1
           AND i.is_canceled = false
           AND i.created_at >= $2::timestamptz
           AND i.created_at <= $3::timestamptz
         GROUP BY ii.product_id, ii.product_name
         ORDER BY gross_sales DESC
         LIMIT 20`,
        [TENANT_PILOT, WINDOW_START, WINDOW_END],
      );
      expect(topProducts.rows).toHaveLength(15);
      expect(topProducts.wallMs).toBeLessThan(500);
      expect(topProducts.execMs).toBeLessThan(500);

      // 3. Monthly fiscal summary aggregation
      const monthly = await runBenchQuery<{
        invoice_count: number;
        credit_note_count: number;
        gross_total: string;
      }>(
        'monthly_fiscal_summary_30d',
        TENANT_PILOT,
        `SELECT
           COUNT(*) FILTER (WHERE type <> 'creditNote')::int AS invoice_count,
           COUNT(*) FILTER (WHERE type = 'creditNote')::int AS credit_note_count,
           COALESCE(SUM(subtotal) FILTER (WHERE type <> 'creditNote'), 0)::numeric(12,2) AS gross_subtotal,
           COALESCE(SUM(total_tax) FILTER (WHERE type <> 'creditNote'), 0)::numeric(12,2) AS tax_collected,
           COALESCE(SUM(total) FILTER (WHERE type <> 'creditNote'), 0)::numeric(12,2) AS gross_total
         FROM invoices
         WHERE tenant_id = $1
           AND is_canceled = false
           AND created_at >= $2::timestamptz
           AND created_at <= $3::timestamptz`,
        [TENANT_PILOT, WINDOW_START, WINDOW_END],
      );
      expect(monthly.rows[0].invoice_count).toBe(3000);
      expect(Number(monthly.rows[0].gross_total)).toBe(900000);
      expect(monthly.wallMs).toBeLessThan(500);
      expect(monthly.execMs).toBeLessThan(500);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '#534 Q-B1 & Q-B2: clean 3,000-invoice tenant has 0 duplicates & 0 gaps; anomaly tenant detects copies=2 and gaps>=1',
    async () => {
      const qb1Sql = `
        SELECT invoice_number, COUNT(*)::int AS copies
        FROM invoices
        WHERE tenant_id = $1
        GROUP BY invoice_number
        HAVING COUNT(*) > 1
        ORDER BY copies DESC, invoice_number ASC
      `;

      const qb2Sql = `
        WITH parsed AS (
          SELECT
            invoice_number,
            created_at,
            regexp_replace(invoice_number, '\\d+$', '') AS series_prefix,
            substring(invoice_number from '(\\d+)$')::bigint AS seq_num
          FROM invoices
          WHERE tenant_id = $1
            AND invoice_number ~ '\\d+$'
        ),
        ordered AS (
          SELECT
            series_prefix,
            seq_num,
            LAG(seq_num) OVER (PARTITION BY series_prefix ORDER BY seq_num, created_at) AS prev_seq
          FROM parsed
        )
        SELECT
          series_prefix,
          (prev_seq + 1)::bigint AS gap_start,
          (seq_num - 1)::bigint AS gap_end,
          (seq_num - prev_seq - 1)::bigint AS missing_count
        FROM ordered
        WHERE prev_seq IS NOT NULL AND seq_num - prev_seq > 1
        ORDER BY series_prefix, gap_start
      `;

      // Clean 3,000-invoice pilot tenant
      const cleanResult = await dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          TENANT_PILOT,
        ]);
        const dups = (await manager.query(qb1Sql, [TENANT_PILOT])) as Array<{
          invoice_number: string;
          copies: number;
        }>;
        const gaps = (await manager.query(qb2Sql, [TENANT_PILOT])) as Array<{
          series_prefix: string;
          gap_start: string;
          gap_end: string;
          missing_count: string;
        }>;
        return { dups, gaps };
      });

      expect(cleanResult.dups).toHaveLength(0);
      expect(cleanResult.gaps).toHaveLength(0);

      // Confirm production unique index blocks duplicate invoice_number by default
      await expect(
        dataSource.transaction(async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            TENANT_ANOMALY,
          ]);
          await manager.query(
            `INSERT INTO invoices (
               id, tenant_id, invoice_number, created_at, local_issue_date, user_id,
               subtotal, total_tax, total, is_canceled, payment_status,
               global_tax_override, type, updated_at
             ) VALUES ($1, $2, '001-001-01-00000002', '2026-03-01T10:06:00-06:00', '2026-03-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now())`,
            [randomUUID(), TENANT_ANOMALY, USER_ANOMALY],
          );
        }),
      ).rejects.toThrow(/uq_invoices_tenant_invoice_number/);

      // Drop the unique index in this isolated scratch schema to simulate a legacy duplicate and verify Q-B1 detection
      await dataSource.query(
        `DROP INDEX IF EXISTS "${fixture.schema}".uq_invoices_tenant_invoice_number`,
      );
      await dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          TENANT_ANOMALY,
        ]);
        await manager.query(
          `INSERT INTO invoices (
             id, tenant_id, invoice_number, created_at, local_issue_date, user_id,
             subtotal, total_tax, total, is_canceled, payment_status,
             global_tax_override, type, updated_at
           ) VALUES ($1, $2, '001-001-01-00000002', '2026-03-01T10:06:00-06:00', '2026-03-01', $3, 100, 15, 115, false, 'PAID', false, 'regular', now())`,
          [randomUUID(), TENANT_ANOMALY, USER_ANOMALY],
        );
      });

      // Anomaly tenant with 1 duplicate (00000002 x2) and 1 gap (00000003 missing)
      const anomalyResult = await dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
          TENANT_ANOMALY,
        ]);
        const dups = (await manager.query(qb1Sql, [TENANT_ANOMALY])) as Array<{
          invoice_number: string;
          copies: number;
        }>;
        const gaps = (await manager.query(qb2Sql, [TENANT_ANOMALY])) as Array<{
          series_prefix: string;
          gap_start: string;
          gap_end: string;
          missing_count: string;
        }>;
        return { dups, gaps };
      });

      expect(anomalyResult.dups).toEqual([
        { invoice_number: '001-001-01-00000002', copies: 2 },
      ]);
      expect(anomalyResult.gaps.length).toBeGreaterThanOrEqual(1);
      expect(Number(anomalyResult.gaps[0].missing_count)).toBe(1);
      expect(Number(anomalyResult.gaps[0].gap_start)).toBe(3);
      expect(Number(anomalyResult.gaps[0].gap_end)).toBe(3);
    },
    TEST_TIMEOUT_MS,
  );
});
