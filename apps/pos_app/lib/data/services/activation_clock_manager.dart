import 'package:uuid/uuid.dart';

class ClockConfidence {
  static const String anchored = 'ANCHORED';
  static const String deviceValidated = 'DEVICE_VALIDATED';
  static const String degraded = 'DEGRADED';
}

class ClockResolution {
  final String deviceOccurredAt;
  final String? anchoredOccurredAt;
  final String clockConfidence;
  final String? serverTimeAnchorId;
  final String bootSessionId;

  const ClockResolution({
    required this.deviceOccurredAt,
    this.anchoredOccurredAt,
    required this.clockConfidence,
    this.serverTimeAnchorId,
    required this.bootSessionId,
  });

  String get canonicalOccurredAt =>
      (clockConfidence == ClockConfidence.anchored && anchoredOccurredAt != null)
          ? anchoredOccurredAt!
          : deviceOccurredAt;
}

class ActivationClockManager {
  static ActivationClockManager? _instance;
  static ActivationClockManager get instance => _instance ??= ActivationClockManager();

  final String bootSessionId;
  final Stopwatch _stopwatch;

  DateTime? _serverTimeAnchorAt;
  int? _anchorMonotonicTicks;
  String? _serverTimeAnchorId;
  String? _anchorBootSessionId;

  ActivationClockManager({
    String? initialBootSessionId,
    Stopwatch? stopwatch,
  })  : bootSessionId = initialBootSessionId ?? const Uuid().v4(),
        _stopwatch = stopwatch ?? (Stopwatch()..start());

  void setAnchor({
    required DateTime serverTimeAnchorAt,
    required int anchorMonotonicTicks,
    required String serverTimeAnchorId,
    required String bootSessionId,
  }) {
    _serverTimeAnchorAt = serverTimeAnchorAt.toUtc();
    _anchorMonotonicTicks = anchorMonotonicTicks;
    _serverTimeAnchorId = serverTimeAnchorId;
    _anchorBootSessionId = bootSessionId;
  }

  int get currentMonotonicMicroseconds => _stopwatch.elapsedMicroseconds;

  DateTime? get serverTimeAnchorAt => _serverTimeAnchorAt;
  String? get serverTimeAnchorId => _serverTimeAnchorId;

  ClockResolution resolveClockContext({
    DateTime? deviceWallClock,
    int? currentMonotonicTicks,
    String? currentBootSessionId,
    bool simulateSevereSkew = false,
  }) {
    final now = (deviceWallClock ?? DateTime.now()).toUtc();
    final nowIso = now.toIso8601String();
    final activeBootSession = currentBootSessionId ?? bootSessionId;
    final currentTicks = currentMonotonicTicks ?? _stopwatch.elapsedMicroseconds;

    // Check for severe clock skew flag or abnormal negative divergence
    if (simulateSevereSkew) {
      return ClockResolution(
        deviceOccurredAt: nowIso,
        anchoredOccurredAt: null,
        clockConfidence: ClockConfidence.degraded,
        serverTimeAnchorId: _serverTimeAnchorId,
        bootSessionId: activeBootSession,
      );
    }

    if (_serverTimeAnchorAt == null || _anchorMonotonicTicks == null) {
      return ClockResolution(
        deviceOccurredAt: nowIso,
        anchoredOccurredAt: null,
        clockConfidence: ClockConfidence.deviceValidated,
        serverTimeAnchorId: null,
        bootSessionId: activeBootSession,
      );
    }

    // Check if reboot occurred between anchor establishment and current time
    if (_anchorBootSessionId != null && _anchorBootSessionId != activeBootSession) {
      // Monotonic tick origin is invalid across reboot sessions; fall back to device wall clock
      final bool severeSkew = now.isBefore(_serverTimeAnchorAt!.subtract(const Duration(minutes: 5)));
      return ClockResolution(
        deviceOccurredAt: nowIso,
        anchoredOccurredAt: null,
        clockConfidence: severeSkew ? ClockConfidence.degraded : ClockConfidence.deviceValidated,
        serverTimeAnchorId: _serverTimeAnchorId,
        bootSessionId: activeBootSession,
      );
    }

    // Within same boot session: monotonic ticks are reliable
    final monotonicDelta = currentTicks - _anchorMonotonicTicks!;
    if (monotonicDelta < 0) {
      // Clock anomaly: monotonic clock ticked backwards
      return ClockResolution(
        deviceOccurredAt: nowIso,
        anchoredOccurredAt: null,
        clockConfidence: ClockConfidence.degraded,
        serverTimeAnchorId: _serverTimeAnchorId,
        bootSessionId: activeBootSession,
      );
    }

    final anchoredDate = _serverTimeAnchorAt!.add(Duration(microseconds: monotonicDelta)).toUtc();
    final anchoredIso = anchoredDate.toIso8601String();

    return ClockResolution(
      deviceOccurredAt: nowIso,
      anchoredOccurredAt: anchoredIso,
      clockConfidence: ClockConfidence.anchored,
      serverTimeAnchorId: _serverTimeAnchorId,
      bootSessionId: activeBootSession,
    );
  }
}
