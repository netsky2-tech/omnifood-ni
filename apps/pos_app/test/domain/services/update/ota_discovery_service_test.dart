import 'dart:async';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/services/update/offer_suppression.dart';
import 'package:pos_app/domain/services/update/ota_discovery_service.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';

/// T2 (OTA automatic discovery) — scheduler behavior of the silent discovery
/// service. All timers run on the [testWidgets] fake-async zone
/// (`tester.pump`); all I/O goes through a mocked coordinator, so no real
/// timer and no real network ever runs.
class _MockOtaCoordinator extends Mock implements OtaUpdateCoordinator {}

/// In-memory [ReleaseOfferSuppressionStore] fake: shared between service
/// instances to simulate a process restart over the same persisted state,
/// and injectable failures for the fail-open / fail-safe tests.
class _FakeSuppressionStore implements ReleaseOfferSuppressionStore {
  _FakeSuppressionStore({this.seed, this.throwOnRead = false});

  int? seed;
  bool throwOnRead;
  bool throwOnRecord = false;
  int recordCalls = 0;

  @override
  Future<int?> readHighestSuppressedVersionCode() async {
    if (throwOnRead) throw Exception('Disk read IO failure');
    return seed;
  }

  @override
  Future<void> recordSuppressedVersionCode(int versionCode) async {
    recordCalls++;
    if (throwOnRecord) throw Exception('Disk full');
    seed = versionCode;
  }
}

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
    ReleaseOfferSuppressionStore? offerSuppressionStore,
  }) {
    final clock = _FakeClock();
    final service = OtaDiscoveryService(
      otaCoordinator: coordinator,
      connectivityChanges: connectivityChanges,
      offerSuppressionStore: offerSuppressionStore,
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

  group('OtaDiscoveryService — silent offer suppression (T3, AC5)', () {
    void stubOffered(int versionCode, {int installed = 2001}) {
      when(() => coordinator.discoverSilently()).thenAnswer(
        (_) async => OtaDiscoveryOffered(
          manifest: _manifest(versionCode: versionCode),
          fiscalVerdict: const FiscalGateClear(),
          installedVersionCode: installed,
        ),
      );
    }

    testWidgets('emitting an offer does not write the suppression store '
        '(first pass still emits and notifies, T3c)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, _) = buildService(offerSuppressionStore: store);
      var notifications = 0;
      service.addListener(() => notifications++);

      await service.start();
      await tester.pump();

      expect(service.lastOffer, isNotNull);
      expect(service.lastOffer!.manifest.versionCode, 2002);
      expect(notifications, 1);
      // Surfacing is NOT dismissing (AC5 wording): nothing may be persisted
      // on the emission path. Only suppressOffer() writes the store.
      expect(store.recordCalls, 0);
      expect(store.seed, isNull);
      // A suppressed-or-not offer is still a completed check.
      expect(service.consecutiveTransientFailures, 0);
      service.dispose();
    });

    testWidgets('a second pass with the SAME versionCode does not re-emit '
        'but still registers success (AC5 across ticks)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, clock) = buildService(offerSuppressionStore: store);
      var notifications = 0;
      service.addListener(() => notifications++);

      await service.start();
      await tester.pump();
      final firstOffer = service.lastOffer;
      final firstSuccessAt = service.lastSuccessfulCheckAt;
      expect(notifications, 1);

      // Next periodic tick: backend still offers 2002.
      clock.advance(OtaDiscoveryService.checkPeriod);
      await tester.pump(OtaDiscoveryService.checkPeriod);

      // No new offer, no notification — but the check completed.
      expect(identical(service.lastOffer, firstOffer), isTrue,
          reason: 'the offer surface must be untouched by a suppressed tick');
      expect(notifications, 1,
          reason: 'a suppressed offer must not notifyListeners');
      expect(service.lastSuccessfulCheckAt, isNot(firstSuccessAt),
          reason: 'a suppressed check is still a COMPLETED check: the '
              'healthy period and backoff streak must behave as before');
      expect(service.consecutiveTransientFailures, 0);
      service.dispose();
    });

    testWidgets('a STRICTLY GREATER versionCode re-offers (no boolean '
        'dismissed flag)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, clock) = buildService(offerSuppressionStore: store);
      var notifications = 0;
      service.addListener(() => notifications++);

      await service.start();
      await tester.pump();
      expect(notifications, 1);

      // The backend publishes a new release: 2008 > 2002 must surface even
      // though 2002 was already offered this session.
      stubOffered(2008);
      clock.advance(OtaDiscoveryService.checkPeriod);
      await tester.pump(OtaDiscoveryService.checkPeriod);

      expect(service.lastOffer, isNotNull);
      expect(service.lastOffer!.manifest.versionCode, 2008);
      expect(notifications, 2);
      // Emission never persists (T3c); only suppressOffer does.
      expect(store.seed, isNull);
      service.dispose();
    });

    testWidgets('after a restart an offer that was only surfaced is '
        're-emitted (T3c: surfacing is not dismissing)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, _) = buildService(offerSuppressionStore: store);
      service.addListener(() {});

      await service.start();
      await tester.pump();
      expect(service.lastOffer!.manifest.versionCode, 2002);
      service.dispose();

      // Fresh service instance over the SAME store state = process restart.
      // Nothing was dismissed, so the store is untouched and the offer must
      // come back (AC5 gates only DISMISSED versions across restarts).
      final (restarted, _) = buildService(offerSuppressionStore: store);
      var restartedNotifications = 0;
      restarted.addListener(() => restartedNotifications++);

      await restarted.start();
      await tester.pump();

      expect(restarted.lastOffer, isNotNull,
          reason: 'a merely surfaced offer was never dismissed: it must '
              're-surface after a restart');
      expect(restarted.lastOffer!.manifest.versionCode, 2002);
      expect(restartedNotifications, 1);
      expect(restarted.consecutiveTransientFailures, 0,
          reason: 'an emitted offer is still a COMPLETED check, never a '
              'transient failure');
      restarted.dispose();
    });

    testWidgets('after a restart an explicitly dismissed versionCode is not '
        're-emitted (AC5 across restarts via suppressOffer)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, _) = buildService(offerSuppressionStore: store);
      service.addListener(() {});

      await service.start();
      await tester.pump();
      expect(service.lastOffer!.manifest.versionCode, 2002);

      // The operator pressed "No avisarme de esta versión": the ONLY path
      // that persists suppression.
      await service.suppressOffer(2002);
      expect(store.seed, 2002);
      service.dispose();

      // Fresh service instance over the SAME store state = process restart.
      final (restarted, _) = buildService(offerSuppressionStore: store);
      var restartedNotifications = 0;
      restarted.addListener(() => restartedNotifications++);

      await restarted.start();
      await tester.pump();

      expect(restarted.lastOffer, isNull,
          reason: 'an explicitly dismissed version must not re-offer after a '
              'restart');
      expect(restartedNotifications, 0);
      expect(restarted.consecutiveTransientFailures, 0,
          reason: 'suppression must not look like a transient failure');
      restarted.dispose();
    });

    testWidgets('suppressOffer() still gates the rest of the same session '
        '(no re-offer on the next tick after a dismissal)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore();
      final (service, clock) = buildService(offerSuppressionStore: store);
      var notifications = 0;
      service.addListener(() => notifications++);

      await service.start();
      await tester.pump();
      expect(notifications, 1);
      final firstOffer = service.lastOffer;

      await service.suppressOffer(2002);

      clock.advance(OtaDiscoveryService.checkPeriod);
      await tester.pump(OtaDiscoveryService.checkPeriod);

      expect(identical(service.lastOffer, firstOffer), isTrue,
          reason: 'a dismissed offer must not re-emit on a later tick of the '
              'same session');
      expect(notifications, 1,
          reason: 'a suppressed offer must not notifyListeners');
      expect(service.consecutiveTransientFailures, 0);
      service.dispose();
    });

    testWidgets('a store READ failure at start degrades to nothing '
        'suppressed (fail open)', (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore(seed: 2002, throwOnRead: true);
      final (service, _) = buildService(offerSuppressionStore: store);

      await service.start();
      await tester.pump();

      // Re-offering a known release is a cosmetic repeat; hiding a NEW
      // release is the real harm. The service must not crash and must offer.
      expect(service.lastOffer, isNotNull);
      expect(service.lastOffer!.manifest.versionCode, 2002);
      service.dispose();
    });

    testWidgets('a store WRITE failure on an explicit dismissal does not '
        'break the silent pass and keeps in-session suppression',
        (tester) async {
      stubOffered(2002);
      final store = _FakeSuppressionStore()..throwOnRecord = true;
      final (service, clock) = buildService(offerSuppressionStore: store);
      var notifications = 0;
      service.addListener(() => notifications++);

      await service.start();
      await tester.pump();

      // The offer surfaced normally; emission wrote nothing (T3c), so the
      // broken store had no chance to interfere with the silent pass.
      expect(service.lastOffer, isNotNull);
      expect(notifications, 1);
      expect(store.recordCalls, 0);

      // Explicit dismissal: the write fails, but the in-memory gate still
      // suppresses the same version for the rest of the session and the
      // failure never throws out of suppressOffer.
      await service.suppressOffer(2002);
      expect(store.recordCalls, 1);

      clock.advance(OtaDiscoveryService.checkPeriod);
      await tester.pump(OtaDiscoveryService.checkPeriod);
      expect(notifications, 1);
      expect(service.consecutiveTransientFailures, 0);
      service.dispose();
    });

    test('suppressOffer() exposes the record API for the T3b dismiss '
        'action without any UI', () async {
      final store = _FakeSuppressionStore();
      final (service, _) = buildService(offerSuppressionStore: store);

      await service.suppressOffer(2009);

      expect(store.seed, 2009);
      service.dispose();
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
          installedVersionCode: 2001,
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

    testWidgets('the offer carries the terminal\'s INSTALLED version, not '
        'the offered one (T3 / DEC-7 input)', (tester) async {
      when(() => coordinator.discoverSilently()).thenAnswer(
        (_) async => OtaDiscoveryOffered(
          manifest: _manifest(versionCode: 2008),
          fiscalVerdict: const FiscalGateClear(),
          installedVersionCode: 2007,
        ),
      );
      final (service, _) = buildService();
      service.start();
      await tester.pump();

      final offer = service.lastOffer;
      expect(offer, isNotNull);
      // The terminal runs 2007; the backend offers 2008. The offer surface
      // must carry the INSTALLED versionCode — T3 suppression and the DEC-7
      // promotion gate both key on the version a terminal actually runs, and
      // Android has no rollback (F8).
      expect(offer!.installedVersionCode, 2007);
      expect(offer.manifest.versionCode, 2008);
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

    testWidgets(
        'backoff windows stay strictly positive and within the cap across a '
        '40-failure streak (exponent-overflow guard)', (tester) async {
      when(() => coordinator.discoverSilently())
          .thenAnswer((_) async => const OtaDiscoveryNetworkError('boom'));
      final (service, clock) = buildService();
      service.start();
      await tester.pump();

      // Single-failure case: the very first window must be inside
      // [> 0, cap * max jitter] already.
      expect(service.consecutiveTransientFailures, 1);
      var window = service.backoffUntil!.difference(clock.now);
      expect(window, greaterThan(Duration.zero));
      expect(
        window,
        lessThanOrEqualTo(OtaDiscoveryService.backoffCap *
            (1 + OtaDiscoveryService.jitterFraction)),
      );

      // Long streak: ~34 consecutive transient failures are reachable in
      // ~30 hours offline, and normal for a counter terminal through a night
      // outage plus a weekend. Drive 39 more failures; every scheduled window
      // must remain strictly in the future and under the cap.
      for (var expected = 2; expected <= 40; expected++) {
        var guard = 0;
        while (service.consecutiveTransientFailures < expected && guard < 10) {
          clock.advance(OtaDiscoveryService.checkPeriod);
          await tester.pump(OtaDiscoveryService.checkPeriod);
          guard++;
        }
        expect(service.consecutiveTransientFailures, expected,
            reason: 'transient failure #$expected must have been registered');
        window = service.backoffUntil!.difference(clock.now);
        expect(window, greaterThan(Duration.zero),
            reason: 'failure #$expected: a non-positive backoff window lands '
                'in the past and silently disables load control against the '
                'unauthenticated endpoint (V3)');
        expect(
          window,
          lessThanOrEqualTo(OtaDiscoveryService.backoffCap *
              (1 + OtaDiscoveryService.jitterFraction)),
          reason: 'failure #$expected: the cap bounds the silent window',
        );
      }
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
