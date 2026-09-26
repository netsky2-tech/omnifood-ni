import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  evaluateTenantRlsCoverage,
  loadTenantRlsManifest,
  parseManifestText,
  type TenantRlsCatalogTable,
} from './tenant-rls-coverage';

function table(
  overrides: Partial<TenantRlsCatalogTable> = {},
): TenantRlsCatalogTable {
  return {
    name: 'example_table',
    hasTenantIdColumn: true,
    rlsEnabled: true,
    rlsForced: true,
    policyCount: 2,
    ...overrides,
  };
}

describe('tenant RLS coverage manifest parser', () => {
  it('parses table|classification lines and strips comments and blank lines', () => {
    const parsed = parseManifestText(
      [
        '# reviewed classification manifest',
        '',
        'invoices|direct',
        '  invoice_items|direct  ',
        'invoice_payments|parent-owned',
        'migrations|global',
        'onboarding_sessions|debt',
      ].join('\n'),
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.duplicateTables).toEqual([]);
    expect(parsed.entries).toEqual([
      { table: 'invoices', classification: 'direct' },
      { table: 'invoice_items', classification: 'direct' },
      { table: 'invoice_payments', classification: 'parent-owned' },
      { table: 'migrations', classification: 'global' },
      { table: 'onboarding_sessions', classification: 'debt' },
    ]);
  });

  it('rejects unknown classifications fail-closed instead of skipping them', () => {
    const parsed = parseManifestText('invoices|direct\nnot_a_table|platform');

    expect(parsed.entries).toEqual([
      { table: 'invoices', classification: 'direct' },
    ]);
    expect(parsed.issues).toEqual([
      {
        line: 2,
        text: 'not_a_table|platform',
        reason:
          'unknown classification "platform" (expected direct, parent-owned, global, debt)',
      },
    ]);
  });

  it('rejects malformed lines fail-closed instead of skipping them', () => {
    const parsed = parseManifestText('invoices|direct\njust-a-table-name');

    expect(parsed.issues).toEqual([
      {
        line: 2,
        text: 'just-a-table-name',
        reason: 'expected "table|classification"',
      },
    ]);
  });

  it('records duplicate table entries as ratchet violations', () => {
    const parsed = parseManifestText('invoices|direct\ninvoices|debt');

    expect(parsed.duplicateTables).toEqual(['invoices']);
  });

  describe('compound direct command sets (issue #512 T3 slice 10)', () => {
    it('parses direct:<SET> entries into their declared command letters', () => {
      const parsed = parseManifestText(
        [
          'invoices|direct:SIUD',
          'device_sync_credential_events|direct:SI',
          'inventory_sync_outbox|direct:SIU',
          'migrations|global',
        ].join('\n'),
      );

      expect(parsed.issues).toEqual([]);
      expect(parsed.entries).toEqual([
        {
          table: 'invoices',
          classification: 'direct',
          declaredCommands: ['S', 'I', 'U', 'D'],
        },
        {
          table: 'device_sync_credential_events',
          classification: 'direct',
          declaredCommands: ['S', 'I'],
        },
        {
          table: 'inventory_sync_outbox',
          classification: 'direct',
          declaredCommands: ['S', 'I', 'U'],
        },
        { table: 'migrations', classification: 'global' },
      ]);
    });

    it('rejects a command set on a non-direct classification fail-closed', () => {
      const parsed = parseManifestText('migrations|global:SIUD');

      expect(parsed.entries).toEqual([]);
      expect(parsed.issues).toEqual([
        {
          line: 1,
          text: 'migrations|global:SIUD',
          reason:
            'command sets are only defined for the direct classification, got "global:SIUD"',
        },
      ]);
    });

    it('rejects unknown command letters fail-closed', () => {
      const parsed = parseManifestText('invoices|direct:SIXD');

      expect(parsed.entries).toEqual([]);
      expect(parsed.issues).toEqual([
        {
          line: 1,
          text: 'invoices|direct:SIXD',
          reason:
            'invalid command set "direct:SIXD" (expected one or more of S, I, U, D, e.g. direct:SIUD)',
        },
      ]);
    });

    it('rejects an empty command set fail-closed', () => {
      const parsed = parseManifestText('invoices|direct:');

      expect(parsed.issues).toEqual([
        {
          line: 1,
          text: 'invoices|direct:',
          reason:
            'invalid command set "direct:" (expected one or more of S, I, U, D, e.g. direct:SIUD)',
        },
      ]);
    });

    it('rejects duplicated command letters fail-closed', () => {
      const parsed = parseManifestText('invoices|direct:SIIS');

      expect(parsed.issues).toEqual([
        {
          line: 1,
          text: 'invoices|direct:SIIS',
          reason:
            'invalid command set "direct:SIIS" (expected one or more of S, I, U, D, e.g. direct:SIUD)',
        },
      ]);
    });

    it('rejects lowercase command letters fail-closed', () => {
      const parsed = parseManifestText('invoices|direct:siud');

      expect(parsed.issues).toEqual([
        {
          line: 1,
          text: 'invoices|direct:siud',
          reason:
            'invalid command set "direct:siud" (expected one or more of S, I, U, D, e.g. direct:SIUD)',
        },
      ]);
    });
  });

  it('loads a manifest from disk and fails on a missing file', () => {
    const missingPath = join(
      tmpdir(),
      `missing-rls-manifest-${Date.now()}.txt`,
    );
    expect(() => loadTenantRlsManifest(missingPath)).toThrow();

    const dir = mkdtempSync(join(tmpdir(), 'rls-manifest-'));
    const manifestPath = join(dir, 'manifest.txt');
    writeFileSync(manifestPath, '# comment\ninvoices|direct\n', 'utf8');
    expect(existsSync(manifestPath)).toBe(true);

    const parsed = loadTenantRlsManifest(manifestPath);
    expect(parsed.entries).toEqual([
      { table: 'invoices', classification: 'direct' },
    ]);
    expect(parsed.issues).toEqual([]);
  });
});

describe('tenant RLS coverage evaluation', () => {
  it('accepts a fully protected direct table', () => {
    const manifest = parseManifestText('invoices|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
    ]);

    expect(result.failures).toEqual([]);
  });

  it('fails on a public base table absent from the manifest (unclassified)', () => {
    const manifest = parseManifestText('invoices|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
      table({
        name: 'smuggled_tenant_table',
        rlsEnabled: false,
        rlsForced: false,
        policyCount: 0,
      }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'unclassified-table',
        table: 'smuggled_tenant_table',
        detail: 'public base table has no classification entry',
      },
    ]);
  });

  it('fails on a manifest entry whose table no longer exists (stale ratchet)', () => {
    const manifest = parseManifestText('invoices|direct\ndropped_table|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'stale-manifest-entry',
        table: 'dropped_table',
        detail:
          'classified direct but no such public base table exists; delete or update the entry',
      },
    ]);
  });

  it('fails on duplicate manifest entries', () => {
    const manifest = parseManifestText('invoices|direct\ninvoices|debt');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'duplicate-manifest-entry',
        table: 'invoices',
        detail:
          'classified more than once; the manifest must carry one entry per table',
      },
    ]);
  });

  it('fails closed on manifest parse issues', () => {
    const manifest = parseManifestText('invoices|direct\nbogus|nonsense');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'invalid-manifest-line',
        table: '(line 2)',
        detail:
          'unknown classification "nonsense" (expected direct, parent-owned, global, debt): bogus|nonsense',
      },
    ]);
  });

  it('fails on a direct table without a tenant_id column', () => {
    const manifest = parseManifestText('example_table|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ hasTenantIdColumn: false }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'direct-without-tenant-column',
        table: 'example_table',
        detail:
          'classified direct but declares no tenant_id column; use parent-owned or global with a reviewed reason',
      },
    ]);
  });

  it('fails on a direct table missing ENABLE, FORCE, or any policy', () => {
    const manifest = parseManifestText('a|direct\nb|direct\nc|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'a', rlsEnabled: false, rlsForced: true, policyCount: 3 }),
      table({ name: 'b', rlsEnabled: true, rlsForced: false, policyCount: 3 }),
      table({ name: 'c', rlsEnabled: true, rlsForced: true, policyCount: 0 }),
    ]);

    expect(result.failures).toEqual([
      {
        kind: 'direct-without-rls-protection',
        table: 'a',
        detail: 'missing: ENABLE ROW LEVEL SECURITY',
      },
      {
        kind: 'direct-without-rls-protection',
        table: 'b',
        detail: 'missing: FORCE ROW LEVEL SECURITY',
      },
      {
        kind: 'direct-without-rls-protection',
        table: 'c',
        detail: 'missing: at least one RLS policy',
      },
    ]);
  });

  it('fails on a tenant-bearing table classified global', () => {
    const manifest = parseManifestText('example_table|global');
    const result = evaluateTenantRlsCoverage(manifest, [table()]);

    expect(result.failures).toEqual([
      {
        kind: 'tenant-bearing-global',
        table: 'example_table',
        detail:
          'declares tenant_id but is classified global; global tables must be pre-tenant or platform infrastructure',
      },
    ]);
  });

  it('fails on a tenant-bearing table classified parent-owned', () => {
    const manifest = parseManifestText('example_table|parent-owned');
    const result = evaluateTenantRlsCoverage(manifest, [table()]);

    expect(result.failures).toEqual([
      {
        kind: 'tenant-bearing-parent-owned',
        table: 'example_table',
        detail:
          'declares tenant_id but is classified parent-owned; parent-owned tables must have no direct tenant column',
      },
    ]);
  });

  it('accepts a debt table that still carries tenant isolation debt', () => {
    const manifest = parseManifestText('example_table|debt');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ rlsEnabled: false, rlsForced: false, policyCount: 0 }),
    ]);

    expect(result.failures).toEqual([]);
  });

  it('rejects a debt table that became fully tenant-protected (stale debt must be promoted)', () => {
    const manifest = parseManifestText('example_table|debt');
    const result = evaluateTenantRlsCoverage(manifest, [table()]);

    expect(result.failures).toEqual([
      {
        kind: 'debt-fully-protected-stale',
        table: 'example_table',
        detail:
          'debt entry is now fully tenant-protected (tenant_id, ENABLE, FORCE, and at least one policy); promote it to direct and delete the debt entry',
      },
    ]);
  });

  it('accepts a global table without a tenant column and a parent-owned table without one', () => {
    const manifest = parseManifestText(
      'migrations|global\ninvoice_payments|parent-owned',
    );
    const result = evaluateTenantRlsCoverage(manifest, [
      table({
        name: 'migrations',
        hasTenantIdColumn: false,
        rlsEnabled: false,
        rlsForced: false,
        policyCount: 0,
      }),
      table({
        name: 'invoice_payments',
        hasTenantIdColumn: false,
        rlsEnabled: false,
        rlsForced: false,
        policyCount: 0,
      }),
    ]);

    expect(result.failures).toEqual([]);
  });

  it('reports failures deterministically sorted by kind then table', () => {
    const manifest = parseManifestText('zzz|direct\naaa|global');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'zzz', hasTenantIdColumn: false }),
      table({ name: 'aaa' }),
      table({
        name: 'mmm',
        rlsEnabled: false,
        rlsForced: false,
        policyCount: 0,
      }),
    ]);

    expect(result.failures.map((f) => [f.kind, f.table])).toEqual([
      ['direct-without-tenant-column', 'zzz'],
      ['tenant-bearing-global', 'aaa'],
      ['unclassified-table', 'mmm'],
    ]);
  });

  it('does not count a legacy bare direct entry toward the declared command ratchet', () => {
    const manifest = parseManifestText('invoices|direct');
    const result = evaluateTenantRlsCoverage(manifest, [
      table({ name: 'invoices' }),
    ]);

    expect(result.failures).toEqual([]);
    expect(result.classifiedCounts.direct).toBe(1);
    // Legacy entries carry no command set and no per-command enforcement.
    expect(result.legacyDirectEntries).toBe(1);
    expect(result.declaredCommandDirectEntries).toBe(0);
  });

  it('counts compound direct entries toward the declared command ratchet', () => {
    const manifest = parseManifestText(
      'invoices|direct:SIUD\naudit_logs|debt\nmigrations|global',
    );
    const result = evaluateTenantRlsCoverage(
      manifest,
      [
        table({ name: 'invoices', policyCount: 4 }),
        table({
          name: 'audit_logs',
          rlsEnabled: false,
          rlsForced: false,
          policyCount: 0,
        }),
        table({
          name: 'migrations',
          hasTenantIdColumn: false,
          rlsEnabled: false,
          rlsForced: false,
          policyCount: 0,
        }),
      ],
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((command) => ({
        table: 'invoices',
        command,
      })),
    );

    expect(result.failures).toEqual([]);
    expect(result.legacyDirectEntries).toBe(0);
    expect(result.declaredCommandDirectEntries).toBe(1);
  });

  describe('declared per-command enforcement (issue #512 T3 slice 10)', () => {
    const commands = (rows: Array<[string, string]>) =>
      rows.map(([table, command]) => ({ table, command }));

    it('accepts a direct:SIUD table whose policies cover exactly the four commands', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'invoices', policyCount: 4 })],
        commands([
          ['invoices', 'SELECT'],
          ['invoices', 'INSERT'],
          ['invoices', 'UPDATE'],
          ['invoices', 'DELETE'],
        ]),
      );

      expect(result.failures).toEqual([]);
    });

    it('accepts a narrower declared set when the actual policies match it exactly', () => {
      const manifest = parseManifestText(
        'device_sync_credential_events|direct:SI\ninventory_sync_outbox|direct:SIU',
      );
      const result = evaluateTenantRlsCoverage(
        manifest,
        [
          table({ name: 'device_sync_credential_events', policyCount: 2 }),
          table({ name: 'inventory_sync_outbox', policyCount: 3 }),
        ],
        commands([
          ['device_sync_credential_events', 'SELECT'],
          ['device_sync_credential_events', 'INSERT'],
          ['inventory_sync_outbox', 'SELECT'],
          ['inventory_sync_outbox', 'INSERT'],
          ['inventory_sync_outbox', 'UPDATE'],
        ]),
      );

      expect(result.failures).toEqual([]);
    });

    it('treats a FOR ALL policy as covering all four commands (defensive)', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'invoices', policyCount: 1 })],
        commands([['invoices', 'ALL']]),
      );

      expect(result.failures).toEqual([]);
    });

    it('fails a FOR ALL policy against a narrower declared set: the commands outside the set are undeclared', () => {
      const manifest = parseManifestText('kardex_correction|direct:SI');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'kardex_correction', policyCount: 1 })],
        commands([['kardex_correction', 'ALL']]),
      );

      expect(result.failures).toEqual([
        {
          kind: 'undeclared-command-policy',
          table: 'kardex_correction',
          detail:
            'policy command UPDATE (U) is outside the declared set "direct:SI"',
        },
        {
          kind: 'undeclared-command-policy',
          table: 'kardex_correction',
          detail:
            'policy command DELETE (D) is outside the declared set "direct:SI"',
        },
      ]);
    });

    it('fails every declared command that no policy covers', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'invoices', policyCount: 1 })],
        commands([['invoices', 'SELECT']]),
      );

      expect(result.failures).toEqual([
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command INSERT (I) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command UPDATE (U) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command DELETE (D) has no policy; the entry declares "direct:SIUD"',
        },
      ]);
    });

    it('fails a policy whose command is outside the declared set', () => {
      const manifest = parseManifestText('sys_parametros_config|direct:SI');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'sys_parametros_config', policyCount: 3 })],
        commands([
          ['sys_parametros_config', 'SELECT'],
          ['sys_parametros_config', 'INSERT'],
          ['sys_parametros_config', 'UPDATE'],
        ]),
      );

      expect(result.failures).toEqual([
        {
          kind: 'undeclared-command-policy',
          table: 'sys_parametros_config',
          detail:
            'policy command UPDATE (U) is outside the declared set "direct:SI"',
        },
      ]);
    });

    it('fails closed when a declared entry has no pg_policies command evidence at all', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(manifest, [
        table({ name: 'invoices' }),
      ]);

      expect(result.failures).toEqual([
        {
          kind: 'policy-command-evidence-missing',
          table: 'invoices',
          detail:
            'entry declares the command set "direct:SIUD" but no pg_policies command evidence was supplied; the per-command ratchet cannot be judged without it',
        },
      ]);
    });

    it('fails closed on an unknown pg_policies command spelling', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'invoices', policyCount: 1 })],
        commands([['invoices', 'TRUNCATE']]),
      );

      // The unknown spelling covers nothing, so every declared command is
      // also missing its policy; the unknown command itself is judged
      // outside the set. Missing failures sort before undeclared ones.
      expect(result.failures).toEqual([
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command SELECT (S) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command INSERT (I) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command UPDATE (U) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'missing-declared-command-policy',
          table: 'invoices',
          detail:
            'declared command DELETE (D) has no policy; the entry declares "direct:SIUD"',
        },
        {
          kind: 'undeclared-command-policy',
          table: 'invoices',
          detail:
            'policy command TRUNCATE is outside the declared set "direct:SIUD"',
        },
      ]);
    });

    it('ignores policy evidence for tables the manifest does not classify (the unclassified check owns those)', () => {
      const manifest = parseManifestText('invoices|direct:SIUD');
      const result = evaluateTenantRlsCoverage(
        manifest,
        [table({ name: 'invoices', policyCount: 4 })],
        commands([
          ['invoices', 'SELECT'],
          ['invoices', 'INSERT'],
          ['invoices', 'UPDATE'],
          ['invoices', 'DELETE'],
          ['smuggled_table', 'DELETE'],
        ]),
      );

      expect(result.failures).toEqual([]);
    });
  });
});
