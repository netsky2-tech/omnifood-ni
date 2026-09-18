import { QueryResult, type QueryRunner } from 'typeorm';
import {
  PREVIOUS_TENANT_RLS_PREDICATE,
  TENANT_RLS_PREDICATE,
  rebindTenantColumns,
  resolveTenantRlsPredicate,
  type TenantRlsTarget,
} from './tenant-rls-policy';

/**
 * Builds a query runner mock that records every SQL statement, in order, and
 * answers the emitter's information_schema lookups with the given column
 * type. `data_type`/`character_maximum_length` mirror the shape of
 * information_schema.columns.
 */
const createQueryRunner = (columnType: {
  data_type: string;
  character_maximum_length?: number | null;
}) => {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string): Promise<QueryResult> => {
      queries.push(sql);
      const result = new QueryResult();
      if (sql.includes('information_schema.columns')) {
        result.records = [
          {
            data_type: columnType.data_type,
            character_maximum_length:
              columnType.character_maximum_length ?? null,
          },
        ];
      }
      return Promise.resolve(result);
    }),
  } as unknown as QueryRunner;

  return { queryRunner, queries };
};

const allPolicyTarget = (
  overrides: Partial<TenantRlsTarget> = {},
): TenantRlsTarget => ({
  table: 'inventory_kardex',
  previousType: 'character varying',
  policies: [
    {
      table: 'inventory_kardex',
      policyName: 'kardex_tenant_isolation',
      cmd: 'ALL',
      using: true,
      check: true,
    },
  ],
  ...overrides,
});

describe('rebindTenantColumns', () => {
  it('orders each table: drop policies, then the type change, then create policies', async () => {
    const { queryRunner, queries } = createQueryRunner({
      data_type: 'character varying',
    });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    const dropIndex = queries.findIndex((sql) => sql.includes('DROP POLICY'));
    const alterIndex = queries.findIndex((sql) => sql.includes('ALTER TABLE'));
    const createIndex = queries.findIndex((sql) =>
      sql.includes('CREATE POLICY'),
    );

    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(alterIndex).toBeGreaterThan(dropIndex);
    expect(createIndex).toBeGreaterThan(alterIndex);
  });

  it('emits USING and WITH CHECK independently, so ALL yields both halves', async () => {
    const { queryRunner, queries } = createQueryRunner({
      data_type: 'character varying',
    });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    const createStatement = queries.find((sql) =>
      sql.includes('CREATE POLICY'),
    );

    expect(createStatement).toContain('FOR ALL');
    expect(createStatement).toContain(`USING (${TENANT_RLS_PREDICATE})`);
    expect(createStatement).toContain(`WITH CHECK (${TENANT_RLS_PREDICATE})`);
  });

  it('emits only USING for a DELETE row and only WITH CHECK for an INSERT row', async () => {
    const { queryRunner, queries } = createQueryRunner({
      data_type: 'character varying',
    });

    await rebindTenantColumns(
      queryRunner,
      [
        allPolicyTarget({
          policies: [
            {
              table: 'inventory_kardex',
              policyName: 'kardex_tenant_delete',
              cmd: 'DELETE',
              using: true,
              check: false,
            },
            {
              table: 'inventory_kardex',
              policyName: 'kardex_tenant_insert',
              cmd: 'INSERT',
              using: false,
              check: true,
            },
          ],
        }),
      ],
      TENANT_RLS_PREDICATE,
    );

    const deleteStatement = queries.find((sql) =>
      sql.includes('CREATE POLICY "kardex_tenant_delete"'),
    );
    const insertStatement = queries.find((sql) =>
      sql.includes('CREATE POLICY "kardex_tenant_insert"'),
    );

    expect(deleteStatement).toContain('FOR DELETE');
    expect(deleteStatement).toContain(`USING (${TENANT_RLS_PREDICATE})`);
    expect(deleteStatement).not.toContain('WITH CHECK');

    expect(insertStatement).toContain('FOR INSERT');
    expect(insertStatement).toContain(`WITH CHECK (${TENANT_RLS_PREDICATE})`);
    expect(insertStatement?.includes('USING')).toBe(false);
  });

  it('skips the column type change when the column is already uuid', async () => {
    const { queryRunner, queries } = createQueryRunner({ data_type: 'uuid' });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    expect(queries.some((sql) => sql.includes('ALTER TABLE'))).toBe(false);
    // Policies are still rebound.
    expect(queries.some((sql) => sql.includes('DROP POLICY'))).toBe(true);
    expect(queries.some((sql) => sql.includes('CREATE POLICY'))).toBe(true);
  });

  it('changes a varchar column to uuid with a column-side cast in USING', async () => {
    const { queryRunner, queries } = createQueryRunner({
      data_type: 'character varying',
    });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    const alter = queries.find((sql) => sql.includes('ALTER TABLE'));

    expect(alter).toBe(
      'ALTER TABLE "inventory_kardex" ALTER COLUMN "tenant_id" TYPE uuid ' +
        'USING "tenant_id"::uuid',
    );
  });

  it('reads the column type from the raw rows array shape TypeORM returns at runtime', async () => {
    // PostgresQueryRunner.query returns raw.rows (a plain array), not a
    // structured QueryResult; the emitter must accept that shape too.
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<unknown> => {
        queries.push(sql);
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([
            { data_type: 'character varying', character_maximum_length: null },
          ]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    expect(
      queries.some((sql) =>
        sql.includes(
          'ALTER COLUMN "tenant_id" TYPE uuid USING "tenant_id"::uuid',
        ),
      ),
    ).toBe(true);
  });

  it('rejects an unsupported column type, naming the table and the type', async () => {
    const { queryRunner } = createQueryRunner({ data_type: 'integer' });

    await expect(
      rebindTenantColumns(
        queryRunner,
        [allPolicyTarget()],
        TENANT_RLS_PREDICATE,
      ),
    ).rejects.toThrow(/inventory_kardex[\s\S]*integer/);
  });

  it('fails closed when the tenant_id column is missing', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string): Promise<QueryResult> => {
        queries.push(sql);
        return Promise.resolve(new QueryResult());
      }),
    } as unknown as QueryRunner;

    await expect(
      rebindTenantColumns(
        queryRunner,
        [allPolicyTarget()],
        TENANT_RLS_PREDICATE,
      ),
    ).rejects.toThrow(/inventory_kardex/);
    expect(queries.some((sql) => sql.includes('ALTER TABLE'))).toBe(false);
  });

  it('restores the previous type when the caller resolves it, with a setting-side cast form', async () => {
    const { queryRunner, queries } = createQueryRunner({ data_type: 'uuid' });

    await rebindTenantColumns(
      queryRunner,
      [
        allPolicyTarget({
          previousType: 'character varying(128)',
        }),
      ],
      PREVIOUS_TENANT_RLS_PREDICATE,
      (target) => target.previousType,
    );

    const alter = queries.find((sql) => sql.includes('ALTER TABLE'));

    expect(alter).toBe(
      'ALTER TABLE "inventory_kardex" ALTER COLUMN "tenant_id" TYPE character varying(128) ' +
        'USING "tenant_id"::text',
    );
  });

  it('quotes identifiers in drop, alter and create statements', async () => {
    const { queryRunner, queries } = createQueryRunner({
      data_type: 'character varying',
    });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    expect(queries).toContain(
      'DROP POLICY IF EXISTS "kardex_tenant_isolation" ON "inventory_kardex"',
    );
    expect(
      queries.some((sql) =>
        sql.includes('CREATE POLICY "kardex_tenant_isolation"'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (sql) =>
          sql.includes("tablename = 'inventory_kardex'") &&
          sql.includes("policyname = 'kardex_tenant_isolation'"),
      ),
    ).toBe(true);
  });

  it('guards CREATE POLICY on the catalog inside a DO block', async () => {
    const { queryRunner, queries } = createQueryRunner({ data_type: 'uuid' });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    const createStatement = queries.find((sql) =>
      sql.includes('CREATE POLICY'),
    );

    expect(createStatement).toMatch(/^DO \$\$ BEGIN/);
    expect(createStatement).toContain('IF NOT EXISTS');
    expect(createStatement?.trim().endsWith('END $$;')).toBe(true);
  });

  it('rejects a policy row that names a different table than its target', async () => {
    const { queryRunner } = createQueryRunner({ data_type: 'uuid' });

    await expect(
      rebindTenantColumns(
        queryRunner,
        [
          allPolicyTarget({
            policies: [
              {
                table: 'inventory_sync_outbox',
                policyName: 'kardex_tenant_isolation',
                cmd: 'ALL',
                using: true,
                check: true,
              },
            ],
          }),
        ],
        TENANT_RLS_PREDICATE,
      ),
    ).rejects.toThrow(/inventory_sync_outbox[\s\S]*inventory_kardex/);
  });

  it('parameterises the information_schema lookup instead of interpolating values', async () => {
    const { queryRunner, queries } = createQueryRunner({ data_type: 'uuid' });

    await rebindTenantColumns(
      queryRunner,
      [allPolicyTarget()],
      TENANT_RLS_PREDICATE,
    );

    const lookup = queries.find((sql) =>
      sql.includes('information_schema.columns'),
    );

    expect(lookup).toContain('table_name = $1');
    expect(lookup).toContain('column_name = $2');
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.columns'),
      ['inventory_kardex', 'tenant_id'],
    );
  });

  describe('resolveTenantRlsPredicate', () => {
    it('returns the setting-cast predicate for a uuid column', async () => {
      const { queryRunner, queries } = createQueryRunner({ data_type: 'uuid' });

      await expect(
        resolveTenantRlsPredicate(queryRunner, 'inventory_kardex'),
      ).resolves.toBe(TENANT_RLS_PREDICATE);
      expect(
        queries.filter((sql) => sql.includes('information_schema.columns')),
      ).toHaveLength(1);
    });

    it('returns the column-cast predicate for character varying and text columns', async () => {
      for (const dataType of ['character varying', 'text']) {
        const { queryRunner } = createQueryRunner({ data_type: dataType });

        await expect(
          resolveTenantRlsPredicate(queryRunner, 'inventory_kardex'),
        ).resolves.toBe(PREVIOUS_TENANT_RLS_PREDICATE);
      }
    });

    it('fails closed, naming the table, when the column is missing', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn((sql: string): Promise<unknown> => {
          queries.push(sql);
          return Promise.resolve(
            sql.includes('information_schema.columns') ? [] : {},
          );
        }),
      } as unknown as QueryRunner;

      await expect(
        resolveTenantRlsPredicate(queryRunner, 'inventory_kardex'),
      ).rejects.toThrow(/inventory_kardex/);
    });

    it('fails closed, naming the table and the type, for an unsupported type', async () => {
      const { queryRunner } = createQueryRunner({ data_type: 'integer' });

      await expect(
        resolveTenantRlsPredicate(queryRunner, 'inventory_kardex'),
      ).rejects.toThrow(/inventory_kardex[\s\S]*integer/);
    });
  });
});
