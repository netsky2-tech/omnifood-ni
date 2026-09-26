// D-21 (#554) U4: DGI authorization expiry warning.
//
// Owner's ruling (2026-09-25): warn the operator that the DGI authorization
// code is about to expire. The warning lead time is the owner's FIXED
// decision of 30 days — it is deliberately NOT configurable.
//
// Semantics (D-16: absence looks like absence):
// - key absent, blank, or corrupt -> NO notice. A corrupt date must never
//   invent a warning, so only a strict `yyyy-MM-dd` calendar date resolves.
// - more than [fiscalExpiryWarningLeadDays] days out -> NO notice.
// - 1..[fiscalExpiryWarningLeadDays] days out -> amber informational notice.
// - 0 or negative days -> stronger "venció" notice.
//
// CRITICAL INVARIANT: this is a WARNING ONLY. It never blocks, gates, or
// alters invoice issuance in any way — the system does not interpret DGI
// norms; it just surfaces the configured expiry date to the operator.

/// D-21 (#554) U4: the owner's fixed decision (2026-09-25): warn 30 days
/// before the DGI authorization code expires. Not configurable by design.
const int fiscalExpiryWarningLeadDays = 30;

enum FiscalAuthorizationExpiryNoticeLevel {
  /// 1..30 days until expiry: amber informational notice.
  upcoming,

  /// Expiry day reached or passed: stronger "venció" notice.
  expired,
}

/// An informational, non-blocking expiry notice for the DGI authorization
/// code. Carries no blocking semantics by design (warning only).
class FiscalAuthorizationExpiryNotice {
  final String message;
  final FiscalAuthorizationExpiryNoticeLevel level;

  const FiscalAuthorizationExpiryNotice({
    required this.message,
    required this.level,
  });
}

/// Resolves the expiry notice for the raw `dgi_authorization_expires_at`
/// config value (ISO `yyyy-MM-dd`), or null when no notice should show.
///
/// [today] is injectable for deterministic tests; it defaults to the real
/// current date (same optional-clock pattern used across the codebase).
FiscalAuthorizationExpiryNotice? resolveFiscalAuthorizationExpiryNotice({
  String? rawExpiresAt,
  DateTime? today,
}) {
  final raw = rawExpiresAt?.trim() ?? '';
  if (raw.isEmpty) return null;

  // Corrupt or wrong-shape values must NOT invent a warning (D-16).
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(raw)) return null;
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return null;
  // DateTime.tryParse normalizes impossible calendar dates (2026-02-30 ->
  // 2026-03-02), so verify the parsed date round-trips to the exact
  // yyyy-MM-dd components. Anything else is corrupt -> no notice.
  final y = int.parse(raw.substring(0, 4));
  final m = int.parse(raw.substring(5, 7));
  final d = int.parse(raw.substring(8, 10));
  if (parsed.year != y || parsed.month != m || parsed.day != d) return null;

  final now = today ?? DateTime.now();
  final todayDate = DateTime(now.year, now.month, now.day);
  final expiryDate =
      DateTime(parsed.year, parsed.month, parsed.day);
  final days = expiryDate.difference(todayDate).inDays;

  if (days > fiscalExpiryWarningLeadDays) return null;

  if (days <= 0) {
    return FiscalAuthorizationExpiryNotice(
      message: 'Su código de autorización DGI venció el $raw.',
      level: FiscalAuthorizationExpiryNoticeLevel.expired,
    );
  }

  final dayWord = days == 1 ? 'día' : 'días';
  return FiscalAuthorizationExpiryNotice(
    message:
        'Su código de autorización DGI vence el $raw (en $days $dayWord).',
    level: FiscalAuthorizationExpiryNoticeLevel.upcoming,
  );
}
