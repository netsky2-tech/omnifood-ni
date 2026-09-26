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
 *   direct:<SET>  — the table carries tenant_id, ENABLE RLS, FORCE RLS, and
 *                   per-command policies covering EXACTLY the declared
 *                   command set <SET> (letters S/I/U/D of SELECT/INSERT/
 *                   UPDATE/DELETE, issue #512 T3 slice 10): every declared
 *                   command has at least one policy, and no policy command
 *                   exists outside the set. A FOR ALL policy covers all four
 *                   commands and only satisfies direct:SIUD.
 *   direct        — legacy bare spelling: the structural contract only
 *                   (tenant_id, ENABLE, FORCE, at least one policy), no
 *                   per-command ratchet. Kept for the DB specs' in-code
 *                   fixture manifests; the production manifest must not use
 *                   it, and the shell verifier fails on any bare entry.
 *   parent-owned  — no direct tenant column; isolation flows through a
 *                   foreign key to a tenant-bearing parent. Policy work for
 *                   this class landed in issue #512 T3 slice 9.
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
 * unknown classifications, malformed lines, bad command-set tokens (unknown,
 * lowercase, empty, or duplicated letters; a set on a non-direct class), and
 * duplicate entries fail rather than being skipped, because a silently
 * dropped line would widen the gate without anyone deciding to. A declared
 * `direct:<SET>` entry is additionally judged against the pg_policies command
 * facts the caller supplies (missing declared commands and policy commands
 * outside the set are failures; missing command evidence fails closed).
 *
 * The module is dependency-free (Node built-ins only) so the shell verifier
 * can require the compiled file directly and the Jest suites can exercise
 * the exact same rules the production gate enforces.
 */

import { readFileSync } from 'node:fs';

export type RlsCoverageClass = 'direct' | 'parent-owned' | 'global' | 'debt';

export const RLS_COVERAGE_CLASSES: readonly RlsCoverageClass[] = [
  'direct',
  'parent-owned',
  'global',
  'debt',
];

/**
 * One declared policy command, spelled as the manifest letter of the compound
 * `direct:<SET>` classification (issue #512 T3 slice 10).
 */
export type TenantRlsCommandLetter = 'S' | 'I' | 'U' | 'D';

export const TENANT_RLS_COMMAND_LETTERS: readonly TenantRlsCommandLetter[] = [
  'S',
  'I',
  'U',
  'D',
];

/** The pg_policies `cmd` spelling for each declared command letter. */
const COMMAND_BY_LETTER: Record<TenantRlsCommandLetter, string> = {
  S: 'SELECT',
  I: 'INSERT',
  U: 'UPDATE',
  D: 'DELETE',
};

/** The declared command letter for a pg_policies `cmd` spelling, or null. */
function letterByCommand(command: string): TenantRlsCommandLetter | null {
  const letter = (
    Object.keys(COMMAND_BY_LETTER) as TenantRlsCommandLetter[]
  ).find((candidate) => COMMAND_BY_LETTER[candidate] === command);
  return letter ?? null;
}

/**
 * One pg_policies fact the per-command ratchet judges: a policy command
 * exists on a table. `command` is the pg_policies `cmd` spelling ('SELECT',
 * 'INSERT', 'UPDATE', 'DELETE' or 'ALL'); a FOR ALL policy covers all four
 * declared commands and is judged as such (defensive: after slice 10 no
 * direct table should carry one).
 */
export interface TenantRlsPolicyCommandRow {
  table: string;
  command: string;
}

/** One reviewed manifest entry: a public base table and its stored class. */
export interface TenantRlsManifestEntry {
  table: string;
  classification: RlsCoverageClass;
  /**
   * The declared per-command set of a compound `direct:<SET>` entry, in the
   * order the entry declares it. Undefined for the legacy bare `direct`
   * spelling, which carries no per-command ratchet (the production manifest
   * must not use it; the shell verifier fails on any bare entry).
   */
  declaredCommands?: readonly TenantRlsCommandLetter[];
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
  | 'debt-fully-protected-stale'
  | 'missing-declared-command-policy'
  | 'undeclared-command-policy'
  | 'policy-command-evidence-missing';

export interface TenantRlsCoverageFailure {
  kind: TenantRlsCoverageFailureKind;
  table: string;
  detail: string;
}

export interface TenantRlsCoverageResult {
  failures: TenantRlsCoverageFailure[];
  /** Table count per stored class, for the verifier's deterministic report. */
  classifiedCounts: Record<RlsCoverageClass, number>;
  /**
   * `direct` entries still using the legacy bare spelling (no per-command
   * ratchet). The production manifest must carry none; the shell verifier
   * fails the run when this is non-zero so the legacy spelling cannot widen
   * the gate silently.
   */
  legacyDirectEntries: number;
  /** `direct` entries carrying a declared per-command set. */
  declaredCommandDirectEntries: number;
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

    // Compound form: `direct:<SET>` declares the per-command policy set the
    // table's policies must cover EXACTLY (issue #512 T3 slice 10). The set
    // is judged here, fail-closed: a bad token is an issue, never a silently
    // widened entry.
    const colonAt = classification.indexOf(':');
    if (colonAt >= 0) {
      const baseClass = classification.slice(0, colonAt);
      const commandSet = classification.slice(colonAt + 1);
      const letters = [...commandSet];
      const isValidSet =
        baseClass === 'direct' &&
        letters.length > 0 &&
        letters.every((letter) =>
          (TENANT_RLS_COMMAND_LETTERS as readonly string[]).includes(letter),
        ) &&
        new Set(letters).size === letters.length;
      if (!isValidSet) {
        issues.push({
          line: index + 1,
          text: line,
          reason:
            baseClass !== 'direct'
              ? `command sets are only defined for the direct classification, got "${classification}"`
              : `invalid command set "${classification}" (expected one or more of S, I, U, D, e.g. direct:SIUD)`,
        });
        continue;
      }

      seen.set(table, (seen.get(table) ?? 0) + 1);
      entries.push({
        table,
        classification: 'direct',
        declaredCommands: letters as TenantRlsCommandLetter[],
      });
      continue;
    }

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
  return parseManifestText(readFileSync(path, 'utf8'));
}

function directProtectionGaps(table: TenantRlsCatalogTable): string[] {
  const missing: string[] = [];
  if (!table.rlsEnabled) missing.push('ENABLE ROW LEVEL SECURITY');
  if (!table.rlsForced) missing.push('FORCE ROW LEVEL SECURITY');
  if (table.policyCount < 1) missing.push('at least one RLS policy');
  return missing;
}

/**
 * The declared per-command set of one compound `direct:<SET>` entry, spelled
 * the way the manifest carries it (e.g. "direct:SI") for failure details.
 */
function declaredSetSpelling(entry: TenantRlsManifestEntry): string {
  return `direct:${(entry.declaredCommands ?? []).join('')}`;
}

/**
 * The per-command ratchet (issue #512 T3 slice 10): the table's pg_policies
 * command set must cover EXACTLY the declared set. Every declared command
 * needs at least one policy; every policy command must belong to the set.
 * A FOR ALL policy covers all four declared commands (defensive: after the
 * slice 10 conversion no direct table should carry one, but the comparison
 * must not miscount if one ever reappears). Judged only from the structural
 * command facts — no tenant data is ever read.
 */
function evaluateDeclaredCommands(
  entry: TenantRlsManifestEntry,
  policyCommands: readonly TenantRlsPolicyCommandRow[] | undefined,
  failures: TenantRlsCoverageFailure[],
): void {
  const declared = entry.declaredCommands ?? [];
  if (policyCommands === undefined) {
    failures.push({
      kind: 'policy-command-evidence-missing',
      table: entry.table,
      detail:
        `entry declares the command set "${declaredSetSpelling(entry)}" but no ` +
        'pg_policies command evidence was supplied; the per-command ratchet ' +
        'cannot be judged without it',
    });
    return;
  }

  // Expand the actual command coverage: ALL covers S/I/U/D, otherwise the
  // exact pg_policies cmd spelling maps to its letter. An unknown spelling
  // (pg_policies should never emit one) is judged outside the set instead of
  // being silently dropped.
  const covered = new Set<TenantRlsCommandLetter>();
  const unknownCommands: string[] = [];
  for (const row of policyCommands) {
    if (row.table !== entry.table) continue;
    if (row.command === 'ALL') {
      for (const letter of TENANT_RLS_COMMAND_LETTERS) covered.add(letter);
      continue;
    }
    const letter = letterByCommand(row.command);
    if (letter) covered.add(letter);
    else unknownCommands.push(row.command);
  }

  for (const letter of TENANT_RLS_COMMAND_LETTERS) {
    if (declared.includes(letter) && !covered.has(letter)) {
      failures.push({
        kind: 'missing-declared-command-policy',
        table: entry.table,
        detail:
          `declared command ${COMMAND_BY_LETTER[letter]} (${letter}) has no ` +
          `policy; the entry declares "${declaredSetSpelling(entry)}"`,
      });
    }
  }

  for (const letter of TENANT_RLS_COMMAND_LETTERS) {
    if (covered.has(letter) && !declared.includes(letter)) {
      failures.push({
        kind: 'undeclared-command-policy',
        table: entry.table,
        detail:
          `policy command ${COMMAND_BY_LETTER[letter]} (${letter}) is outside ` +
          `the declared set "${declaredSetSpelling(entry)}"`,
      });
    }
  }

  for (const command of unknownCommands) {
    failures.push({
      kind: 'undeclared-command-policy',
      table: entry.table,
      detail:
        `policy command ${command} is outside the declared set ` +
        `"${declaredSetSpelling(entry)}"`,
    });
  }
}

/**
 * The coverage gate. Deterministic by construction: failures are sorted by
 * kind then table, details name schema objects only, and no tenant data is
 * ever read (the caller supplies structural catalog rows).
 */
export function evaluateTenantRlsCoverage(
  manifest: ParsedTenantRlsManifest,
  tables: readonly TenantRlsCatalogTable[],
  policyCommands?: readonly TenantRlsPolicyCommandRow[],
): TenantRlsCoverageResult {
  const failures: TenantRlsCoverageFailure[] = [];
  const classifiedCounts: Record<RlsCoverageClass, number> = {
    direct: 0,
    'parent-owned': 0,
    global: 0,
    debt: 0,
  };
  let legacyDirectEntries = 0;
  let declaredCommandDirectEntries = 0;

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
      detail:
        'classified more than once; the manifest must carry one entry per table',
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
      if (entry.declaredCommands) declaredCommandDirectEntries++;
      else legacyDirectEntries++;

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
      if (entry.declaredCommands) {
        evaluateDeclaredCommands(entry, policyCommands, failures);
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
    const classified = manifest.entries.some(
      (entry) => entry.table === table.name,
    );
    if (!classified) {
      failures.push({
        kind: 'unclassified-table',
        table: table.name,
        detail: 'public base table has no classification entry',
      });
    }
  }

  failures.sort((a, b) =>
    a.kind === b.kind
      ? a.table.localeCompare(b.table)
      : a.kind.localeCompare(b.kind),
  );

  return {
    failures,
    classifiedCounts,
    legacyDirectEntries,
    declaredCommandDirectEntries,
  };
}
