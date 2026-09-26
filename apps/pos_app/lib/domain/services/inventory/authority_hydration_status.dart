/// Three-state local guard for recipe-authority hydration (#519 U5).
///
/// This is a LOCAL, read-only health signal about a terminal's hydration
/// state. It NEVER enters an invoice, a sale snapshot, or any sync payload:
/// the SALE_TIME_V1 snapshot `reasonCode` whitelist
/// (`NO_EXPLICIT_INSUMO_MAPPING` / `MISSING_PUBLISHED_RECIPE`) must not be
/// extended — this classifier exists precisely to diagnose the #519 class of
/// bug ("this terminal never hydrated") without touching that contract.
///
/// The #517 three-state trap is the point: "unknown" is its own state and is
/// NEVER folded into "empty". Row presence is the PRIMARY evidence — the
/// last-attempt verdict describes the pull, not whether the terminal holds
/// authority. The states are:
///
/// - [AuthorityHydrationState.hydrated]: the tenant is bound and has at
///   least one `authority_insumos` row. Sales can deduct; this is what
///   matters operationally, regardless of the most recent pull. A refused
///   last pull does NOT downgrade this state: yesterday's good hydration
///   plus today's bad pull must never raise the never-hydrated alarm.
/// - [AuthorityHydrationState.hydratedEmpty]: rows == 0 AND hydration has
///   EVER completed successfully for this terminal (`appliedAtKey` present).
///   The catalog genuinely has no published recipe authority. Informational.
/// - [AuthorityHydrationState.notHydrated]: rows == 0 AND hydration has
///   NEVER completed successfully. The #519 signature: the projections are
///   empty because nothing ever successfully wrote them. Also returned when
///   the terminal has no tenant binding (an unbound terminal can never prove
///   hydration, and must never be reported as `hydratedEmpty`).
///
/// The evidence each state uses is strictly local:
/// - rows: COUNT of `authority_insumos` for the bound tenant.
/// - tenancy: `local_configs` key [tenantIdKey] — the tenant the checkout
///   binds to.
/// - ever-succeeded marker: `local_configs` key [appliedAtKey] (written only
///   on an `applied` verdict, never overwritten by a later refusal).
/// - per-attempt telemetry (`resultKey`/`reasonKey`/`lastAtKey`) is NOT used
///   to decide the state; it stays readable for diagnostics.
///
/// Accepted limitation: a refused or failed pull does not invalidate
/// previously hydrated rows, so staleness after a superseded or withdrawn
/// cloud recipe is not detected here — that is the supersession/rebuild gap
/// already written up in `odd/tasks/issue-519-authority-hydration.md`, not
/// something to solve in this unit.
library;

/// The three hydration states. Exhaustive by construction; never add a
/// fourth by folding "unknown" into "empty".
enum AuthorityHydrationState { notHydrated, hydratedEmpty, hydrated }

/// Read-only classifier for the terminal's authority hydration state.
class AuthorityHydrationStatus {
  /// `local_configs` key stamped with the ISO8601 timestamp of the last
  /// hydration attempt that reached a verdict (#519 U4).
  static const String lastAtKey = 'authority_hydration_last_at';

  /// `local_configs` key stamped with the verdict of the last hydration
  /// attempt: `applied` | `refused` | `failed`.
  static const String resultKey = 'authority_hydration_last_result';

  /// `local_configs` key stamped with the machine-readable refusal/failure
  /// reason; empty when the last attempt was applied.
  static const String reasonKey = 'authority_hydration_last_reason';

  /// `local_configs` key stamped ONLY on an `applied` verdict (UTC ISO8601),
  /// never overwritten by a later refusal: the "hydration has EVER completed
  /// successfully" marker that separates `hydratedEmpty` from `notHydrated`.
  static const String appliedAtKey = 'authority_hydration_applied_at';

  /// `local_configs` key holding the tenant this terminal (checkout) binds
  /// to. Same key the inbound pull and business profile already read.
  static const String tenantIdKey = 'tenant_id';

  /// The only verdict that stamps [appliedAtKey].
  static const String appliedVerdict = 'applied';

  final Future<String?> Function(String key) readConfig;
  final Future<int?> Function(String tenantId) countAuthorityInsumos;

  const AuthorityHydrationStatus({
    required this.readConfig,
    required this.countAuthorityInsumos,
  });

  /// Classifies the terminal from local evidence only. Never throws by
  /// design of its readers' call sites (best-effort, like the banner).
  Future<AuthorityHydrationState> classify() async {
    // An unbound tenant cannot be checked against rows: unknown stays
    // notHydrated, never hydratedEmpty.
    final tenantId = (await readConfig(tenantIdKey))?.trim() ?? '';
    if (tenantId.isEmpty) {
      return AuthorityHydrationState.notHydrated;
    }

    // Rows are the primary evidence: a full authority table means sales can
    // deduct, whatever the most recent pull said.
    final count = await countAuthorityInsumos(tenantId) ?? 0;
    if (count > 0) {
      return AuthorityHydrationState.hydrated;
    }

    final appliedEver = (await readConfig(appliedAtKey))?.trim() ?? '';
    return appliedEver.isNotEmpty
        ? AuthorityHydrationState.hydratedEmpty
        : AuthorityHydrationState.notHydrated;
  }
}
