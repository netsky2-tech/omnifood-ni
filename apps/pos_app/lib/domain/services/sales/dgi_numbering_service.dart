/// D-21 (supersedes the D-16/D-18 range framing): there is NO range for
/// computerized systems — only consecutive, progressive, gapless numbering.
/// Issuance is unbounded: the single failure state is
/// [FiscalSequenceUnconfiguredError] (no consecutivo inicial configured, or
/// a corrupt/unparseable cursor — a configuration state, never a self-healed
/// default; all self-heals were removed in B2a).
///
/// The prefix is optional (D-21): blank → the folio is the plain decimal
/// consecutivo with no padding; present → prefix + zero-padded 8-digit folio.
///
/// Fiscal-only: kitchen tickets and other non-fiscal documents never touch
/// this service and are not gated by it.
library;

/// D-16: named fail-closed state — no usable sequence configured for the
/// tenant (absent or corrupt consecutivo). The operator must provision the
/// consecutivo inicial from the fiscal authorization before any fiscal
/// document can emit.
class FiscalSequenceUnconfiguredError implements Exception {
  final String code = 'FISCAL_SEQUENCE_UNCONFIGURED';
  final String message;

  const FiscalSequenceUnconfiguredError(this.message);

  @override
  String toString() => '$code: $message';
}

/// D-6/#526 (unit G2b): named fail-closed state for a fiscal sequence
/// REPLAY refusal. When a terminal proposes its local fiscal cursor to the
/// backend tripwire (`GET onboarding/terminals/priming?proposedSequence=`)
/// and the cloud already issued that sequence (or cannot read its MAX), the
/// backend answers HTTP 409 `FISCAL_SEQUENCE_RECOVERY_REQUIRED` and no
/// number is corrected or renumbered. This is a RECOVERY state, semantically
/// distinct from [FiscalSequenceUnconfiguredError]: the local cursor exists
/// and is valid, but the authority refuses issuance from it until explicit
/// recovery runs. The operator must stop selling and call support.
class FiscalSequenceRecoveryRequiredError implements Exception {
  final String code = 'FISCAL_SEQUENCE_RECOVERY_REQUIRED';
  final String message;

  /// The cloud's highest issued invoice sequence. Null when the backend
  /// could not read its MAX (second refusal variant).
  final int? highestSequenceNumber;

  /// The sequence the terminal proposed. Null when no local cursor existed.
  final int? proposedSequence;

  const FiscalSequenceRecoveryRequiredError(
    this.message, {
    this.highestSequenceNumber,
    this.proposedSequence,
  });

  @override
  String toString() =>
      '$code: $message (highestSequenceNumber: $highestSequenceNumber, '
      'proposedSequence: $proposedSequence)';
}

abstract class DgiNumberingService {
  /// Provisions the series. [start] is the consecutivo inicial seed; it only
  /// takes effect when no cursor is persisted yet (D-1: never overwrite a
  /// persisted fiscal sequence). D-21: there is no range end — computerized
  /// systems issue an unbounded consecutivo, so the retired `end` parameter
  /// and the `dgi_range_end` key no longer exist. Never called by the boot
  /// sequence (D-1: boot never writes).
  Future<void> initializeRange({
    required String prefix,
    required int start,
  });

  /// Returns the next fiscal number. Throws
  /// [FiscalSequenceUnconfiguredError] when the sequence is unconfigured or
  /// the cursor is corrupt. Numbering is consecutive and unbounded (D-21):
  /// there is no exhaustion state.
  Future<String> getNextNumber();

  /// Advances the cursor past the returned number.
  Future<void> incrementNumber();
}
