import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../../models/update/release_manifest.dart';
import '../../ports/fiscal_safety_gate_port.dart';
import 'ota_update_coordinator.dart';

/// One update offer observed by SILENT discovery (T2, Batch 5a).
///
/// This is a separate surface from [OtaUpdateState] by design (AC3): a
/// background tick must never push the interactive coordinator out of an
/// in-flight download or flash an error on the terminal-identity screen.
/// T3 (offer suppression) and the UI that renders offers will consume this.
class OtaSilentOffer {
  const OtaSilentOffer({
    required this.manifest,
    required this.fiscalVerdict,
    required this.installedVersionCode,
    required this.observedAt,
  });

  final ReleaseManifest manifest;
  final FiscalSafetyVerdict fiscalVerdict;
  final int installedVersionCode;
  final DateTime observedAt;

  /// Mirrors `OtaUpdateAvailable.canInstallNow` so the offer surface can be
  /// rendered without re-evaluating the fiscal gate (Rule R7).
  bool get canInstallNow => fiscalVerdict is FiscalGateClear;
}

/// Silent OTA discovery loop (T2 of odd/tasks/ota-automatic-discovery.md).
///
/// Design boundary: this service is a CALLER of
/// [OtaUpdateCoordinator.discoverSilently], not a second discovery mechanism.
/// It owns only scheduling (SyncService's shape), failure backoff, and the
/// silent [OtaSilentOffer] surface; all discovery I/O (channel, abi,
/// currentVersionCode, `GET /v1/releases/latest`, 204 handling) stays in the
/// coordinator, and no path here ever mutates `OtaUpdateState` (AC3) or
/// surfaces an operator-visible error (AC4).
///
/// Scheduling shape copied from `SyncService` (V2): `start()` arms a
/// `Timer.periodic` and subscribes to connectivity transitions, `stop()`
/// cancels both, `dispose()` releases everything. The linked gate lives at
/// the call site (`main.dart`): an unlinked terminal never starts this
/// service, mirroring `syncService.start()` next to it.
class OtaDiscoveryService extends ChangeNotifier {
  OtaDiscoveryService({
    required OtaUpdateCoordinator otaCoordinator,
    Stream<bool>? connectivityChanges,
    DateTime Function()? now,
    Random? jitterRandom,
  })  : _otaCoordinator = otaCoordinator,
        _connectivityChanges = connectivityChanges,
        _now = now ?? DateTime.now,
        _jitterRandom = jitterRandom ?? Random();

  /// Healthy-cadence discovery period.
  ///
  /// Deliberately slower than `SyncService`'s 5-minute sync period
  /// (sync_service.dart:292): discovery is not urgent — a stale terminal
  /// costs nothing until the operator next acts — while fleet-wide polling
  /// hits the UNAUTHENTICATED `/v1/releases/latest` endpoint (fact V3), so
  /// terminal-side load must stay an order of magnitude under the sync
  /// cadence. 30 minutes = at most 48 checks/day/terminal.
  static const Duration checkPeriod = Duration(minutes: 30);

  /// Backoff base after a transient failure (offline, 5xx, malformed offer).
  /// Doubles per consecutive failure: 10, 20, 40 minutes, then capped.
  static const Duration backoffBase = Duration(minutes: 10);

  /// Backoff cap: after enough consecutive failures a terminal is never
  /// silent for more than ~72 minutes (cap x max jitter) between attempts,
  /// and any successful check resets to the healthy 30-minute cadence. This
  /// is the bounded-recovery guarantee for AC4.
  static const Duration backoffCap = Duration(minutes: 60);

  /// Uniform jitter fraction applied to every backoff window (0.8x–1.2x).
  /// Jitter decorrelates a fleet that just came back online (e.g. after a
  /// site-wide power cut) so they do not stampede the unauthenticated
  /// endpoint on the same second. Load control, not politeness (V3).
  static const double jitterFraction = 0.2;

  final OtaUpdateCoordinator _otaCoordinator;
  final Stream<bool>? _connectivityChanges;
  final DateTime Function() _now;
  final Random _jitterRandom;

  Timer? _timer;
  StreamSubscription<bool>? _connectivitySubscription;
  bool _started = false;
  bool _checkInFlight = false;
  int _consecutiveTransientFailures = 0;
  DateTime? _backoffUntil;

  OtaSilentOffer? _lastOffer;

  /// Last offer observed by silent discovery, or `null` while none is
  /// pending. Separate from `OtaUpdateState` (AC3); suppression across
  /// ticks/restarts is T3's concern, not this service's.
  OtaSilentOffer? get lastOffer => _lastOffer;

  DateTime? _lastSuccessfulCheckAt;

  /// Last time a discovery pass got a definitive backend answer (204 or a
  /// well-formed manifest), regardless of whether an offer resulted.
  DateTime? get lastSuccessfulCheckAt => _lastSuccessfulCheckAt;

  /// Consecutive transient failures (backoff input). Exposed for tests and
  /// for T4-style diagnostics; it is never operator-visible (AC4).
  @visibleForTesting
  int get consecutiveTransientFailures => _consecutiveTransientFailures;

  /// Until when checks are suppressed by backoff. Exposed for tests.
  @visibleForTesting
  DateTime? get backoffUntil => _backoffUntil;

  /// Arms the periodic timer and the reconnect listener, then performs the
  /// one immediate check required at process start (AC1). "App start" means
  /// process start: there is no boot receiver and no background-execution
  /// guarantee, so a reboot nobody follows by opening the POS produces no
  /// check — a documented limitation of the batch, not a delivery promise.
  void start() {
    if (_started) return;
    _started = true;

    // Mirror of SyncService.start(): immediate pass on connectivity recovery.
    _connectivitySubscription?.cancel();
    _connectivitySubscription = _connectivityChanges?.listen((isOnline) {
      if (isOnline) {
        _triggerCheck();
      }
    });

    _timer?.cancel();
    _timer = Timer.periodic(checkPeriod, (_) => _triggerCheck());

    // AC1: the first check of the session is never suppressed by backoff —
    // a fresh process must learn its staleness even if the previous session
    // ended in a failure streak.
    _triggerCheck(bypassBackoff: true);
  }

  /// Cancels the timer and the connectivity subscription (SyncService shape).
  void stop() {
    _timer?.cancel();
    _timer = null;
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    _started = false;
  }

  /// Stops the loop and releases this notifier. The app owns this for the
  /// whole session, so in production nothing calls it; tests do.
  @override
  void dispose() {
    stop();
    super.dispose();
  }

  void _triggerCheck({bool bypassBackoff = false}) {
    if (!_started || _checkInFlight) return;
    if (!bypassBackoff &&
        _backoffUntil != null &&
        _now().isBefore(_backoffUntil!)) {
      // AC4: still inside the backoff window — stay silent, do not hammer
      // the unauthenticated endpoint.
      return;
    }
    _runSilentPass();
  }

  Future<void> _runSilentPass() async {
    _checkInFlight = true;
    final startedAt = _now();
    try {
      // discoverSilently returns outcomes as values and never throws for
      // expected conditions; the catch is a defensive net only.
      final outcome = await _otaCoordinator.discoverSilently();
      _handleOutcome(outcome, startedAt);
    } catch (e, stackTrace) {
      // Treat an unexpected throw exactly like a transient network failure:
      // silent (AC4) and backed off.
      _registerTransientFailure(startedAt);
      debugPrint(
        '[OtaDiscoveryService] silent discovery pass threw: '
        '$e\n$stackTrace',
      );
    } finally {
      _checkInFlight = false;
    }
  }

  void _handleOutcome(OtaDiscoveryOutcome outcome, DateTime at) {
    switch (outcome) {
      case OtaDiscoveryOffered(:final manifest, :final fiscalVerdict):
        _lastOffer = OtaSilentOffer(
          manifest: manifest,
          fiscalVerdict: fiscalVerdict,
          installedVersionCode: manifest.versionCode,
          observedAt: at,
        );
        _registerSuccess(at);
        // Only the OFFER is observable state on this surface; failures stay
        // silent, so notification happens only here.
        notifyListeners();
      case OtaDiscoveryUpToDate():
      case OtaDiscoveryRejected():
        // A well-formed-but-not-applicable offer is a completed check (the
        // registry made a mistake, not the terminal); it is not transient
        // and not worth backing off over.
        _registerSuccess(at);
      case OtaDiscoveryNetworkError():
      case OtaDiscoveryInvalidOffer():
        // Transient per AC4: offline, 5xx, or a malformed offer.
        _registerTransientFailure(at);
      case OtaDiscoveryUnconfigured():
      case OtaDiscoveryUnknownAbi():
      case OtaDiscoveryPackageInfoError():
      case OtaDiscoveryInvalidInstalledVersion():
        // Persistent local conditions; no network request was made (or none
        // is useful). Polling on is cheap and silent; neither a success nor
        // a load-control failure.
        break;
    }
  }

  void _registerSuccess(DateTime at) {
    _consecutiveTransientFailures = 0;
    _backoffUntil = null;
    _lastSuccessfulCheckAt = at;
  }

  void _registerTransientFailure(DateTime at) {
    _consecutiveTransientFailures += 1;
    final exponent = _consecutiveTransientFailures - 1;
    final raw = backoffBase * (1 << exponent);
    final capped = raw > backoffCap ? backoffCap : raw;
    final jitterFactor =
        1 + (_jitterRandom.nextDouble() * 2 - 1) * jitterFraction;
    _backoffUntil = at.add(capped * jitterFactor);
  }
}
