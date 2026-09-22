/**
 * Authoritative tenant RLS coverage classification and gate (issue #493, T1).
 *
 * Why this exists
 * ---------------
 * scripts/verify-schema-build.sh only collected public tables that already
 * carry FORCE ROW LEVEL SECURITY, so a tenant-bearing table with no ENABLE,
 * no FORCE, and no policy was invisible to every existing invariant. This
 * module is the single deterministic classification source that closes that
 * class: every public base table must be classified, and each stored class
 * carries its own structural contract.
 *
 * Stored classes
 * --------------
 *   direct        — the table carries tenant_id, ENABLE RLS, FORCE RLS, and
 *                   at least one policy (the policy predicate vocabulary and
 *                   form are already asserted by the existing schema-build
 *                   invariants; this module never redefines them).
 *   parent-owned  — no direct tenant column; isolation flows through a
 *                   foreign key to a tenant-bearing parent. Policy work for
 *                   this class is explicitly deferred to issue #493 T3.
 *   global        — reviewed platform / pre-tenant / infrastructure
 *                   exception (for example the TypeORM migration ledger).
 *   debt          — current tenant isolation debt, permitted only as an
 *                   explicit temporary ratchet entry. A debt table that
 *                   becomes fully tenant-protected is STALE and must be
 *                   promoted to direct.
 *
 * Computed failure bucket
 * -----------------------
 * Every public base table absent from the manifest is "prohibited/
 * unclassified" and fails. The manifest itself is judged fail-closed too:
 * unknown classifications, malformed lines, and duplicate entries fail
 * rather than being skipped, because a silently dropped line would widen
 * the gate without anyone deciding to.
 *
 * The module is dependency-free (Node built-ins only) so the shell verifier
 * can require the compiled file directly and the Jest suites can exercise
 * the exact same rules the production gate enforces.
 */

export type RlsCoverageClass = 'direct' | 'parent-owned' | 'global' | 'debt';

export const RLS_COVERAGE_CLASSES: readonly RlsCoverageClass[] = [
  'direct',
  'parent-owned',
  'global',
  'debt',
];

/** One reviewed manifest entry: a public base table and its stored class. */
export interface TenantRlsManifestEntry {
  table: string;
  classification: RlsCoverageClass;
}

/** A manifest line that could not be parsed; the gate fails closed on these. */
export interface TenantRlsManifestIssue {
  line: number;
  text: string;
  reason: string;
}

/** The parsed manifest: valid entries plus every fail-closed parse finding. */
export interface ParsedTenantRlsManifest {
  entries: TenantRlsManifestEntry[];
  duplicateTables: string[];
  issues: TenantRlsManifestIssue[];
}

/** The structural facts the gate needs about one public base table. */
export interface TenantRlsCatalogTable {
  name: string;
  hasTenantIdColumn: boolean;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
}

export type TenantRlsCoverageFailureKind =
  | 'unclassified-table'
  | 'stale-manifest-entry'
  | 'duplicate-manifest-entry'
  | 'invalid-manifest-line'
  | 'direct-without-tenant-column'
  | 'direct-without-rls-protection'
  | 'tenant-bearing-global'
  | 'tenant-bearing-parent-owned'
  | 'debt-fully-protected-stale';

export interface TenantRlsCoverageFailure {
  kind: TenantRlsCoverageFailureKind;
  table: string;
  detail: string;
}

export interface TenantRlsCoverageResult {
  failures: TenantRlsCoverageFailure[];
  /** Table count per stored class, for the verifier's deterministic report. */
  classifiedCounts: Record<RlsCoverageClass, number>;
}

/**
 * Full tenant protection: the exact state a `direct` classification requires
 * and the exact state that makes a `debt` entry stale.
 */
export function isFullyTenantProtected(table: TenantRlsCatalogTable): boolean {
  return (
    table.hasTenantIdColumn &&
    table.rlsEnabled &&
    table.rlsForced &&
    table.policyCount > 0
  );
}

/**
 * Parse the manifest text. Lines are `table|classification`; `#` comments and
 * blank lines are ignored; surrounding whitespace is trimmed. Anything else
 * is recorded as an issue and the gate fails closed on it.
 */
export function parseManifestText(text: string): ParsedTenantRlsManifest {
  const entries: TenantRlsManifestEntry[] = [];
  const issues: TenantRlsManifestIssue[] = [];
  const seen = new Map<string, number>();

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('|');
    if (separator <= 0) {
      issues.push({
        line: index + 1,
        text: line,
        reason: 'expected "table|classification"',
      });
      continue;
    }

    const table = line.slice(0, separator).trim();
    const classification = line.slice(separator + 1).trim();
    if (!(RLS_COVERAGE_CLASSES as readonly string[]).includes(classification)) {
      issues.push({
        line: index + 1,
        text: line,
        reason: `unknown classification "${classification}" (expected ${RLS_COVERAGE_CLASSES.join(', ')})`,
      });
      continue;
    }

    seen.set(table, (seen.get(table) ?? 0) + 1);
    entries.push({ table, classification: classification as RlsCoverageClass });
  }

  const duplicateTables = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([table]) => table)
    .sort();

  return { entries, duplicateTables, issues };
}

/** Load and parse the manifest from disk; a missing file throws (fail closed). */
export function loadTenantRlsManifest(path: string): ParsedTenantRlsManifest {
  // Lazy require keeps this module importable in every Jest environment.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  return parseManifestText(fs.readFileSync(path, 'utf8'));
}

function directProtectionGaps(table: TenantRlsCatalogTable): string[] {
  const missing: string[] = [];
  if (!table.rlsEnabled) missing.push('ENABLE ROW LEVEL SECURITY');
  if (!table.rlsForced) missing.push('FORCE ROW LEVEL SECURITY');
  if (table.policyCount < 1) missing.push('at least one RLS policy');
  return missing;
}

/**
 * The coverage gate. Deterministic by construction: failures are sorted by
 * kind then table, details name schema objects only, and no tenant data is
 * ever read (the caller supplies structural catalog rows).
 */
export function evaluateTenantRlsCoverage(
  manifest: ParsedTenantRlsManifest,
  tables: readonly TenantRlsCatalogTable[],
): TenantRlsCoverageResult {
  const failures: TenantRlsCoverageFailure[] = [];
  const classifiedCounts: Record<RlsCoverageClass, number> = {
    direct: 0,
    'parent-owned': 0,
    global: 0,
    debt: 0,
  };

  for (const issue of manifest.issues) {
    failures.push({
      kind: 'invalid-manifest-line',
      table: `(line ${issue.line})`,
      detail: `${issue.reason}: ${issue.text}`,
    });
  }

  for (const duplicate of manifest.duplicateTables) {
    failures.push({
      kind: 'duplicate-manifest-entry',
      table: duplicate,
      detail: 'classified more than once; the manifest must carry one entry per table',
    });
  }

  const byTable = new Map(tables.map((table) => [table.name, table]));
  const evaluated = new Set<string>();

  for (const entry of manifest.entries) {
    // A duplicated table is judged once (first entry wins); the duplicate
    // entry itself is already a failure, and re-judging would only add noise
    // findings on top of it.
    if (evaluated.has(entry.table)) continue;
    evaluated.add(entry.table);

    const table = byTable.get(entry.table);
    if (!table) {
      failures.push({
        kind: 'stale-manifest-entry',
        table: entry.table,
        detail: `classified ${entry.classification} but no such public base table exists; delete or update the entry`,
      });
      continue;
    }

    classifiedCounts[entry.classification]++;

    if (entry.classification === 'direct') {
      if (!table.hasTenantIdColumn) {
        failures.push({
          kind: 'direct-without-tenant-column',
          table: entry.table,
          detail:
            'classified direct but declares no tenant_id column; use parent-owned or global with a reviewed reason',
        });
        continue;
      }
      const missing = directProtectionGaps(table);
      if (missing.length > 0) {
        failures.push({
          kind: 'direct-without-rls-protection',
          table: entry.table,
          detail: `missing: ${missing.join(', ')}`,
        });
      }
      continue;
    }

    if (entry.classification === 'global' && table.hasTenantIdColumn) {
      failures.push({
        kind: 'tenant-bearing-global',
        table: entry.table,
        detail:
          'declares tenant_id but is classified global; global tables must be pre-tenant or platform infrastructure',
      });
      continue;
    }

    if (entry.classification === 'parent-owned' && table.hasTenantIdColumn) {
      failures.push({
        kind: 'tenant-bearing-parent-owned',
        table: entry.table,
        detail:
          'declares tenant_id but is classified parent-owned; parent-owned tables must have no direct tenant column',
      });
      continue;
    }

    if (entry.classification === 'debt' && isFullyTenantProtected(table)) {
      failures.push({
        kind: 'debt-fully-protected-stale',
        table: entry.table,
        detail:
          'debt entry is now fully tenant-protected (tenant_id, ENABLE, FORCE, and at least one policy); promote it to direct and delete the debt entry',
      });
    }
  }

  for (const table of tables) {
    const classified = manifest.entries.some((entry) => entry.table === table.name);
    if (!classified) {
      failures.push({
        kind: 'unclassified-table',
        table: table.name,
        detail: 'public base table has no classification entry',
      });
    }
  }

  failures.sort((a, b) =>
    a.kind === b.kind ? a.table.localeCompare(b.table) : a.kind.localeCompare(b.kind),
  );

  return { failures, classifiedCounts };
}
