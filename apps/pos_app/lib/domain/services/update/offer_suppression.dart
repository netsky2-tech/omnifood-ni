/// T3 (offer suppression, odd/tasks/ota-automatic-discovery.md) — port for
/// remembering the highest release `versionCode` explicitly DISMISSED by an
/// operator (T3c). Nothing else is ever written to it: silently surfacing an
/// offer suppresses it for the current process in memory only, so a release
/// nobody acted on re-surfaces after a restart, which is what AC5 requires
/// ("once the operator dismisses an offer…").
///
/// The store is keyed by the **int** `versionCode`, never by the
/// `"1.0.0+7"` display string (fact V11): the string carries a per-ABI
/// offset and is incomparable across devices, while the int `versionCode`
/// is monotonic per ABI (parent F6/Q1).
///
/// Deliberately NOT a boolean "dismissed" flag: such a flag would hide
/// every future release. Storing the highest suppressed versionCode means
/// any strictly greater `versionCode` re-offers, which is exactly AC5's
/// contract without permanently silencing discovery.
abstract class ReleaseOfferSuppressionStore {
  /// The highest `versionCode` explicitly dismissed, or `null` when nothing
  /// has been recorded yet (fresh install: the first release must surface).
  Future<int?> readHighestSuppressedVersionCode();

  /// Records [versionCode] as dismissed. Implementations must keep
  /// the stored value MONOTONIC: recording a lower value than the current
  /// highest must be a no-op, so a stale tick can never re-suppress a
  /// version that was already offered.
  Future<void> recordSuppressedVersionCode(int versionCode);
}

/// Base failure type for [ReleaseOfferSuppressionStore] implementations.
///
/// Failures here are persistence problems, never business outcomes: the
/// discovery service treats a read failure as "nothing suppressed"
/// (fail-open — re-offering a known release is a cosmetic repeat, hiding a
/// NEW release is the real harm) and swallows write failures so the silent
/// loop never breaks.
abstract class ReleaseOfferSuppressionFailure implements Exception {
  const ReleaseOfferSuppressionFailure(this.message, [this.cause]);

  final String message;
  final Object? cause;

  @override
  String toString() =>
      'ReleaseOfferSuppressionFailure: $message${cause != null ? ' (cause: $cause)' : ''}';
}

class ReleaseOfferSuppressionReadFailure
    implements ReleaseOfferSuppressionFailure {
  const ReleaseOfferSuppressionReadFailure(this.message, [this.cause]);

  @override
  final String message;
  @override
  final Object? cause;

  @override
  String toString() =>
      'ReleaseOfferSuppressionReadFailure: $message${cause != null ? ' (cause: $cause)' : ''}';
}

class ReleaseOfferSuppressionWriteFailure
    implements ReleaseOfferSuppressionFailure {
  const ReleaseOfferSuppressionWriteFailure(this.message, [this.cause]);

  @override
  final String message;
  @override
  final Object? cause;

  @override
  String toString() =>
      'ReleaseOfferSuppressionWriteFailure: $message${cause != null ? ' (cause: $cause)' : ''}';
}
