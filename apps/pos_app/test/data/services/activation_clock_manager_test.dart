import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';

void main() {
  group('ONB1.8F — Clock Semantics & Monotonic Anchor (ActivationClockManager)', () {
    const fixedBootSessionId = 'boot-session-uuid-1234';
    final serverAnchorTime = DateTime.parse('2026-09-04T12:00:00.000Z');
    const serverAnchorId = 'srv-anchor-001';

    test('calculates anchoredOccurredAt with ANCHORED confidence when anchor is set and in same boot session', () {
      final clockManager = ActivationClockManager(
        initialBootSessionId: fixedBootSessionId,
      );

      // Establish anchor: Server time 12:00:00, anchor monotonic ticks at 1,000,000 micros
      clockManager.setAnchor(
        serverTimeAnchorAt: serverAnchorTime,
        anchorMonotonicTicks: 1000000,
        serverTimeAnchorId: serverAnchorId,
        bootSessionId: fixedBootSessionId,
      );

      // 5.5 seconds (5,500,000 micros) later according to monotonic clock:
      // Current monotonic ticks: 6,500,000 micros
      // Device wall clock might have drifted or changed to anything (e.g. 12:01:00)
      final deviceWallClock = DateTime.parse('2026-09-04T12:01:00.000Z');
      final resolution = clockManager.resolveClockContext(
        deviceWallClock: deviceWallClock,
        currentMonotonicTicks: 6500000,
        currentBootSessionId: fixedBootSessionId,
      );

      expect(resolution.clockConfidence, equals(ClockConfidence.anchored));
      expect(resolution.serverTimeAnchorId, equals(serverAnchorId));
      expect(resolution.bootSessionId, equals(fixedBootSessionId));
      expect(resolution.deviceOccurredAt, equals('2026-09-04T12:01:00.000Z'));
      
      // Monotonic delta: 6,500,000 - 1,000,000 = 5,500,000 micros = 5.5 seconds
      // Anchored time: 12:00:00.000 + 5.5s = 12:00:05.500Z
      expect(resolution.anchoredOccurredAt, equals('2026-09-04T12:00:05.500Z'));
      expect(resolution.canonicalOccurredAt, equals('2026-09-04T12:00:05.500Z'));
    });

    test('degrades or falls back to DEVICE_VALIDATED when reboot occurred and bootSessionId differs', () {
      final clockManager = ActivationClockManager(
        initialBootSessionId: 'new-boot-session-after-reboot',
      );

      // Anchor was recorded in a previous boot session
      clockManager.setAnchor(
        serverTimeAnchorAt: serverAnchorTime,
        anchorMonotonicTicks: 1000000,
        serverTimeAnchorId: serverAnchorId,
        bootSessionId: 'old-boot-session-prior-crash',
      );

      // Current boot session differs: cannot safely add monotonic ticks
      final deviceWallClock = DateTime.parse('2026-09-04T12:05:00.000Z');
      final resolution = clockManager.resolveClockContext(
        deviceWallClock: deviceWallClock,
        currentMonotonicTicks: 200000,
        currentBootSessionId: 'new-boot-session-after-reboot',
      );

      // Plausible wall clock (after server anchor time), but anchor invalidated by reboot
      expect(resolution.clockConfidence, equals(ClockConfidence.deviceValidated));
      expect(resolution.anchoredOccurredAt, isNull);
      expect(resolution.canonicalOccurredAt, equals('2026-09-04T12:05:00.000Z'));
      expect(resolution.deviceOccurredAt, equals('2026-09-04T12:05:00.000Z'));
    });

    test('marks clock confidence as DEGRADED when wall clock jumped backwards before anchor time', () {
      final clockManager = ActivationClockManager(
        initialBootSessionId: fixedBootSessionId,
      );

      clockManager.setAnchor(
        serverTimeAnchorAt: serverAnchorTime,
        anchorMonotonicTicks: 1000000,
        serverTimeAnchorId: serverAnchorId,
        bootSessionId: fixedBootSessionId,
      );

      // Severe clock skew: wall clock is set to year 2020 (before anchor time 2026)
      final skewWallClock = DateTime.parse('2020-01-01T00:00:00.000Z');
      
      // Even if monotonic progression was valid, abnormal skew flag or backwards jump
      final resolution = clockManager.resolveClockContext(
        deviceWallClock: skewWallClock,
        currentMonotonicTicks: 2000000,
        currentBootSessionId: fixedBootSessionId,
        simulateSevereSkew: true,
      );

      expect(resolution.clockConfidence, equals(ClockConfidence.degraded));
      expect(resolution.canonicalOccurredAt, equals('2020-01-01T00:00:00.000Z'));
    });

    test('marks clock confidence as DEGRADED when monotonic ticks go backwards (clock anomaly)', () {
      final clockManager = ActivationClockManager(
        initialBootSessionId: fixedBootSessionId,
      );

      clockManager.setAnchor(
        serverTimeAnchorAt: serverAnchorTime,
        anchorMonotonicTicks: 5000000,
        serverTimeAnchorId: serverAnchorId,
        bootSessionId: fixedBootSessionId,
      );

      // Monotonic ticks went backwards (5,000,000 -> 4,000,000)
      final deviceWallClock = DateTime.parse('2026-09-04T12:02:00.000Z');
      final resolution = clockManager.resolveClockContext(
        deviceWallClock: deviceWallClock,
        currentMonotonicTicks: 4000000,
        currentBootSessionId: fixedBootSessionId,
      );

      expect(resolution.clockConfidence, equals(ClockConfidence.degraded));
    });

    test('resolves to DEVICE_VALIDATED when no server anchor was ever registered', () {
      final clockManager = ActivationClockManager();

      final deviceWallClock = DateTime.parse('2026-09-04T12:10:00.000Z');
      final resolution = clockManager.resolveClockContext(
        deviceWallClock: deviceWallClock,
      );

      expect(resolution.clockConfidence, equals(ClockConfidence.deviceValidated));
      expect(resolution.anchoredOccurredAt, isNull);
      expect(resolution.serverTimeAnchorId, isNull);
      expect(resolution.canonicalOccurredAt, equals('2026-09-04T12:10:00.000Z'));
    });
  });
}
