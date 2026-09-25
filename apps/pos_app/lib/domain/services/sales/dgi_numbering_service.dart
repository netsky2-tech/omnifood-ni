/// D-16/D-18: DGI fiscal numbering for invoices and credit notes. The
/// sequence configuration is a FIRST-CLASS nullable state: until SOHO's
/// authorization letter documents a real range, `end` is null and the
/// absence looks like absence — a fail-closed named error, never the
/// invented 1-1000 fiction, never a self-healed default (all three
/// self-heals were removed in B2a).
///
/// Fiscal-only: kitchen tickets and other non-fiscal documents never touch
/// this service and are not gated by it.
library;

/// D-16: named fail-closed state — no sequence configured for the tenant.
/// The operator must provision the range from the business profile (or the
/// eventual #554 server-side sync) before any fiscal document can emit.
class FiscalSequenceUnconfiguredError implements Exception {
  final String code = 'FISCAL_SEQUENCE_UNCONFIGURED';
  final String message;

  const FiscalSequenceUnconfiguredError(this.message);

  @override
  String toString() => '$code: $message';
}

/// D-18: named fail-closed state — the configured range is consumed. The
/// last number stays consumed: never reuse, never wrap, never self-extend.
/// Escalate to the administrative flow for a new authorized range.
class FiscalSequenceExhaustedError implements Exception {
  final String code = 'FISCAL_SEQUENCE_EXHAUSTED';
  final String message;

  const FiscalSequenceExhaustedError(this.message);

  @override
  String toString() => '$code: $message';
}

abstract class DgiNumberingService {
  /// Provisions the series. [end] is nullable per D-16: a series without a
  /// documented end is a legitimate state (unbounded until the real range
  /// arrives). Never called by the boot sequence (D-1: boot never writes).
  Future<void> initializeRange({
    required String prefix,
    required int start,
    required int? end,
  });

  /// Returns the next formatted fiscal number. Throws
  /// [FiscalSequenceUnconfiguredError] when the sequence is unconfigured and
  /// [FiscalSequenceExhaustedError] when the configured end was reached.
  Future<String> getNextNumber();

  /// Advances the cursor past the returned number.
  Future<void> incrementNumber();

  /// True when the configured range is consumed. Throws
  /// [FiscalSequenceUnconfiguredError] when the sequence is unconfigured —
  /// the caller fails the sale with the named error. A null end is never
  /// exhausted (D-16 nullable state).
  Future<bool> isRangeExhausted();
}
