import 'dart:convert';

/// Pure, framework-free decision logic for the durable per-user PIN attempt
/// policy (design §6, spec `Durable User-Terminal Attempt Controls`).
///
/// Default policy: three failures in a rolling 60-second window lock the
/// `(tenant, terminal, user)` pair for five minutes. Timestamps older than
/// the window are pruned on every evaluation, so a user who waits out the
/// window never accumulates stale evidence toward a new lockout.
///
/// The DAO's authorization transaction calls these functions with the stored
/// attempt row's data and the caller's clock; this class owns no state.
abstract final class OhacAttemptPolicy {
  /// How far back a failure still counts toward a lockout.
  static const Duration failureWindow = Duration(seconds: 60);

  /// Failures within [failureWindow] that trigger the lockout.
  static const int maxFailuresInWindow = 3;

  /// How long a triggered lockout holds.
  static const Duration lockout = Duration(minutes: 5);

  /// Decodes the stored JSON array of ISO-8601 failure instants.
  ///
  /// A stored value that is not a JSON array of parseable instants is corrupt
  /// row data and fails closed (throws) instead of being silently dropped —
  /// a silently shortened window would quietly shorten lockouts.
  static List<DateTime> decodeFailureTimestamps(String storedJson) {
    final Object? decoded;
    try {
      decoded = jsonDecode(storedJson);
    } on FormatException {
      throw StateError(
        'OHAC attempt state holds a corrupt failure-timestamps payload; '
        'refusing to shorten the rolling window by dropping it',
      );
    }
    if (decoded is! List) {
      throw StateError(
        'OHAC attempt state failure timestamps are not a JSON array',
      );
    }
    return decoded.map((entry) {
      if (entry is! String) {
        throw StateError(
          'OHAC attempt state holds a non-string failure timestamp',
        );
      }
      final instant = DateTime.tryParse(entry);
      if (instant == null) {
        throw StateError(
          'OHAC attempt state holds an unparseable failure timestamp',
        );
      }
      return instant.toUtc();
    }).toList();
  }

  /// Encodes failure instants back to the stored JSON array form.
  static String encodeFailureTimestamps(List<DateTime> timestamps) =>
      jsonEncode(
        timestamps.map((instant) => instant.toUtc().toIso8601String()).toList(),
      );

  /// Whether the stored [lockedUntil] instant (nullable, ISO-8601) still
  /// holds at [now]. A null or already-expired lockout is not locked: the
  /// expiry instant itself releases (§6's backoff expiry is the first
  /// admissible attempt instant).
  static bool isLocked(String? lockedUntil, DateTime now) {
    if (lockedUntil == null || lockedUntil.isEmpty) return false;
    final until = DateTime.tryParse(lockedUntil);
    if (until == null) {
      throw StateError(
        'OHAC attempt state holds an unparseable locked_until; refusing to '
        'fail open on a lockout',
      );
    }
    return now.isBefore(until);
  }

  /// Records one failed attempt: prunes the rolling window, appends [now],
  /// and — when the window reaches [maxFailuresInWindow] — locks until
  /// [now] plus [lockout].
  static OhacAttemptFailureDecision recordFailure({
    required String storedFailureTimestamps,
    required DateTime now,
  }) {
    final windowStart = now.subtract(failureWindow);
    final inWindow = decodeFailureTimestamps(storedFailureTimestamps)
        .where((instant) => instant.isAfter(windowStart))
        .toList()
      ..add(now.toUtc());

    final justLocked = inWindow.length >= maxFailuresInWindow;
    return OhacAttemptFailureDecision(
      failureTimestamps: inWindow,
      lockedUntil: justLocked ? now.add(lockout) : null,
      justLocked: justLocked,
    );
  }
}

/// The immutable outcome of recording one failed attempt (design §6).
final class OhacAttemptFailureDecision {
  /// The pruned window plus the new failure, in the stored JSON-array shape's
  /// Dart form.
  final List<DateTime> failureTimestamps;

  /// The lockout to persist, or `null` when this failure did not trigger one.
  final DateTime? lockedUntil;

  /// Whether this failure triggered the lockout ([lockedUntil] non-null).
  final bool justLocked;

  const OhacAttemptFailureDecision({
    required this.failureTimestamps,
    required this.lockedUntil,
    required this.justLocked,
  });
}
