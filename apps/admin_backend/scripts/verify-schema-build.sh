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
[ -f "${MANIFEST_TENANT_TYPES}" ] || fail "FAIL: tenant-type manifest not found at ${MANIFEST_TENANT_TYPES}."

fail() { printf '%s\n' "$*" >&2; exit 1; }

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
trap 'rm -f "${entities}" "${applied}" "${entity_columns}" "${db_columns}" "${forced_rls_tables}" "${rls_policies}" "${rls_policy_exprs_missing_tenant}" "${tenant_type_manifest}" "${tenant_type_actual}" "${tenant_uuid_cast_issues}" "${schema_uuid_tenant_tables}" "${entity_tenant_types}"' EXIT

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

printf '%s\n' "PASS (scenario 1): the migration set builds every entity table and column from an empty database, and no forced-RLS table is left deny-all without a tenant-scoped policy."

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

partial_ledger_names="CreateBaseCashierSessions1759000000000,CreateBootstrapIdentityTables1759000000001,CreateBootstrapInventorySalesTables1759000000002,CreateBootstrapExtensions1759000000003,CreateBootstrapLoyaltyTables1759000000004,CreateBootstrapSalesTables1759000000005,AddTenantCapabilityEvent1785000000000,CreateTenantTopologyRevisions1794000000000,AddTenantTopologyRevisionsRls1794000000001,CreateTenantFulfillmentRecords1795000000000,CreateCatalogValues1768000000000,CreateInventoryPurchaseDocuments1776000000000,AddDeterministicSyncSequencing1780000000000,AddCreditNoteProvenance1782000000000,CreateSystemParametersConfig1784000000000,CreateProductionBatchHistory1781000000000,AddBatch6bCostingLifecycle1785000000000,CreateProductInventoryMappingVersions1802000000000,CreateInventoryRemediationReceipts1806000000000,CreateDeviceSyncCredentials1807000000000,RepairTenantTopologyRevisions1808000000000,CreateHumanAuthorizationCore1809000000000,EnforceOnboardingFiscalTenantRls1809000000001,CreateHumanAuthorizationRecovery1809010000000,CreateHumanAuthorizationObservability1809020000000,CreateHumanAuthorizationTenantPublicationState1809040000000,CreateHumanAuthorizationPolicySnapshots1809050000000"
deleted_rows="$(psql_admin -d "${SCRATCH_DB}" -tAc \
  "WITH removed AS (DELETE FROM migrations WHERE name = ANY (string_to_array('${partial_ledger_names}', ',')) RETURNING 1) SELECT count(*) FROM removed" \
  | tr -d ' ')"
expected_deleted_rows=27
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

printf '%s\n' "PASS (scenario 2): the migration set re-applies cleanly over an existing schema with a partial ledger."
printf '%s\n' "PASS: the migration set builds every entity table and column from an empty database, survives a partial-ledger re-run, and leaves no forced-RLS table deny-all, no defined policy expression without the app.tenant_id predicate, no non-uuid tenant column outside the reviewed manifest, no predicate on a uuid tenant column left in the text form, and no entity declaring tenant_id with a non-uuid type where the schema column is uuid."
