#!/usr/bin/env bash
#
# Prove the migration set is self-sufficient in two scenarios:
#
#   Scenario 1: rebuild the schema from an EMPTY database and check that every
#               table declared by a TypeORM entity exists afterwards, and that
#               every column the entities declare exists in those tables.
#   Scenario 2: simulate a pre-existing environment — the same database already
#               holds every table, but the migrations ledger has no rows for the
#               bootstrap migrations, the three previously non-idempotent
#               creates, and the sixteen migrations whose CREATE POLICY
#               statements were guarded for re-application (issue #285).
#               Re-running the migration set must succeed (no
#               "already exists" failure) and leave every entity table present.
#
# Why this exists
# ---------------
# The schema had never been built from an empty database. Twenty-six entity
# tables had no creating migration, so production and CI worked only because
# they were provisioned before the migrations existed. This script makes that
# gap detectable instead of invisible. The same blind spot existed one level
# down: a table can exist while the columns its entity declares do not, so the
# comparison is repeated per column.
#
# Why the RLS invariants exist
# ----------------------------
# A table can exist with every column in place and still be unusable: when
# FORCE ROW LEVEL SECURITY is set but no policy was created (for example
# because a migration guard looked up the WRONG policy name and silently
# skipped creation), every SELECT, INSERT, UPDATE and DELETE returns zero
# affected rows forever. Two invariants catch that failure mode, in both
# scenarios:
#   1. No forced-RLS base table in public is left deny-all: every table with
#      relforcerowsecurity = true must own at least one row in pg_policies.
#   2. Every expression a policy on such a table actually defines must
#      reference app.tenant_id: if pg_policies.qual is not null it must
#      contain it (SELECT, DELETE, UPDATE and the USING half of FOR ALL), and
#      if pg_policies.with_check is not null it must contain it (INSERT,
#      UPDATE and the WITH CHECK half of FOR ALL). A policy that defines only
#      one of the two is judged on that one alone. This is deliberately
#      stricter than an OR across both expressions: a FOR ALL policy written
#      as USING (true) WITH CHECK (tenant match) would pass an OR check while
#      allowing every tenant's rows to be read.
# The counts are printed with the other comparisons so a vacuous
# zero-tables-and-zero-policies result is visible instead of passing silently.
#
# Why the tenant-type ratchet exists
# ----------------------------------
# The entity declarations say `tenant_id` is uuid. The migrations say varchar
# in 43 tables. Nothing measured that disagreement, so it survived until
# someone joined two tables and got "operator does not exist: character
# varying = uuid". This check measures it, in both scenarios.
#
# The target type cannot simply be asserted: 43 columns are still wrong, and
# asserting the target would leave CI red until every unit of issue #286
# lands. So the check is a ratchet, following the convention the Admin Backend
# CI ratchet already uses
# (openspec/changes/restore-admin-backend-ci-baseline). A reviewed manifest
# lists the known non-uuid tenant columns; the check fails when the schema
# drifts OUTSIDE that list, and it also fails when a listed entry no longer
# matches a real non-uuid column. That second half is what makes the ratchet
# tighten rather than merely not regress: fixing a column without deleting its
# line is a failure, not a no-op. The manifest is expected to end empty, and
# additions require a separately approved baseline-change decision.
#
# Views appear in the same manifest under a separate marker, and they are not
# cosmetic. PostgreSQL refuses to change the type of a column used by a view
# rule, so a view exposing a varchar tenant column BLOCKS the migration of the
# base column it reads. v_sys_parametros_config_active is exactly that case:
# the changing unit must drop and recreate the view. Tracking it here is what
# stops that blocker from being rediscovered during a migration.
#
# Why the column-type ratchet exists
# ----------------------------------
# Issue #405. The existence check above asserts that every column an entity
# declares exists, but the column's TYPE was asserted only for tenant_id.
# Nothing measured the declared type of the other columns against what the
# migrations actually build, so a varchar declared over a uuid column, a
# missing length, or a timestamp/timestamptz disagreement survived invisibly
# until a query or a join failed at runtime.
#
# This ratchet compares the type of EVERY column of every regular entity
# table against the built schema, in both scenarios, with the same two failure
# directions as the tenant-type ratchet:
#   - unlisted (new drift): a declared/actual divergence that is not in the
#     reviewed manifest scripts/schema-column-type-manifest.txt.
#   - stale manifest entry: a line that matches no real divergence, which
#     means a column was fixed (or dropped) and its line was not deleted.
#
# Both sides are folded onto one vocabulary through a normalization table.
# TypeORM's column.type is heterogeneous (a bare @Column() reflects the JS
# constructor, an explicit type is a driver string), while information_schema
# reports PostgreSQL names; without the table the comparison would be against
# spellings, not types. Any declared type the table does not know about makes
# the extractor fail closed, naming the table, column and type: an unknown
# declaration must be judged by a human, never silently skipped and never
# normalized away by accident.
#
# Number and Date are deliberately NOT normalized. They are TypeORM's
# reflection of a bare @Column() on a JS number or Date property; deciding
# whether the author meant integer/numeric or timestamp/timestamptz is a
# per-column design decision. The check records them in the manifest as the
# "abstract" drift class instead of deciding for them.
#
# isArray and length are part of the canonical form, not noise: text[] over
# text, or varchar(64) over varchar, are real schema differences a join, an
# index or a constraint can feel. Numeric precision is canonical form too:
# numeric(10,2) over bare numeric is a real difference, so both sides carry
# (precision,scale) when set. Timestamp precision is deliberately NOT
# canonicalized: every timestamp column in this schema is precision 6, so
# adding it would only create a default-equivalence problem (a declared
# default and an explicit precision 6 must compare equal) with nothing to
# catch today. Array-ness wins over the length/precision appends: an array
# column's canonical is its element type plus [], never a parenthesized
# suffix. View entities are excluded from the
# entity side: a view's columns are authored by migrations, not by entity
# declarations, and their types are not alterable while the view exists, so
# there is nothing for an entity declaration to be compared against.
#
# Recorded decision: the 48 timestamp/timestamptz divergences are held as
# drift in the manifest rather than normalized away. Converging them is a
# separate slice (48 entities or 40 migrations); the ratchet freezes today's
# count so it cannot grow silently.
#
# A schema column can never silently drop out of the comparison. The schema
# side is wrapped in COALESCE (an unresolvable type becomes a visible
# 'unresolved:...' divergence instead of a NULL that a blank-line filter
# deletes) and a count guard fails the run when the extraction holds fewer
# rows than public has columns. Both nets exist because a join scoped to the
# wrong namespace once left the two ARRAY columns unjoined, unconcatenated,
# filtered out, and silently never compared.
#
# Why the predicate-form assertion is scoped to uuid columns
# ----------------------------------------------------------
# A policy guarding a tenant column whose predicate casts the COLUMN to text
# loses its index: `tenant_id::text = current_setting(...)` deparses to a
# Filter rather than an Index Cond, so the index stops restricting rows. On a
# uuid column the correct form casts the SETTING instead:
# `tenant_id = current_setting('app.tenant_id', true)::uuid`.
#
# That assertion is only meaningful on a uuid column, and the scope is not a
# convenience. PostgreSQL deparses an IMPLICIT varchar -> text coercion as an
# explicit cast, so on a varchar column every working policy reads as
# `(tenant_id)::text = ...` whether or not its author wrote the cast: a bare
# compare and a hand-written cast are indistinguishable in pg_policies.
# Asserting the form on a varchar column would flag the 94 policies that are
# waiting for their column to change, for a reason that does not exist.
# Scoped to uuid columns the assertion is exact: it catches a predicate left
# behind in the text form after its column already became uuid, which is a
# silent index loss rather than a loud error. Note that `::text` also appears
# inside the CORRECT form, in current_setting('app.tenant_id'::text, true), so
# the discriminator targets the column-side cast specifically.
#
# Why the tenant RLS coverage ratchet exists
# -------------------------------------------
# Issue #493. Every ratchet above starts from a table that is ALREADY visible:
# forced-RLS tables, uuid tenant columns, policies that exist. The blind spot
# was one level up: a tenant-bearing table with no ENABLE, no FORCE, and no
# policy never appears in any of them, so a whole domain can ship without
# tenant isolation and every existing invariant reports PASS. Staging proved
# the class is real: the runtime role could count another tenant's
# onboarding_sessions rows.
#
# The coverage ratchet closes that class. Every public base table must be
# classified exactly once in the reviewed manifest
# scripts/schema-rls-coverage-manifest.txt:
#
#   direct        — carries tenant_id, ENABLE RLS, FORCE RLS, and at least
#                   one policy. Any of those missing fails the gate.
#   parent-owned  — no tenant_id; isolation flows through a foreign key to a
#                   tenant-bearing parent (policy work: issue #493 T3).
#   global        — reviewed platform / pre-tenant / infrastructure exception.
#   debt          — explicit temporary tenant isolation debt, permitted only
#                   as a reviewed ratchet entry. A debt table that becomes
#                   fully tenant-protected is STALE and fails until promoted
#                   to direct, so fixing a table without deleting its debt
#                   line is a failure, not a no-op.
#
# A table absent from the manifest is "unclassified" and fails: adding a table
# without deciding its isolation class is impossible. The manifest itself is
# judged fail-closed too: unknown classifications, malformed lines, and
# duplicate entries fail rather than being skipped.
#
# The classification semantics live in ONE place:
# src/core/database/tenant-rls-coverage.ts (the same module the unit and
# migration-built DB specs exercise). The shell verifier never re-implements
# the rules: it collects the structural catalog facts (which the DB spec uses
# too) and hands them to the compiled module through dist, so the gate, the
# specs, and any future caller judge the manifest with one vocabulary.
#
# Why the entity/schema consistency assertion is one-directional
# ------------------------------------------------------------------
# A table can be correct in the schema while the entity that maps it still
# declares the old type. Nothing measured that disagreement, so slice A's
# rebindings left four entities behind invisibly. The assertion is strictly
# one-directional: for every base table whose tenant_id column is uuid in the
# built schema, the TypeORM entity that maps that table must declare
# tenant_id as uuid. Tables whose tenant_id is still varchar are OUT of
# scope: six of them legitimately declare uuid on the entity side already,
# because a @ManyToOne(() => Tenant) @JoinColumn({ name: 'tenant_id' })
# derives its type from the target's primary key. Those columns are tracked
# by the ratchet above until their slice rebinds them, and the slice that
# rebinds the column is the same slice that makes the entity truthful.
#
# The entity side is read from TypeORM metadata, never from entity source
# text. Thirty entity files declare tenant_id twice in source (a plain
# @Column and a relation join column) and TypeORM folds them into one column
# metadata whose type is the relation-derived uuid; source parsing would
# misread all thirty. The metadata is built from the compiled dist tree
# without touching the database, so the comparison is against exactly what
# TypeORM will issue at runtime.
#
# Why the migration run uses a restricted role
# --------------------------------------------
# Running the migrations as a superuser made this harness blind to privilege
# problems: a deploy failed with "permission denied to create extension
# \"uuid-ossp\"" while the harness kept reporting PASS. The harness therefore
# replicates production privileges: the migration set runs as a dedicated
# restricted role (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
# NOBYPASSRLS) that only receives USAGE and CREATE on schema public. The
# administrator credentials are used only for provisioning (database, role,
# grants, the uuid-ossp extension as a stand-in for environment provisioning)
# and for the verification reads. With the extension pre-installed by the
# administrator, the migration's guarded CREATE EXTENSION becomes a no-op —
# which is exactly the production contract: extensions are infrastructure,
# installed during provisioning, and the migration role never needs extension
# privileges. Running with NODE_ENV=production also exercises the fail-closed
# credential resolution path.
#
# Safety
# ------
# Running migrations against an unintended database already caused an incident
# in this repository, so the target name must be an explicit scratch name and
# `omnifood` is refused outright.
set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USERNAME:-postgres}"
DB_PASS="${DB_PASSWORD:-postgres}"
SCRATCH_DB="${SCHEMA_CHECK_DB:-omnifood_schema_build_test}"

# Dedicated restricted role that runs the migrations, mirroring the production
# migration role. The password is a fixed, non-secret test credential: it only
# ever authenticates this role against the scratch database created below.
RESTRICTED_ROLE="${SCHEMA_CHECK_MIGRATION_ROLE:-omnifood_schema_build_migrator}"
RESTRICTED_PASS="schema-build-test-only-password"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Reviewed manifest for the tenant-type ratchet. A missing file is a failure
# and never an empty ratchet: an empty manifest would report every non-uuid
# tenant column as new drift and bury the real problem, which is that the file
# was not shipped.
MANIFEST_TENANT_TYPES="${SCRIPT_DIR}/schema-tenant-type-manifest.txt"

# Reviewed manifest for the column-type ratchet (issue #405). Same contract as
# the tenant-type manifest: a missing file is a failure, never an empty
# ratchet, so an unshipped file cannot silently flag the whole baseline.
MANIFEST_COLUMN_TYPES="${SCRIPT_DIR}/schema-column-type-manifest.txt"

# Reviewed classification manifest for the tenant RLS coverage ratchet
# (issue #493). Same contract as the other ratchets: a missing file is a
# failure, never an empty gate, so an unshipped manifest cannot silently
# report every public table as unclassified and bury the real problem.
MANIFEST_RLS_COVERAGE="${SCRIPT_DIR}/schema-rls-coverage-manifest.txt"

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ -f "${MANIFEST_TENANT_TYPES}" ] || fail "FAIL: tenant-type manifest not found at ${MANIFEST_TENANT_TYPES}."
[ -f "${MANIFEST_COLUMN_TYPES}" ] || fail "FAIL: column-type manifest not found at ${MANIFEST_COLUMN_TYPES}."
[ -f "${MANIFEST_RLS_COVERAGE}" ] || fail "FAIL: RLS coverage manifest not found at ${MANIFEST_RLS_COVERAGE}."

case "${SCRATCH_DB}" in
  *_schema_build_test|*_scratch) ;;
  *) fail "Refusing to run: SCHEMA_CHECK_DB must end with '_schema_build_test' or '_scratch' (got '${SCRATCH_DB}')." ;;
esac

# The role is dropped and recreated on every run, so it carries the same risk
# as the database name: a real role name would be destroyed by a typo in an
# environment variable. Require the same kind of explicit opt-in.
case "${RESTRICTED_ROLE}" in
  *_schema_build_migrator|*_schema_check_role) ;;
  *) fail "Refusing to run: SCHEMA_CHECK_MIGRATION_ROLE must end with '_schema_build_migrator' or '_schema_check_role' (got '${RESTRICTED_ROLE}'). This script DROPs and recreates that role." ;;
esac

export PGPASSWORD="${DB_PASS}"
psql_admin() { psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -v ON_ERROR_STOP=1 "$@"; }

printf '%s\n' "==> Provisioning scratch database '${SCRATCH_DB}' and restricted role '${RESTRICTED_ROLE}' on ${DB_HOST}:${DB_PORT}"
# Drop order matters: the database first, then the role, so the role holds no
# dependent objects when it is dropped. The role is only ever used against
# this scratch database, so dropping the database removes everything it owns.
psql_admin -d postgres -q -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";"
psql_admin -d postgres -q -c "DROP ROLE IF EXISTS \"${RESTRICTED_ROLE}\";"
psql_admin -d postgres -q -c "CREATE ROLE \"${RESTRICTED_ROLE}\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${RESTRICTED_PASS}';"
psql_admin -d postgres -q -c "CREATE DATABASE \"${SCRATCH_DB}\";"

# Provision inside the scratch database as the administrator: schema grants
# and the extension the migrations rely on. Installing uuid-ossp here models
# the production provisioning step, so the migration's own guarded
# CREATE EXTENSION is a no-op and the restricted role never needs extension
# privileges.
psql_admin -d "${SCRATCH_DB}" -q -c "GRANT USAGE, CREATE ON SCHEMA public TO \"${RESTRICTED_ROLE}\";"
psql_admin -d "${SCRATCH_DB}" -q -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# Run the migration set exactly like production does: NODE_ENV=production
# (fail-closed credential resolution) with the restricted role's credentials
# in DB_MIGRATION_USERNAME/DB_MIGRATION_PASSWORD. The administrator
# credentials are deliberately NOT visible to this call. Returns the migration
# exit status; the npm output flows through to stdout unchanged.
run_migrations() {
  local status=0
  (
    cd "${APP_DIR}" && NODE_ENV=production \
      DB_HOST="${DB_HOST}" \
      DB_PORT="${DB_PORT}" \
      DB_DATABASE="${SCRATCH_DB}" \
      DB_MIGRATION_USERNAME="${RESTRICTED_ROLE}" \
      DB_MIGRATION_PASSWORD="${RESTRICTED_PASS}" \
      npm run --silent migration:run:prod
  ) || status=$?
  return "${status}"
}

printf '%s\n' "==> Building"
( cd "${APP_DIR}" && npm run --silent build )

printf '%s\n' "==> Scenario 1: applying the full migration set to an empty database as '${RESTRICTED_ROLE}'"
migration_status=0
run_migrations || migration_status=$?

entities="$(mktemp)"
applied="$(mktemp)"
entity_columns="$(mktemp)"
db_columns="$(mktemp)"
forced_rls_tables="$(mktemp)"
rls_policies="$(mktemp)"
rls_policy_exprs_missing_tenant="$(mktemp)"
tenant_type_manifest="$(mktemp)"
tenant_type_actual="$(mktemp)"
tenant_uuid_cast_issues="$(mktemp)"
schema_uuid_tenant_tables="$(mktemp)"
entity_tenant_types="$(mktemp)"
entity_column_types="$(mktemp)"
schema_column_types="$(mktemp)"
column_type_divergences="$(mktemp)"
column_type_manifest="$(mktemp)"
rls_coverage_catalog="$(mktemp)"
rls_coverage_output="$(mktemp)"
rls_coverage_failures="$(mktemp)"
trap 'rm -f "${entities}" "${applied}" "${entity_columns}" "${db_columns}" "${forced_rls_tables}" "${rls_policies}" "${rls_policy_exprs_missing_tenant}" "${tenant_type_manifest}" "${tenant_type_actual}" "${tenant_uuid_cast_issues}" "${schema_uuid_tenant_tables}" "${entity_tenant_types}" "${entity_column_types}" "${schema_column_types}" "${column_type_divergences}" "${column_type_manifest}" "${rls_coverage_catalog}" "${rls_coverage_output}" "${rls_coverage_failures}"' EXIT

# Entities declare their table two ways: @Entity('name') and
# @Entity({ name: 'name' }). Missing the second form would silently under-count
# and report a false PASS, so both are captured.
perl -ne 'print "$1\n" if /\@Entity\(\s*(?:\{\s*name:\s*)?["\x27]([A-Za-z_0-9]+)["\x27]/' \
  $(find "${APP_DIR}/src" -name '*.entity.ts') | sort -u > "${entities}"

# Column-level extraction. Every property declared with a column decorator
# must exist as a physical column of the entity table. The rules, in order of
# reliability:
#
#   - The property name IS the column name. TypeORM maps it verbatim
#     ("averageCost", "sellPrice", "tenant_id" all appear verbatim in the
#     database), so no case conversion is applied. The single exception is an
#     explicit `name:` option inside the decorator, which overrides it.
#   - Only column decorators count: @Column, @PrimaryColumn,
#     @PrimaryGeneratedColumn, @CreateDateColumn, @UpdateDateColumn and
#     @DeleteDateColumn. @PrimaryColumn is part of the family because it
#     declares a physical primary-key column. Relation decorators
#     (@ManyToOne, @OneToMany, @OneToOne, @JoinColumn, @JoinTable,
#     @ManyToMany) and any property without a column decorator are ignored.
#   - @ViewEntity and @ViewColumn are ignored too: a view entity maps to a
#     VIEW, not to a table, and this harness compares entity tables and columns
#     against what the migrations create. Views are authored by migrations, not
#     by entities, so a view entity declares no table for this comparison. It is
#     NOT a signal to skip verification: any @Column inside a real @Entity is
#     still extracted and checked.
#   - Both single-line and multi-line decorator forms are handled, and both
#     quoted and unquoted @Entity table names. @Entity() without a name falls
#     back to the class name, which is what TypeORM does.
#   - Anything the extractor cannot understand (an unrecognized decorator,
#     an unparseable @Entity, a column decorator with no property) aborts
#     with the file and line number so a human can judge, instead of
#     silently skipping the construct and reporting a false PASS.
perl -e '
use strict;
use warnings;

my %COLUMN_DECORATOR = map { $_ => 1 } qw(
  Column PrimaryColumn PrimaryGeneratedColumn
  CreateDateColumn UpdateDateColumn DeleteDateColumn
);
my %IGNORED_DECORATOR = map { $_ => 1 } qw(
  Entity Index Unique
  ManyToOne OneToMany OneToOne ManyToMany
  JoinColumn JoinTable Generated
  ViewEntity ViewColumn
);

sub net_parens {
  my ($n) = (0);
  $n += ($_ eq chr(40) ? 1 : -1) for $_[0] =~ /([()])/g;
  return $n;
}

for my $file (@ARGV) {
  open my $fh, "<", $file or die "cannot read $file: $!\n";
  my ($table, $class, $entity_seen) = ("", "", 0);
  my ($state, $override, $buf, $depth, $buf_line) = ("", "", "", 0, 0);

  my $finish_entity = sub {
    my ($text, $at) = @_;
    return $1 if $text =~ /name:\s*[\x27"]([A-Za-z_][A-Za-z0-9_]*)[\x27"]/;
    return $1 if $text =~ /^\s*\(\s*[\x27"]([A-Za-z_][A-Za-z0-9_]*)[\x27"]\s*,?\s*\)/;
    return $1 if $text =~ /^\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/;
    return "" if $text =~ /^\s*\(\s*\)/;
    die "$at: cannot parse \@Entity arguments: $text\n";
  };

  my $emit = sub {
    my ($name, $at) = @_;
    die "$at: column $name declared before any \@Entity table name\n" if $table eq "";
    print "$table.$name\n";
  };

  my $name_override = sub {
    my ($text) = @_;
    return $text =~ /(?:^|[,{\s])name:\s*[\x27"]([A-Za-z_][A-Za-z0-9_]*)[\x27"]/ ? $1 : "";
  };

  while (my $line = <$fh>) {
    my $at = "$file:$.";
    if ($state eq "prop") {
      next if $line =~ /^\s*\z/;
      next if $line =~ /^\s*(\/\/|\/\*|\*)/;
      if ($line =~ /^\s*\@([A-Za-z_][A-Za-z0-9_]*)\b/) {
        die "$at: stacked column decorator \@$1 is not supported by the extractor\n"
          if $COLUMN_DECORATOR{$1};
        die "$at: unrecognized decorator \@$1 while expecting a property\n"
          unless $IGNORED_DECORATOR{$1};
        next;
      }
      if ($line =~ /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[!?]*\s*:/) {
        $emit->($override ne "" ? $override : $1, $at);
        ($state, $override) = ("", "");
        next;
      }
      die "$at: column decorator is not followed by a property declaration: $line";
    }
    if ($state eq "entity" or $state eq "column") {
      $buf .= $line;
      $depth += net_parens($line);
      if ($depth <= 0) {
        my $closed = $state;
        my $text = $buf;
        my $tail = $text;
        $tail =~ s/^.*\)//s;
        ($state, $buf, $depth) = ("", "", 0);
        if ($closed eq "entity") {
          my $name = $finish_entity->($text, $at);
          if ($name ne "") { $table = $name; }
          $entity_seen = 1;
        } else {
          $override = $name_override->($text);
          if ($tail =~ /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[!?]*\s*:/) {
            $emit->($override ne "" ? $override : $1, $at);
            $override = "";
          } else {
            die "$at: cannot parse the text after the decorator: $tail\n" if $tail =~ /\@/;
            $state = "prop";
          }
        }
      }
      next;
    }
    if ($line =~ /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/) {
      $class = $1;
      $table = $class if $entity_seen && $table eq "";
      next;
    }
    if ($line =~ /^\s*\@Entity\b(.*)$/s) {
      my $rest = $1;
      if ($rest =~ /\(/ && net_parens($rest) == 0) {
        my $name = $finish_entity->($rest, $at);
        if ($name ne "") { $table = $name; }
        $entity_seen = 1;
      } else {
        ($state, $buf, $depth, $buf_line) = ("entity", $rest, net_parens($rest), $.);
      }
      next;
    }
    if ($line =~ /^\s*\@([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/s) {
      my ($dec, $rest) = ($1, $2);
      if ($COLUMN_DECORATOR{$dec}) {
        if ($rest =~ /\(/ && net_parens($rest) == 0) {
          my $tail = $rest;
          $tail =~ s/^.*\)//s;
          my $ovr = $name_override->($rest);
          if ($tail =~ /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[!?]*\s*:/) {
            $emit->($ovr ne "" ? $ovr : $1, $at);
          } else {
            die "$at: cannot parse the text after the decorator: $tail\n" if $tail =~ /\@/;
            ($state, $override) = ("prop", $ovr);
          }
        } else {
          ($state, $buf, $depth, $buf_line, $override) = ("column", $rest, net_parens($rest), $., "");
        }
      } elsif (!$IGNORED_DECORATOR{$dec}) {
        die "$at: unrecognized decorator \@$dec - confirm it does not declare a column, then teach the extractor about it\n";
      }
      next;
    }
  }
  die "$file: the entity never declares an \@Entity table name\n" if $table eq "";
  die "$file: unterminated construct started at line $buf_line\n" if $state ne "";
}
' $(find "${APP_DIR}/src" -name '*.entity.ts') | sort -u > "${entity_columns}"

collect_tables() {
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${applied}"
}

report_diff() {
  missing="$(comm -23 "${entities}" "${applied}")"
  missing_count="$(printf '%s' "${missing}" | grep -c . || true)"

  printf 'entity tables declared : %s\n' "$(wc -l < "${entities}" | tr -d ' ')"
  printf 'tables created         : %s\n' "$(wc -l < "${applied}" | tr -d ' ')"
  printf 'missing entity tables  : %s\n' "${missing_count}"

  if [ -n "${missing}" ]; then
    printf '\n%s\n' "Tables the entities declare but the schema does not create:"
    printf '%s\n' "${missing}" | sed 's/^/  - /'
  fi
}

collect_columns() {
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${db_columns}"
}

report_column_diff() {
  missing_columns="$(comm -23 "${entity_columns}" "${db_columns}")"
  missing_column_count="$(printf '%s' "${missing_columns}" | grep -c . || true)"

  printf 'entity columns declared: %s\n' "$(wc -l < "${entity_columns}" | tr -d ' ')"
  printf 'columns created        : %s\n' "$(wc -l < "${db_columns}" | tr -d ' ')"
  printf 'missing entity columns : %s\n' "${missing_column_count}"

  if [ -n "${missing_columns}" ]; then
    printf '\n%s\n' "Columns the entities declare but the schema does not create:"
    printf '%s\n' "${missing_columns}" | sed 's/^/  - /'
  fi
}

collect_rls_invariants() {
  # Base tables in public that FORCE ROW LEVEL SECURITY. A table on this list
  # without a single policy is deny-all: RLS rejects every row.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity ORDER BY c.relname" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${forced_rls_tables}"

  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT tablename || '|' || policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${rls_policies}"

  # Every expression a policy on a forced-RLS table defines must reference
  # app.tenant_id. Each non-null expression (pg_policies.qual and
  # pg_policies.with_check) is judged independently; a policy defining only
  # one is judged on that one. The expression text comes straight from
  # pg_policies, so the comparison sees what the database will actually
  # enforce, not what the migration intended. Each violating row carries the
  # table, policy name, command and which expression lacks the predicate.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT p.tablename || '|' || p.policyname || '|' || p.cmd || '|' || e.expr_kind FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL (VALUES ('USING', p.qual), ('WITH CHECK', p.with_check)) AS e(expr_kind, expr) WHERE p.schemaname = 'public' AND n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity AND e.expr IS NOT NULL AND position('app.tenant_id' in e.expr) = 0 ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${rls_policy_exprs_missing_tenant}"
}

report_rls_diff() {
  # Forced-RLS tables whose table name never appears as a policy owner: the
  # deny-all set. comm needs both sides sorted, hence the cut | sort.
  deny_all_tables="$(comm -23 "${forced_rls_tables}" <(cut -d'|' -f1 "${rls_policies}" | sort -u))"
  deny_all_count="$(printf '%s' "${deny_all_tables}" | grep -c . || true)"
  missing_tenant_count="$(wc -l < "${rls_policy_exprs_missing_tenant}" | tr -d ' ')"

  printf 'forced-RLS tables      : %s\n' "$(wc -l < "${forced_rls_tables}" | tr -d ' ')"
  printf 'RLS policies           : %s\n' "$(wc -l < "${rls_policies}" | tr -d ' ')"
  printf 'deny-all tables        : %s\n' "${deny_all_count}"
  printf 'policy exprs w/o tenant: %s\n' "${missing_tenant_count}"

  if [ -n "${deny_all_tables}" ]; then
    printf '\n%s\n' "Forced-RLS tables with no policy at all (every query would return zero rows):"
    printf '%s\n' "${deny_all_tables}" | sed 's/^/  - /'
  fi
  if [ "${missing_tenant_count}" -ne 0 ]; then
    printf '\n%s\n' "Policy expressions on forced-RLS tables that never mention app.tenant_id (table | policy | command | expression):"
    sed 's/^/  - /' "${rls_policy_exprs_missing_tenant}"
  fi
}

collect_tenant_type_invariants() {
  # Every tenant_id column in public that is not uuid, base tables and views
  # alike. information_schema is used rather than a pg_class join so the
  # base-table / view distinction comes from table_type, which is the same
  # distinction the manifest draws.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT CASE t.table_type WHEN 'VIEW' THEN 'view ' ELSE 'column ' END || c.table_name || '.' || c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.data_type <> 'uuid' ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${tenant_type_actual}"

  # The manifest is read fresh here, not once at startup, so both scenarios
  # judge the same reviewed list.
  sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "${MANIFEST_TENANT_TYPES}" \
    | sort -u > "${tenant_type_manifest}"

  # Predicate form, scoped to columns that are ALREADY uuid. See the header:
  # on a varchar column the deparse cannot distinguish a bare compare from a
  # hand-written text cast, so the assertion would be meaningless there.
  # Each non-null expression is judged independently. A violation is an
  # expression that omits the tenant setting, never casts it to uuid, or casts
  # the column to text.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT p.tablename || '|' || p.policyname || '|' || p.cmd || '|' || e.expr_kind FROM pg_policies p JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'tenant_id' AND c.data_type = 'uuid' CROSS JOIN LATERAL (VALUES ('USING', p.qual), ('WITH CHECK', p.with_check)) AS e(expr_kind, expr) WHERE p.schemaname = 'public' AND e.expr IS NOT NULL AND ( position('app.tenant_id' in e.expr) = 0 OR position('::uuid' in e.expr) = 0 OR e.expr ~ 'tenant_id[[:space:]]*\)?[[:space:]]*::text' ) ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${tenant_uuid_cast_issues}"
}

report_tenant_type_diff() {
  # Unlisted: a non-uuid tenant column the manifest does not know about.
  unlisted_tenant_cols="$(comm -13 "${tenant_type_manifest}" "${tenant_type_actual}")"
  unlisted_tenant_count="$(printf '%s' "${unlisted_tenant_cols}" | grep -c . || true)"

  # Stale: a manifest line matching nothing. Either the column was fixed and
  # its line was not deleted (the ratchet failing to tighten), or the column
  # was dropped or renamed and the entry needs a human look.
  stale_tenant_entries="$(comm -23 "${tenant_type_manifest}" "${tenant_type_actual}")"
  stale_tenant_count="$(printf '%s' "${stale_tenant_entries}" | grep -c . || true)"

  uuid_cast_issue_count="$(wc -l < "${tenant_uuid_cast_issues}" | tr -d ' ')"

  printf 'non-uuid tenant columns: %s\n' "$(wc -l < "${tenant_type_actual}" | tr -d ' ')"
  printf 'tenant-type manifest   : %s\n' "$(wc -l < "${tenant_type_manifest}" | tr -d ' ')"
  printf 'unlisted (new drift)   : %s\n' "${unlisted_tenant_count}"
  printf 'stale manifest entries : %s\n' "${stale_tenant_count}"
  printf 'uuid col text casts    : %s\n' "${uuid_cast_issue_count}"

  if [ -n "${unlisted_tenant_cols}" ]; then
    printf '\n%s\n' "Tenant columns that are not uuid and are missing from scripts/schema-tenant-type-manifest.txt:"
    printf '%s\n' "${unlisted_tenant_cols}" | sed 's/^/  - /'
  fi
  if [ -n "${stale_tenant_entries}" ]; then
    printf '\n%s\n' "Tenant-type manifest entries matching no non-uuid tenant column (delete the line if the column was fixed):"
    printf '%s\n' "${stale_tenant_entries}" | sed 's/^/  - /'
  fi
  if [ "${uuid_cast_issue_count}" -ne 0 ]; then
    printf '\n%s\n' "Policy expressions on a uuid tenant column that cast the column to text, or never cast the setting to uuid (table | policy | command | expression):"
    sed 's/^/  - /' "${tenant_uuid_cast_issues}"
  fi
}

# Entity side of the entity/schema consistency assertion. One row per entity
# column named tenant_id: table|entity|declared type. Read from the compiled
# dist tree through TypeORM's own metadata builder (no database connection),
# so dual-declared tenant_id columns report the relation-derived folded type
# exactly as TypeORM uses it at runtime. See the header for why source text
# parsing would misread thirty entities.
collect_entity_tenant_types() {
  ( cd "${APP_DIR}" && node -e '
const { DataSource, getMetadataArgsStorage } = require("typeorm");
const fs = require("fs");
const path = require("path");
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".entity.js")) acc.push(p);
  }
  return acc;
}
const files = walk(path.join(process.cwd(), "dist"), []);
// Decorator metadata is registered while the entity modules load, so every
// module must be required BEFORE the storage is read.
const mods = files.map((file) => require(file));
const entityClasses = new Set(getMetadataArgsStorage().tables.map((t) => t.target));
const entities = [];
for (const mod of mods) {
  for (const key of Object.keys(mod)) {
    const value = mod[key];
    if (typeof value === "function" && entityClasses.has(value)) entities.push(value);
  }
}
const dataSource = new DataSource({ type: "postgres", entities: entities });
const run = async () => {
  await dataSource.buildMetadatas();
  const rows = [];
  for (const entityMetadata of dataSource.entityMetadatas) {
    for (const column of entityMetadata.columns) {
      if (column.databaseName === "tenant_id") {
        const declared = typeof column.type === "function" ? column.type.name : String(column.type);
        rows.push(entityMetadata.tableName + "|" + entityMetadata.name + "|" + declared);
      }
    }
  }
  if (rows.length > 0) process.stdout.write(rows.sort().join("\n") + "\n");
};
run().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
  ' ) > "${entity_tenant_types}"
}

collect_schema_uuid_tenant_tables() {
  # Base tables (never views) whose tenant_id column is ALREADY uuid. Only
  # these are in scope for the entity/schema consistency assertion.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.data_type = 'uuid' AND t.table_type = 'BASE TABLE' ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${schema_uuid_tenant_tables}"
}

report_tenant_entity_diff() {
  # One-directional comparison, schema side is authoritative. A mismatch is a
  # uuid tenant_id column whose mapping entity declares another type, or a
  # uuid tenant_id table no entity declares tenant_id on at all. Both mean
  # the entity was left behind by the slice that rebound the column.
  tenant_entity_mismatches="$(awk -F'|' '
    NR == FNR { in_scope[$1] = 1; next }
    { declared[$1] = $2 "|" $3 }
    END {
      for (table in in_scope) {
        if (table in declared) {
          split(declared[table], parts, "|")
          if (parts[2] != "uuid") print table "|" parts[1] "|uuid|" parts[2]
        } else {
          print table "||(no entity declares tenant_id)|uuid|(absent)"
        }
      }
    }' "${schema_uuid_tenant_tables}" "${entity_tenant_types}" | sort)"
  tenant_entity_mismatch_count="$(printf '%s' "${tenant_entity_mismatches}" | grep -c . || true)"

  printf 'uuid tenant_id tables  : %s\n' "$(wc -l < "${schema_uuid_tenant_tables}" | tr -d ' ')"
  printf 'entity uuid mismatches : %s\n' "${tenant_entity_mismatch_count}"

  if [ -n "${tenant_entity_mismatches}" ]; then
    printf '\n%s\n' "Base tables whose tenant_id is uuid while the mapping entity declares another type (table | entity | schema type | declared type):"
    printf '%s\n' "${tenant_entity_mismatches}" | sed 's/^/  - /'
  fi
}

collect_entity_column_types() {
  # Entity side of the column-type ratchet: one row per declared column of
  # every regular entity table, <table>.<column>|<declaredCanonical>. Same
  # dist-metadata harness as collect_entity_tenant_types (no database
  # connection), so the comparison is against exactly what TypeORM issues at
  # runtime. View entities are excluded: their columns come from migrations.
  ( cd "${APP_DIR}" && node -e '
const { DataSource, getMetadataArgsStorage } = require("typeorm");
const fs = require("fs");
const path = require("path");
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".entity.js")) acc.push(p);
  }
  return acc;
}
const files = walk(path.join(process.cwd(), "dist"), []);
// Decorator metadata is registered while the entity modules load, so every
// module must be required BEFORE the storage is read.
const mods = files.map((file) => require(file));
const entityClasses = new Set(getMetadataArgsStorage().tables.map((t) => t.target));
const entities = [];
for (const mod of mods) {
  for (const key of Object.keys(mod)) {
    const value = mod[key];
    if (typeof value === "function" && entityClasses.has(value)) entities.push(value);
  }
}
// Normalization table: folds the heterogeneous column.type spellings of
// TypeORM (reflected constructors and driver strings) onto the PostgreSQL
// names information_schema reports, so both sides compare against one
// vocabulary.
const NORMALIZE = {
  "String": "character varying",
  "varchar": "character varying",
  "character varying": "character varying",
  "Boolean": "boolean",
  "boolean": "boolean",
  "bool": "boolean",
  "int": "integer",
  "integer": "integer",
  "int4": "integer",
  "smallint": "smallint",
  "bigint": "bigint",
  "int8": "bigint",
  "decimal": "numeric",
  "numeric": "numeric",
  "float": "double precision",
  "double precision": "double precision",
  "timestamp": "timestamp without time zone",
  "timestamp without time zone": "timestamp without time zone",
  "timestamptz": "timestamp with time zone",
  "timestamp with time zone": "timestamp with time zone",
  "date": "date",
  "jsonb": "jsonb",
  "json": "json",
  "text": "text",
  "uuid": "uuid",
  "simple-array": "text",
  "enum": "enum",
};
// A bare @Column() on a JS number or Date property reflects the constructor.
// The check records these abstract declarations instead of deciding whether
// the author meant integer/numeric or timestamp/timestamptz.
const ABSTRACT = new Set(["Number", "Date"]);
const dataSource = new DataSource({ type: "postgres", entities: entities });
const run = async () => {
  await dataSource.buildMetadatas();
  const rows = [];
  for (const entityMetadata of dataSource.entityMetadatas) {
    // "regular" excludes view entities (whose columns are migration-authored)
    // and junction tables; neither is a declaration the migrations must match.
    if (entityMetadata.tableType !== "regular") continue;
    for (const column of entityMetadata.columns) {
      const raw = typeof column.type === "function" ? column.type.name : String(column.type);
      let canonical;
      if (ABSTRACT.has(raw)) {
        canonical = raw;
      } else if (Object.prototype.hasOwnProperty.call(NORMALIZE, raw)) {
        canonical = NORMALIZE[raw];
      } else {
        console.error("FAIL: unrecognized declared type on " + entityMetadata.tableName + "." + column.databaseName + ": " + raw + " - teach the normalization table about it or fix the declaration");
        process.exit(1);
      }
      if (column.isArray) canonical += "[]";
      else if (canonical === "character varying" && column.length) canonical += "(" + column.length + ")";
      else if (canonical === "numeric" && column.precision) canonical += "(" + column.precision + "," + (column.scale || 0) + ")";
      rows.push(entityMetadata.tableName + "." + column.databaseName + "|" + canonical);
    }
  }
  if (rows.length > 0) process.stdout.write(rows.sort().join("\n") + "\n");
};
run().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
  ' ) | sort -u > "${entity_column_types}"
}

collect_schema_column_types() {
  # Schema side of the column-type ratchet: the actual type of every column in
  # public, folded onto the same vocabulary as the entity side. pg_type is
  # joined on udt_name + the type's OWN namespace to resolve USER-DEFINED and
  # ARRAY entries, which information_schema reports opaquely. The namespace
  # must come from c.udt_schema, never a hard-coded 'public': built-in array
  # types (_text, _int4, ...) live in pg_catalog, so joining on public left
  # every ARRAY column unjoined, made the whole concatenation NULL, and an
  # empty field was then dropped by the blank-line filter - array columns were
  # silently never compared. The ARRAY arms use c.udt_name directly so they
  # cannot depend on the join at all; t is kept only for typtype = 'e'.
  # COALESCE makes a dropped row impossible: an unresolvable type becomes a
  # visible 'unresolved:...' divergence (which the ratchet fails on) instead
  # of a silently deleted line. The count guard below is the second net: if
  # extraction ever loses a row again, the script fails loudly instead of
  # comparing a subset.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT c.table_name || '.' || c.column_name || '|' || COALESCE(CASE WHEN c.data_type = 'USER-DEFINED' AND t.typtype = 'e' THEN 'enum' WHEN c.data_type = 'USER-DEFINED' THEN 'user-defined:' || c.udt_name WHEN c.data_type = 'ARRAY' THEN CASE c.udt_name WHEN '_text' THEN 'text[]' WHEN '_int4' THEN 'integer[]' WHEN '_uuid' THEN 'uuid[]' WHEN '_varchar' THEN 'character varying[]' ELSE 'array:' || c.udt_name || '[]' END WHEN c.data_type = 'character varying' THEN 'character varying' || CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' ELSE '' END WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN 'numeric(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale, 0) || ')' ELSE c.data_type END, 'unresolved:' || c.data_type || ':' || c.udt_name) FROM information_schema.columns c LEFT JOIN pg_type t ON t.typname = c.udt_name AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = c.udt_schema) WHERE c.table_schema = 'public' ORDER BY 1" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${schema_column_types}"

  # Count guard: the extraction must carry every public column. A shorter
  # extraction means a schema column was dropped from the type comparison
  # (the exact defect class that let array columns silently skip the check).
  local public_column_count
  public_column_count="$(psql_admin -d "${SCRATCH_DB}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'" | tr -d ' ')"
  local extracted_column_count
  extracted_column_count="$(wc -l < "${schema_column_types}" | tr -d ' ')"
  if [ "${extracted_column_count}" -ne "${public_column_count}" ]; then
    fail "FAIL: the schema-side type extraction emitted ${extracted_column_count} row(s) but public holds ${public_column_count} column(s) - a schema column was dropped from the type comparison (see collect_schema_column_types)."
  fi
}

report_column_type_diff() {
  # Join the two sides on table.column. Only pairs present on BOTH sides are
  # compared: a column the schema never creates is the existence check's job.
  awk -F'|' '
    NR == FNR { actual[$1] = $2; next }
    ($1 in actual) && actual[$1] != $2 { print $1 "|" $2 "|" actual[$1] }
  ' "${schema_column_types}" "${entity_column_types}" | sort > "${column_type_divergences}"

  # The manifest is read fresh here, not once at startup, so both scenarios
  # judge the same reviewed list. Same comment-stripping as the tenant
  # manifest.
  sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "${MANIFEST_COLUMN_TYPES}" \
    | sort -u > "${column_type_manifest}"

  # Unlisted: a real divergence the manifest does not know about.
  unlisted_column_type_drifts="$(comm -13 "${column_type_manifest}" "${column_type_divergences}")"
  unlisted_column_type_count="$(printf '%s' "${unlisted_column_type_drifts}" | grep -c . || true)"

  # Stale: a manifest line matching nothing. Either the column was fixed and
  # its line was not deleted (the ratchet failing to tighten), or the column
  # was dropped or renamed and the entry needs a human look.
  stale_column_type_entries="$(comm -23 "${column_type_manifest}" "${column_type_divergences}")"
  stale_column_type_count="$(printf '%s' "${stale_column_type_entries}" | grep -c . || true)"

  # Per-class breakdown of the divergence set, derived from the two canonical
  # strings (never stored in the manifest): abstract when the declared side is
  # a bare @Column() reflection (Number or Date); length when stripping a
  # trailing (...) from both sides makes them equal; type otherwise.
  read -r type_drift_count len_drift_count abstract_drift_count <<< "$(awk -F'|' '
    {
      if ($2 == "Number" || $2 == "Date") { abstract++ }
      else {
        d = $2; a = $3;
        sub(/\([^)]*\)$/, "", d); sub(/\([^)]*\)$/, "", a);
        if (d == a) { len++ } else { typ++ }
      }
    }
    END { print typ + 0, len + 0, abstract + 0 }
  ' "${column_type_divergences}")"

  printf 'entity columns compared : %s\n' "$(wc -l < "${entity_column_types}" | tr -d ' ')"
  printf 'column-type drifts      : %s\n' "$(wc -l < "${column_type_divergences}" | tr -d ' ')"
  printf 'column-type manifest    : %s\n' "$(wc -l < "${column_type_manifest}" | tr -d ' ')"
  # These two labels are deliberately prefixed: the tenant-type ratchet above
  # prints counters with the same names, and an unprefixed block would leave a
  # reader unable to tell which ratchet a number belongs to.
  printf 'column-type unlisted    : %s\n' "${unlisted_column_type_count}"
  printf 'column-type stale       : %s\n' "${stale_column_type_count}"
  printf 'drift class type        : %s\n' "${type_drift_count}"
  printf 'drift class length      : %s\n' "${len_drift_count}"
  printf 'drift class abstract    : %s\n' "${abstract_drift_count}"

  if [ -n "${unlisted_column_type_drifts}" ]; then
    printf '\n%s\n' "Entity column types that diverge from the built schema and are missing from scripts/schema-column-type-manifest.txt (table.column | declared | actual):"
    printf '%s\n' "${unlisted_column_type_drifts}" | sed 's/^/  - /'
  fi
  if [ -n "${stale_column_type_entries}" ]; then
    printf '\n%s\n' "Column-type manifest entries matching no real divergence (delete the line if the column was fixed):"
    printf '%s\n' "${stale_column_type_entries}" | sed 's/^/  - /'
  fi
}

collect_rls_coverage() {
  # Structural catalog facts for EVERY public base table: the same facts the
  # migration-built DB spec collects for its scratch schema (tenant column,
  # ENABLE, FORCE, policy count). No tenant data is ever read; the catalog is
  # judged by src/core/database/tenant-rls-coverage.ts, compiled to dist by
  # the build step above, so the shell gate and the Jest specs share one
  # classification vocabulary and one fail-closed manifest parser.
  psql_admin -d "${SCRATCH_DB}" -tAc \
    "SELECT c.relname || '|' || EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id') || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity || '|' || (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname" \
    | sed '/^[[:space:]]*$/d' | sort -u > "${rls_coverage_catalog}"

  ( cd "${APP_DIR}" && \
    RLS_COVERAGE_MODULE="${APP_DIR}/dist/core/database/tenant-rls-coverage.js" \
    RLS_COVERAGE_MANIFEST="${MANIFEST_RLS_COVERAGE}" \
    RLS_COVERAGE_CATALOG="${rls_coverage_catalog}" \
    node -e '
const fs = require("fs");
const {
  loadTenantRlsManifest,
  evaluateTenantRlsCoverage,
} = require(process.env.RLS_COVERAGE_MODULE);
const manifest = loadTenantRlsManifest(process.env.RLS_COVERAGE_MANIFEST);
const tables = fs
  .readFileSync(process.env.RLS_COVERAGE_CATALOG, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [name, tenant, enabled, forced, policies] = line.split("|");
    // SQL string concatenation renders booleans as true/false; psql -tA
    // displays them as t/f. Accept both so the catalog spelling can never
    // silently flip the structural facts of a table.
    const isTrue = (value) => value === "t" || value === "true";
    return {
      name,
      hasTenantIdColumn: isTrue(tenant),
      rlsEnabled: isTrue(enabled),
      rlsForced: isTrue(forced),
      policyCount: Number(policies),
    };
  });
const result = evaluateTenantRlsCoverage(manifest, tables);
const counts = result.classifiedCounts;
const classified = counts.direct + counts["parent-owned"] + counts.global + counts.debt;
process.stdout.write(
  "tables=" + tables.length +
  " classified=" + classified +
  " direct=" + counts.direct +
  " parent-owned=" + counts["parent-owned"] +
  " global=" + counts.global +
  " debt=" + counts.debt +
  " failures=" + result.failures.length +
  "\n",
);
for (const failure of result.failures) {
  process.stdout.write(failure.kind + "|" + failure.table + "|" + failure.detail + "\n");
}
  ' ) > "${rls_coverage_output}"
}

report_rls_coverage_diff() {
  # First line: the deterministic counters. Remaining lines: kind|table|detail.
  rls_coverage_summary="$(head -n 1 "${rls_coverage_output}")"
  tail -n +2 "${rls_coverage_output}" > "${rls_coverage_failures}" || true
  rls_coverage_failure_count="$(wc -l < "${rls_coverage_failures}" | tr -d ' ')"

  printf 'coverage manifest tables : %s\n' "$(sed -n 's/.*tables=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage classified      : %s\n' "$(sed -n 's/.*classified=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage direct          : %s\n' "$(sed -n 's/.*direct=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage parent-owned    : %s\n' "$(sed -n 's/.*parent-owned=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage global          : %s\n' "$(sed -n 's/.*global=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage debt            : %s\n' "$(sed -n 's/.*debt=\([0-9]*\).*/\1/p' <<< "${rls_coverage_summary}")"
  printf 'coverage failures        : %s\n' "${rls_coverage_failure_count}"

  if [ "${rls_coverage_failure_count}" -ne 0 ]; then
    printf '\n%s\n' "Tenant RLS coverage gate failures (kind | table | detail):"
    sed 's/^/  - /' "${rls_coverage_failures}"
  fi
}

printf '\n%s\n' "==> Scenario 1: comparing against the entity declarations"
collect_tables
report_diff
collect_columns
report_column_diff
collect_rls_invariants
report_rls_diff
collect_tenant_type_invariants
report_tenant_type_diff
collect_entity_tenant_types
collect_schema_uuid_tenant_tables
report_tenant_entity_diff
collect_entity_column_types
collect_schema_column_types
report_column_type_diff
collect_rls_coverage
report_rls_coverage_diff

printf '\n'
if [ "${migration_status}" -ne 0 ]; then
  fail "FAIL: the migration set did not complete on an empty database (exit ${migration_status})."
fi
if [ "${missing_count}" -ne 0 ]; then
  fail "FAIL: ${missing_count} entity table(s) are never created (see above)."
fi
if [ "${missing_column_count}" -ne 0 ]; then
  fail "FAIL: ${missing_column_count} entity column(s) are never created (see above)."
fi
if [ "${deny_all_count}" -ne 0 ]; then
  fail "FAIL: ${deny_all_count} forced-RLS table(s) have no policy at all and would deny every row (see above)."
fi
if [ "${missing_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${missing_tenant_count} policy expression(s) on forced-RLS tables never reference app.tenant_id (see above)."
fi
if [ "${unlisted_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${unlisted_tenant_count} tenant column(s) are not uuid and are not listed in scripts/schema-tenant-type-manifest.txt (see above)."
fi
if [ "${stale_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${stale_tenant_count} tenant-type manifest entry(ies) match no non-uuid tenant column - delete the line if the column was fixed (see above)."
fi
if [ "${uuid_cast_issue_count}" -ne 0 ]; then
  fail "FAIL: ${uuid_cast_issue_count} policy expression(s) on a uuid tenant column still cast the column to text or omit the uuid cast on the setting (see above)."
fi
if [ "${tenant_entity_mismatch_count}" -ne 0 ]; then
  fail "FAIL: ${tenant_entity_mismatch_count} entity declaration(s) disagree with a uuid tenant_id column in the built schema (see above)."
fi
if [ "${unlisted_column_type_count}" -ne 0 ]; then
  fail "FAIL: ${unlisted_column_type_count} entity column type(s) diverge from the built schema and are not listed in scripts/schema-column-type-manifest.txt (see above)."
fi
if [ "${stale_column_type_count}" -ne 0 ]; then
  fail "FAIL: ${stale_column_type_count} column-type manifest entry(ies) match no real divergence - delete the line if the column was fixed (see above)."
fi
if [ "${rls_coverage_failure_count}" -ne 0 ]; then
  fail "FAIL: ${rls_coverage_failure_count} tenant RLS coverage gate failure(s) on the freshly built schema (see above): every public base table must be classified exactly once in scripts/schema-rls-coverage-manifest.txt, direct tables must carry tenant_id, ENABLE RLS, FORCE RLS, and at least one policy, global/parent-owned tables must not declare tenant_id, and debt entries must still carry real debt."
fi

printf '%s\n' "PASS (scenario 1): the migration set builds every entity table and column from an empty database, no forced-RLS table is left deny-all without a tenant-scoped policy, and every public base table carries a valid tenant RLS classification."

# ---------------------------------------------------------------------------
# Scenario 2: a developer database with a partial ledger. The tables already
# exist, but the migrations ledger has no row for the bootstrap migrations, the
# four creates that used to be non-idempotent (the three CREATE TABLEs and the
# follow-up RLS migration), nor for the sixteen migrations whose CREATE POLICY
# statements were guarded for re-application (issue #285), so TypeORM re-runs
# them. Every statement those migrations issue must tolerate the existing
# schema instead of failing with "already exists".
# ---------------------------------------------------------------------------
printf '\n%s\n' "==> Scenario 2: re-running against the same database with a partial ledger"

partial_ledger_names="CreateBaseCashierSessions1759000000000,CreateBootstrapIdentityTables1759000000001,CreateBootstrapInventorySalesTables1759000000002,CreateBootstrapExtensions1759000000003,CreateBootstrapLoyaltyTables1759000000004,CreateBootstrapSalesTables1759000000005,AddTenantCapabilityEvent1785000000000,CreateTenantTopologyRevisions1794000000000,AddTenantTopologyRevisionsRls1794000000001,CreateTenantFulfillmentRecords1795000000000,CreateCatalogValues1768000000000,CreateInventoryPurchaseDocuments1776000000000,AddDeterministicSyncSequencing1780000000000,AddCreditNoteProvenance1782000000000,CreateSystemParametersConfig1784000000000,CreateProductionBatchHistory1781000000000,AddBatch6bCostingLifecycle1785000000000,CreateProductInventoryMappingVersions1802000000000,CreateInventoryRemediationReceipts1806000000000,CreateDeviceSyncCredentials1807000000000,RepairTenantTopologyRevisions1808000000000,CreateHumanAuthorizationCore1809000000000,EnforceOnboardingFiscalTenantRls1809000000001,CreateHumanAuthorizationRecovery1809010000000,CreateHumanAuthorizationObservability1809020000000,CreateHumanAuthorizationTenantPublicationState1809040000000,CreateHumanAuthorizationPolicySnapshots1809050000000,EnforceOnboardingSessionRls1809220000000,EnforceOnboardingTemplateRls1809230000000,EnforceOnboardingImportRls1809240000000,EnforceCatalogRls1809250000000,EnforceRecipeCatalogRls1809260000000,EnforceInventoryRls1809270000000,EnforceCustomerLoyaltyRls1809280000000,EnforceCashShiftRls1809290000000,EnforcePromotionsRls1809300000000,EnforceChangeLogForensicRls1809310000000,EnforceDatafonosRls1809320000000,EnforceParentOwnedRls1809330000000"
deleted_rows="$(psql_admin -d "${SCRATCH_DB}" -tAc \
  "WITH removed AS (DELETE FROM migrations WHERE name = ANY (string_to_array('${partial_ledger_names}', ',')) RETURNING 1) SELECT count(*) FROM removed" \
  | tr -d ' ')"
expected_deleted_rows=39
printf 'ledger rows removed    : %s (expected %s)\n' "${deleted_rows}" "${expected_deleted_rows}"
if [ "${deleted_rows}" -ne "${expected_deleted_rows}" ]; then
  fail "FAIL: expected to remove ${expected_deleted_rows} ledger rows to simulate the partial ledger, removed ${deleted_rows}."
fi

migration2_status=0
run_migrations || migration2_status=$?

printf '\n%s\n' "==> Scenario 2: comparing against the entity declarations again"
collect_tables
report_diff
collect_columns
report_column_diff
collect_rls_invariants
report_rls_diff
collect_tenant_type_invariants
report_tenant_type_diff
collect_entity_tenant_types
collect_schema_uuid_tenant_tables
report_tenant_entity_diff
collect_entity_column_types
collect_schema_column_types
report_column_type_diff
collect_rls_coverage
report_rls_coverage_diff

printf '\n'
if [ "${migration2_status}" -ne 0 ]; then
  fail "FAIL: the migration set did not complete on a pre-existing database with a partial ledger (exit ${migration2_status})."
fi
if [ "${missing_count}" -ne 0 ]; then
  fail "FAIL: ${missing_count} entity table(s) are missing after the partial-ledger re-run (see above)."
fi
if [ "${missing_column_count}" -ne 0 ]; then
  fail "FAIL: ${missing_column_count} entity column(s) are missing after the partial-ledger re-run (see above)."
fi
if [ "${deny_all_count}" -ne 0 ]; then
  fail "FAIL: ${deny_all_count} forced-RLS table(s) lost every policy after the partial-ledger re-run (see above)."
fi
if [ "${missing_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${missing_tenant_count} policy expression(s) on forced-RLS tables lost the app.tenant_id predicate after the partial-ledger re-run (see above)."
fi
if [ "${unlisted_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${unlisted_tenant_count} tenant column(s) are not uuid and are not listed in scripts/schema-tenant-type-manifest.txt after the partial-ledger re-run (see above)."
fi
if [ "${stale_tenant_count}" -ne 0 ]; then
  fail "FAIL: ${stale_tenant_count} tenant-type manifest entry(ies) match no non-uuid tenant column after the partial-ledger re-run (see above)."
fi
if [ "${uuid_cast_issue_count}" -ne 0 ]; then
  fail "FAIL: ${uuid_cast_issue_count} policy expression(s) on a uuid tenant column cast the column to text or omit the uuid cast after the partial-ledger re-run (see above)."
fi
if [ "${tenant_entity_mismatch_count}" -ne 0 ]; then
  fail "FAIL: ${tenant_entity_mismatch_count} entity declaration(s) disagree with a uuid tenant_id column in the built schema after the partial-ledger re-run (see above)."
fi
if [ "${unlisted_column_type_count}" -ne 0 ]; then
  fail "FAIL: ${unlisted_column_type_count} entity column type(s) diverge from the built schema and are not listed in scripts/schema-column-type-manifest.txt after the partial-ledger re-run (see above)."
fi
if [ "${stale_column_type_count}" -ne 0 ]; then
  fail "FAIL: ${stale_column_type_count} column-type manifest entry(ies) match no real divergence after the partial-ledger re-run - delete the line if the column was fixed (see above)."
fi
if [ "${rls_coverage_failure_count}" -ne 0 ]; then
  fail "FAIL: ${rls_coverage_failure_count} tenant RLS coverage gate failure(s) after the partial-ledger re-run (see above): the migration set must leave every public base table classified exactly once with its structural contract intact."
fi

printf '%s\n' "PASS (scenario 2): the migration set re-applies cleanly over an existing schema with a partial ledger."
printf '%s\n' "PASS: the migration set builds every entity table and column from an empty database, survives a partial-ledger re-run, and leaves no forced-RLS table deny-all, no defined policy expression without the app.tenant_id predicate, no non-uuid tenant column outside the reviewed manifest, no predicate on a uuid tenant column left in the text form, no entity declaring tenant_id with a non-uuid type where the schema column is uuid, no entity-declared column type diverging from the built schema outside the reviewed column-type manifest, and no public base table without a valid tenant RLS classification."
