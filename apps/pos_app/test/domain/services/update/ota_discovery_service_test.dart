import 'dart:async';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/services/update/ota_discovery_service.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';

/// T2 (OTA automatic discovery) — scheduler behavior of the silent discovery
/// service. All timers run on the [testWidgets] fake-async zone
/// (`tester.pump`); all I/O goes through a mocked coordinator, so no real
/// timer and no real network ever runs.
class _MockOtaCoordinator extends Mock implements OtaUpdateCoordinator {}

/// Test-controlled clock: the fake-async zone fakes timers but not
/// `DateTime.now()`, so the service takes an injectable `now` and the test
/// advances it in lock step with `tester.pump`.
class _FakeClock {
  DateTime _value = DateTime.utc(2026, 1, 1);
  DateTime get now => _value;
  void advance(Duration d) => _value = _value.add(d);
}

ReleaseManifest _manifest({int versionCode = 2002}) => ReleaseManifest(
      channel: 'pilot',
      abi: TargetAbi.arm64v8a,
      versionCode: versionCode,
      versionName: '1.0.2',
      sha256: 'c' * 64,
      sizeBytes: 32000000,
      downloadUrl: Uri.parse('https://r2.test/app.apk'),
      minFromVersionCode: 2001,
      mandatory: false,
      publishedAt: DateTime.utc(2026),
    );

void main() {
  late _MockOtaCoordinator coordinator;

  setUp(() {
    coordinator = _MockOtaCoordinator();
    when(() => coordinator.discoverSilently())
        .thenAnswer((_) async => const OtaDiscoveryUpToDate(2001));
  });

  /// Builds the service with a test-controlled clock and seeded jitter, so
  /// backoff windows are deterministic within the documented jitter band.
  (OtaDiscoveryService, _FakeClock) buildService({
    Stream<bool>? connectivityChanges,
  }) {
    final clock = _FakeClock();
    final service = OtaDiscoveryService(
      otaCoordinator: coordinator,
      connectivityChanges: connectivityChanges,
      now: () => clock.now,
      jitterRandom: Random(7),
    );
    return (service, clock);
  }

  group('OtaDiscoveryService — scheduling shape (AC2)', () {
    testWidgets('start() performs exactly one discovery check at process '
        'start (AC1)', (tester) async {
      final (service, _) = buildService();
      service.start();
      await tester.pump();

      verify(() => coordinator.discoverSilently()).called(1);
      verifyNever(() => coordinator.checkForUpdate());
      service.dispose();
    });

    test('the named period is slower than the 5-minute sync cadence', () {
      expect(
        OtaDiscoveryService.checkPeriod,
        greaterThan(const Duration(minutes: 5)),
        reason: 'discovery is not urgent; the sync cadence stays the '
            'fastest periodic network task',
      );
    });

    testWidgets('repeats on the periodic period', (tester) async {
      final (service, _) = buildService();
      service.start();
      await tester.pump();
      verify(() => coordinator.discoverSilently()).called(1);

      await tester.pump(OtaDiscoveryService.checkPeriod);
      verify(() => coordinator.discoverSilently()).called(1);

      await tester.pump(OtaDiscoveryService.checkPeriod);
      verify(() => coordinator.discoverSilently()).called(1);
      service.dispose();
    });

    testWidgets('one immediate check on connectivity reconnect',
        (tester) async {
      final reconnects = StreamController<bool>();
      final (service, _) = buildService(connectivityChanges: reconnects.stream);
      addTearDown(reconnects.close);
      service.start();
      await tester.pump();
      verify(() => coordinator.discoverSilently()).called(1);

      reconnects.add(true);
      await tester.pump();
      // Going online triggers one more immediate silent check.
      verify(() => coordinator.discoverSilently()).called(1);

      reconnects.add(false);
      await tester.pump();
      // Going offline must NOT trigger a check.
      verifyNever(() => coordinator.discoverSilently());
      service.dispose();
    });

    testWidgets('stop() cancels the periodic timer', (tester) async {
      final (service, _) = buildService();
      service.start();
      await tester.pump();
      service.stop();

      await tester.pump(OtaDiscoveryService.checkPeriod * 3);
      // Only the start() check ever ran.
      verify(() => coordinator.discoverSilently()).called(1);
    });
  });

  group('OtaDiscoveryService — silent outcomes (AC4, V4)', () {
    testWidgets('a 204 ("up to date") is a successful check, never an error',
        (tester) async {
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryUpToDate(2001));
      final (service, clock) = buildService();
      service.start();
      await tester.pump();

      expect(service.lastSuccessfulCheckAt, clock.now);
      expect(service.lastOffer, isNull);
      expect(service.consecutiveTransientFailures, 0);
      verifyNever(() => coordinator.checkForUpdate());
      service.dispose();
    });

    testWidgets('an offered update lands on the silent offer surface, not '
        'the screen', (tester) async {
      when(() => coordinator.discoverSilently()).thenAnswer(
        (_) async => OtaDiscoveryOffered(
          manifest: _manifest(versionCode: 2002),
          fiscalVerdict: const FiscalGateClear(),
        ),
      );
      final (service, clock) = buildService();
      service.start();
      await tester.pump();

      final offer = service.lastOffer;
      expect(offer, isNotNull);
      expect(offer!.manifest.versionCode, 2002);
      expect(offer.observedAt, clock.now);
      expect(service.lastSuccessfulCheckAt, clock.now);
      verifyNever(() => coordinator.checkForUpdate());
      service.dispose();
    });

    testWidgets('a transient failure is silent and starts the backoff window',
        (tester) async {
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryNetworkError('boom'));
      final (service, clock) = buildService();
      service.start();
      await tester.pump();

      expect(service.lastOffer, isNull);
      expect(service.consecutiveTransientFailures, 1);
      final backoff = service.backoffUntil!.difference(clock.now);
      expect(
        backoff,
        allOf(
          greaterThan(Duration.zero),
          lessThanOrEqualTo(OtaDiscoveryService.backoffBase *
              (1 + OtaDiscoveryService.jitterFraction)),
        ),
      );
      verifyNever(() => coordinator.checkForUpdate());
      service.dispose();
    });

    testWidgets(
        'backoff suppresses ticks and reconnect checks until the window '
        'elapses, and never exceeds the cap (bounded recovery)',
        (tester) async {
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryNetworkError('boom'));
      final reconnects = StreamController<bool>();
      final (service, clock) =
          buildService(connectivityChanges: reconnects.stream);
      addTearDown(reconnects.close);
      service.start();
      await tester.pump();
      expect(service.consecutiveTransientFailures, 1);

      // Reconnect while backed off: suppressed (fleet load control, V3).
      reconnects.add(true);
      await tester.pump();
      verify(() => coordinator.discoverSilently()).called(1);

      // Drive consecutive failures until the backoff exceeds one period.
      while (service.backoffUntil!.difference(clock.now) <=
          OtaDiscoveryService.checkPeriod) {
        clock.advance(OtaDiscoveryService.checkPeriod);
        await tester.pump(OtaDiscoveryService.checkPeriod);
        reconnects.add(true);
        await tester.pump();
      }
      final worstBackoff = service.backoffUntil!.difference(clock.now);
      expect(
        worstBackoff,
        lessThanOrEqualTo(OtaDiscoveryService.backoffCap *
            (1 + OtaDiscoveryService.jitterFraction)),
        reason: 'the cap bounds how long a terminal stays silent',
      );

      // A periodic tick inside the backoff window is skipped...
      clock.advance(OtaDiscoveryService.checkPeriod);
      await tester.pump(OtaDiscoveryService.checkPeriod);
      final failuresAfterSkippedTick = service.consecutiveTransientFailures;

      // ...and once the window has elapsed, checks resume.
      clock.advance(OtaDiscoveryService.backoffCap);
      await tester.pump(OtaDiscoveryService.backoffCap);
      reconnects.add(true);
      await tester.pump();
      expect(service.consecutiveTransientFailures,
          greaterThan(failuresAfterSkippedTick));
      service.dispose();
    });

    testWidgets('a success resets the backoff', (tester) async {
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryNetworkError('boom'));
      final (service, clock) = buildService();
      service.start();
      await tester.pump();
      expect(service.consecutiveTransientFailures, 1);

      // Past the first backoff window (base * jitter <= 12 min < 20 min):
      // the next check succeeds and resets everything.
      clock.advance(OtaDiscoveryService.backoffBase * 2);
      await tester.pump(OtaDiscoveryService.backoffBase * 2);
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryUpToDate(2001));
      await tester.pump(OtaDiscoveryService.checkPeriod);

      expect(service.consecutiveTransientFailures, 0);
      expect(service.backoffUntil, isNull);
      service.dispose();
    });

    testWidgets('never overlaps two discovery passes', (tester) async {
      final pending = Completer<void>();
      var calls = 0;
      when(() => coordinator.discoverSilently()).thenAnswer((_) async {
        calls++;
        await pending.future;
        return const OtaDiscoveryUpToDate(2001);
      });
      final (service, _) = buildService();
      service.start();
      await tester.pump();
      expect(calls, 1);

      // Reconnect + periodic tick while the first pass is still in flight.
      await tester.pump(OtaDiscoveryService.checkPeriod);
      expect(calls, 1, reason: 'a pass must never run concurrently');

      pending.complete();
      await tester.pump();
      expect(calls, 1);
      service.dispose();
    });
  });
}
