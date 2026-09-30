import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/ohac_attempt_policy.dart';

/// Pure-domain coverage for the durable attempt policy (design §6, spec
/// `Durable User-Terminal Attempt Controls`): rolling-window failures,
/// lockout, pruning, and the stored-format contract the DAO transaction
/// relies on.
void main() {
  final t0 = DateTime.utc(2026, 1, 4, 12, 0, 0);

  List<DateTime> decode(String json) =>
      OhacAttemptPolicy.decodeFailureTimestamps(json);

  group('stored format', () {
    test('decode/encode round trip preserves instants', () {
      final instants = [
        t0,
        t0.add(const Duration(seconds: 5)),
        t0.add(const Duration(seconds: 59)),
      ];
      final encoded = OhacAttemptPolicy.encodeFailureTimestamps(instants);
      expect(encoded, contains('2026-01-04T12:00:00.000Z'));
      expect(decode(encoded), instants);
    });

    test('decode of an empty stored window is empty', () {
      expect(decode('[]'), isEmpty);
    });

    test('a stored value that is not a JSON array fails closed', () {
      expect(() => decode('"2026-01-04T12:00:00.000Z"'), throwsStateError);
      expect(() => decode('{}'), throwsStateError);
      expect(() => decode('not json'), throwsA(isA<Object>()));
    });

    test('a stored entry that is not a parseable instant fails closed', () {
      expect(() => decode('["not an instant"]'), throwsStateError);
    });
  });

  group('isLocked', () {
    test('a null lockout is never locked', () {
      expect(OhacAttemptPolicy.isLocked(null, t0), isFalse);
    });

    test('an expired lockout does not hold', () {
      expect(
        OhacAttemptPolicy.isLocked(
          t0.subtract(const Duration(seconds: 1)).toIso8601String(),
          t0,
        ),
        isFalse,
      );
    });

    test('a lockout still in force holds', () {
      expect(
        OhacAttemptPolicy.isLocked(
          t0.add(const Duration(minutes: 4)).toIso8601String(),
          t0,
        ),
        isTrue,
      );
    });

    test('the lockout boundary itself releases: expiry instant is unlocked',
        () {
      final lockedUntil = t0.add(OhacAttemptPolicy.lockout);
      expect(OhacAttemptPolicy.isLocked(lockedUntil.toIso8601String(),
          lockedUntil), isFalse);
    });
  });

  group('recordFailure: rolling window', () {
    test('the first failure is recorded and does not lock', () {
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '[]',
        now: t0,
      );

      expect(decision.failureTimestamps, [t0]);
      expect(decision.justLocked, isFalse);
      expect(decision.lockedUntil, isNull);
    });

    test('timestamps older than the window are pruned, not counted', () {
      final stale = t0
          .subtract(const Duration(seconds: 61))
          .toIso8601String();
      final fresh = t0.subtract(const Duration(seconds: 10)).toIso8601String();
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '["$stale", "$fresh"]',
        now: t0,
      );

      expect(decision.failureTimestamps, [
        DateTime.parse(fresh),
        t0,
      ]);
      expect(decision.justLocked, isFalse);
    });

    test('a failure exactly 60 seconds old is outside the window', () {
      final boundary = t0
          .subtract(OhacAttemptPolicy.failureWindow)
          .toIso8601String();
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '["$boundary"]',
        now: t0,
      );

      expect(decision.failureTimestamps, [t0]);
      expect(decision.justLocked, isFalse);
    });

    test('three failures inside the window trigger the 5-minute lockout', () {
      final first = t0.subtract(const Duration(seconds: 20)).toIso8601String();
      final second = t0.subtract(const Duration(seconds: 10)).toIso8601String();
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '["$first", "$second"]',
        now: t0,
      );

      expect(decision.justLocked, isTrue);
      expect(decision.lockedUntil, t0.add(OhacAttemptPolicy.lockout));
      expect(decision.failureTimestamps.length, 3);
    });

    test('failures spread beyond the window do not accumulate toward the '
        'lockout', () {
      final old1 = t0
          .subtract(const Duration(seconds: 61))
          .toIso8601String();
      final old2 = t0.subtract(const Duration(seconds: 35)).toIso8601String();
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '["$old1", "$old2"]',
        now: t0,
      );

      expect(decision.justLocked, isFalse);
      expect(decision.lockedUntil, isNull);
    });

    test('the window boundary at the 3rd failure: pruning decides, not the '
        'raw count', () {
      final first = t0
          .subtract(OhacAttemptPolicy.failureWindow)
          .toIso8601String();
      final second = t0.subtract(const Duration(seconds: 1)).toIso8601String();
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: '["$first", "$second"]',
        now: t0,
      );

      expect(decision.justLocked, isFalse);
      expect(decision.failureTimestamps, [DateTime.parse(second), t0]);
    });
  });
}
