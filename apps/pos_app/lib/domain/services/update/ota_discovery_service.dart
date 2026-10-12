import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../../models/update/release_manifest.dart';
import '../../ports/fiscal_safety_gate_port.dart';
import 'offer_suppression.dart';
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
    ReleaseOfferSuppressionStore? offerSuppressionStore,
  })  : _otaCoordinator = otaCoordinator,
        _connectivityChanges = connectivityChanges,
        _now = now ?? DateTime.now,
        _jitterRandom = jitterRandom ?? Random(),
        _offerSuppressionStore = offerSuppressionStore;

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

  /// Largest doubling exponent used before the cap takes over: a conservative
  /// upper bound on the doubling (for the current constants, ceil(60/10) = 6,
  /// i.e. 640 min, which the `raw > backoffCap` comparison then reduces to the
  /// cap). Far below the overflow territory documented in
  /// [_registerTransientFailure]; any exponent at or above the first doubling
  /// that exceeds [backoffCap] is equivalent to the cap anyway. This clamp is
  /// an overflow guard, not tuning.
  static final int _maxBackoffExponent =
      (backoffCap.inMilliseconds / backoffBase.inMilliseconds).ceil();

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
  final ReleaseOfferSuppressionStore? _offerSuppressionStore;

  Timer? _timer;
  StreamSubscription<bool>? _connectivitySubscription;
  bool _started = false;
  bool _checkInFlight = false;
  int _consecutiveTransientFailures = 0;
  DateTime? _backoffUntil;

  OtaSilentOffer? _lastOffer;

  /// Highest release `versionCode` surfaced this session or dismissed
  /// (T3, AC5). Loaded ONCE at `start()` from the store (persisted
  /// dismissals only — emission never persists, T3c) and kept in memory:
  /// the per-tick decision below is synchronous and performs no persistence
  /// reads. Keyed by the int `versionCode` (V11), never the display string.
  int? _highestSuppressedVersionCode;

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
  ///
  /// The suppression record (T3, AC5) is loaded ONCE here, before the first
  /// check is scheduled, so [_handleOutcome] stays synchronous and no tick
  /// ever performs a persistence read.
  Future<void> start() async {
    if (_started) return;
    _started = true;

    // T3/AC5: load the highest suppressed versionCode once. Fail OPEN on a
    // read failure: re-offering a known release is a cosmetic repeat, while
    // hiding a NEW release is the real harm.
    final store = _offerSuppressionStore;
    if (store != null) {
      try {
        _highestSuppressedVersionCode =
            await store.readHighestSuppressedVersionCode();
      } catch (e, stackTrace) {
        debugPrint(
          '[OtaDiscoveryService] failed to load offer suppression '
          '(failing open, nothing suppressed): $e\n$stackTrace',
        );
      }
    }

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
      case OtaDiscoveryOffered(
          :final manifest,
          :final fiscalVerdict,
          :final installedVersionCode,
        ):
        // T3/AC5: a versionCode the operator DISMISSED must never be re-offered,
        // on a later tick or after a restart; a versionCode that was merely
        // surfaced is gated for the rest of THIS process only (T3c).
        // This gate covers ONLY the silent offer surface below — it must NEVER
        // affect OtaUpdateCoordinator.checkForUpdate() or the interactive state
        // machine: an operator who explicitly presses "Check for update"
        // must hear the terminal's REAL state, not a filtered one.
        if (_highestSuppressedVersionCode != null &&
            manifest.versionCode <= _highestSuppressedVersionCode!) {
          // Suppressed, but the check still completed against the backend:
          // register success so the healthy period and backoff streak behave
          // exactly as they did before (suppression is not a failure).
          _registerSuccess(at);
          return;
        }
        _lastOffer = OtaSilentOffer(
          manifest: manifest,
          fiscalVerdict: fiscalVerdict,
          // The outcome carries the version the terminal is ACTUALLY running
          // (parsed from PackageInfo.buildNumber in the same discovery pass),
          // not the offered version. T3 (offer suppression) and the rollout
          // gate recorded as DEC-7 (odd/tasks/go-live-decisions.md) both key
          // on the installed version, and Android has no rollback (fact F8):
          // an `installedVersionCode` that returned the offered value would
          // produce a wrong promotion decision with no way back.
          installedVersionCode: installedVersionCode,
          observedAt: at,
        );
        _registerSuccess(at);
        // Record the surfaced versionCode IN MEMORY ONLY (T3c). Surfacing is
        // not dismissing (odd/tasks/ota-automatic-discovery.md AC5: only a
        // DISMISSED versionCode stops being re-offered): the in-memory gate
        // keeps the same release from re-offering on later ticks of this
        // session, but persistence happens exclusively through
        // [suppressOffer], the explicit dismissal path — so an offer nobody
        // touched re-surfaces after a restart, while a dismissed one does
        // not.
        _highestSuppressedVersionCode =
            max(_highestSuppressedVersionCode ?? 0, manifest.versionCode);
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

  /// Records [versionCode] as explicitly DISMISSED (T3, AC5). Since T3c this
  /// is the ONLY path that persists suppression — emission no longer does —
  /// so calling this is what makes a version stay silent across restarts.
  /// Deliberately UI-free here.
  ///
  /// Updates the in-memory gate synchronously and persists fire-and-forget:
  /// a persistence failure is logged as a FAILED DISMISSAL (the operator
  /// asked for silence and did not get it — this version will re-surface
  /// after a restart) and never throws into the UI path.
  Future<void> suppressOffer(int versionCode) async {
    _highestSuppressedVersionCode =
        max(_highestSuppressedVersionCode ?? 0, versionCode);
    await _persistSuppression(versionCode);
  }

  Future<void> _persistSuppression(int versionCode) async {
    final store = _offerSuppressionStore;
    if (store == null) return;
    try {
      await store.recordSuppressedVersionCode(versionCode);
    } catch (e, stackTrace) {
      // T3c: this is now always an EXPLICIT dismissal write. A failure here
      // is not cosmetic — the operator asked for silence and will not get
      // it after a restart. Log it as a failed dismissal with enough
      // context to act on; no retry queue, no UI reporting (out of scope).
      debugPrint(
        '[OtaDiscoveryService] FAILED DISMISSAL: could not persist '
        'suppression for versionCode $versionCode; the operator asked for '
        'silence and this version WILL re-offer after a restart. Re-run '
        '"No avisarme de esta versión" after storage recovers. '
        'Error: $e\n$stackTrace',
      );
    }
  }

  void _registerSuccess(DateTime at) {
    _consecutiveTransientFailures = 0;
    _backoffUntil = null;
    _lastSuccessfulCheckAt = at;
  }

  void _registerTransientFailure(DateTime at) {
    _consecutiveTransientFailures += 1;
    // The doubling exponent MUST be clamped before multiplying.
    // `backoffBase * (1 << exponent)` overflows the 64-bit Duration
    // microseconds at exponent 34 (10 min x 2^34 needs ~1.03e19 us > 2^63):
    // reachable in ~30 hours offline, and normal for a counter terminal
    // through a night outage plus a weekend. The overflowing product wraps
    // NEGATIVE, `raw > backoffCap` is then false, and — worse — the negative
    // window makes `DateTime.add` throw a RangeError, so the intended
    // backoff would silently become per-tick polling against the
    // UNAUTHENTICATED `/v1/releases/latest` endpoint (fact V3): the exact
    // load the backoff exists to control. Do not "simplify" this back to a
    // bare shift. Any exponent at or above the point where doubling already
    // exceeds [backoffCap] is equivalent to the cap, so clamp there and keep
    // the window inside [backoffBase, backoffCap] for every failure count,
    // including 1 and 10000.
    final exponent = min(
      _consecutiveTransientFailures - 1,
      _maxBackoffExponent,
    );
    final raw = backoffBase * (1 << exponent);
    final capped = raw > backoffCap ? backoffCap : raw;
    final jitterFactor =
        1 + (_jitterRandom.nextDouble() * 2 - 1) * jitterFraction;
    _backoffUntil = at.add(capped * jitterFactor);
  }
}
