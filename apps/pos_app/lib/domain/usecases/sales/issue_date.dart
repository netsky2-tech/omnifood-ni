/// D-12: the local-calendar-date axis of the D-15 void guard.
///
/// Deliberately SEPARATE from [ShiftMembership] (shift_membership.dart) and
/// with its own result type: a shift may cross midnight, so shift membership
/// says "same" for a ticket issued 23/09 21:40 that is being voided at
/// 24/09 00:20 while the local calendar date says the fiscal day changed.
/// The D-15 guard is the conjunction of three predicates (own invoice +
/// open current shift + same local calendar date); this library owns only
/// the third. Reporte X/Z must not participate in this rule (D-12).
library;

/// Why this axis is BINARY and must stay binary, unlike the tri-state
/// shift axis: `createdAt` is non-null on every row that has ever existed,
/// so there is no fact on this axis we cannot compute. A pre-migration row
/// with a null `local_issue_date` is a DERIVATION case (fall back to the
/// local calendar date of `createdAt`), not an unknown case. Do not
/// "complete the symmetry" with ShiftMembership by adding a third state:
/// the two axes have different epistemology — `shiftId` can genuinely be
/// missing (the data was never recorded), the issue date never is.
enum IssueDateComparison {
  /// The invoice was issued on the same local calendar date as the moment
  /// being tested (e.g. the void request).
  sameDate,

  /// The invoice was issued on a different local calendar date. Covers the
  /// midnight-crossing case: issued 23/09 21:40, tested at 24/09 00:20.
  differentDate,
}

/// Formats the local calendar date of [moment] as ISO `YYYY-MM-DD`, using
/// the moment's local-time fields. A UTC-flagged DateTime is converted to
/// the device's local zone first: the fiscal day is the LOCAL calendar day.
String localCalendarDate(DateTime moment) {
  final local = moment.isUtc ? moment.toLocal() : moment;
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year.toString().padLeft(4, '0')}-$month-$day';
}

/// Resolves the local issue date of an invoice: the stored
/// [localIssueDate] when present (the fiscal fact fixed at issuance),
/// otherwise the local calendar date of [createdAt] for pre-migration rows.
/// Never returns null: this axis has no unknown state (see the enum doc).
String resolveLocalIssueDate({
  String? localIssueDate,
  required DateTime createdAt,
}) {
  final stored = localIssueDate;
  if (stored != null && stored.isNotEmpty) return stored;
  return localCalendarDate(createdAt);
}

/// Classifies whether the invoice was issued on the same local calendar
/// date as [comparedTo] (e.g. the void request moment).
IssueDateComparison classifyIssueDate({
  String? localIssueDate,
  required DateTime createdAt,
  required DateTime comparedTo,
}) {
  final issueDate = resolveLocalIssueDate(
    localIssueDate: localIssueDate,
    createdAt: createdAt,
  );
  return issueDate == localCalendarDate(comparedTo)
      ? IssueDateComparison.sameDate
      : IssueDateComparison.differentDate;
}
