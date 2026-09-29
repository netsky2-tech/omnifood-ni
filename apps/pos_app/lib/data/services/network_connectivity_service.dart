import 'dart:async';
import 'dart:developer' as developer;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';

enum NetworkStatus {
  online,
  offline,
}

/// Factory that produces the native link-layer connectivity stream.
///
/// Injectable test seam: unit tests supply a fake stream so they never touch
/// platform channels. The default uses the real [Connectivity] plugin.
typedef ConnectivityStreamFactory = Stream<List<ConnectivityResult>> Function();

/// Advisory connectivity monitor for the POS.
///
/// Two-layer detection architecture (M10):
///
/// 1. FAST path — native link-layer signal. Subscribes to
///    `Connectivity().onConnectivityChanged` on [start]. A transition to
///    "none" flips the service offline immediately (no waiting for the next
///    HTTP poll), and a transition from "none" back to any link immediately
///    triggers [checkConnectivity] for HTTP reachability verification.
///    Detection latency is therefore driven by the platform, not by the poll
///    interval.
///
/// 2. SLOW path — periodic HTTP health poll against [_healthEndpoint]. The
///    native signal only proves a link exists (link up != cloud reachable),
///    so the poll remains the authoritative reachability layer that confirms
///    the backend is actually answering.
///
/// Layering rule: the native signal can take the state DOWN instantly, but
/// it can only bring the state back UP after an HTTP verification. The
/// periodic HTTP poll can flip the state in both directions.
///
/// This service is advisory only (offline-first product): it never blocks
/// local operation; consumers use [isOnline] / [onConnectivityChanged] to
/// gate sync scheduling and UI badges.
class NetworkConnectivityService {
  final Dio _dio;
  final String _healthEndpoint;
  final ConnectivityStreamFactory _connectivityStreamFactory;
  Timer? _pollingTimer;
  StreamSubscription<List<ConnectivityResult>>? _nativeSubscription;

  /// Last known native link-layer state. Starts as "linked" so that an
  /// initial "connected" native emission does not trigger a redundant HTTP
  /// check ([start] already runs one via [checkConnectivity]).
  bool _hadNativeLink = true;

  bool _isOnline = true;
  bool get isOnline => _isOnline;

  final StreamController<bool> _connectivityController =
      StreamController<bool>.broadcast();

  Stream<bool> get onConnectivityChanged => _connectivityController.stream;

  NetworkConnectivityService(
    this._dio, {
    String healthEndpoint = '/v1/health',
    ConnectivityStreamFactory? connectivityStreamFactory,
  })  : _healthEndpoint = healthEndpoint,
        _connectivityStreamFactory = connectivityStreamFactory ??
            (() => Connectivity().onConnectivityChanged);

  void start({
    Duration checkInterval = const Duration(seconds: 30),
    bool runImmediately = true,
  }) {
    stop();
    if (runImmediately) {
      checkConnectivity();
    }
    // FAST path: native link-layer signal drives detection latency.
    _nativeSubscription =
        _connectivityStreamFactory().listen(_onNativeConnectivityChanged);
    // SLOW path: HTTP health poll remains the reachability layer.
    _pollingTimer = Timer.periodic(checkInterval, (_) async {
      await checkConnectivity();
    });
    developer.log(
      'NetworkConnectivityService started with interval: ${checkInterval.inSeconds}s',
      name: 'NetworkConnectivityService',
    );
  }

  void _onNativeConnectivityChanged(List<ConnectivityResult> results) {
    final hasLink = results.isNotEmpty &&
        results.any((result) => result != ConnectivityResult.none);

    if (!hasLink) {
      // Transition to none: flip offline immediately without any HTTP call.
      _hadNativeLink = false;
      if (_isOnline) {
        _isOnline = false;
        developer.log(
          'Native signal lost link: flipping OFFLINE immediately',
          name: 'NetworkConnectivityService',
        );
        _connectivityController.add(false);
      }
      return;
    }

    final wasLinked = _hadNativeLink;
    _hadNativeLink = true;
    if (!wasLinked) {
      // Transition from none to any link: verify cloud reachability over
      // HTTP before declaring online (link up != cloud reachable).
      developer.log(
        'Native signal regained link: verifying reachability via health check',
        name: 'NetworkConnectivityService',
      );
      unawaited(checkConnectivity());
    }
  }

  void stop() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
    _nativeSubscription?.cancel();
    _nativeSubscription = null;
    developer.log(
      'NetworkConnectivityService stopped',
      name: 'NetworkConnectivityService',
    );
  }

  void dispose() {
    stop();
    _connectivityController.close();
  }

  Future<bool> checkConnectivity() async {
    bool wasOnline = _isOnline;
    bool currentlyOnline = false;

    try {
      final response = await _dio.get(
        _healthEndpoint,
        options: Options(
          sendTimeout: const Duration(seconds: 4),
          receiveTimeout: const Duration(seconds: 4),
        ),
      );

      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 400) {
        currentlyOnline = true;
      }
    } catch (_) {
      currentlyOnline = false;
    }

    _isOnline = currentlyOnline;

    if (wasOnline != currentlyOnline) {
      developer.log(
        'Connectivity transitioned: ${wasOnline ? "ONLINE" : "OFFLINE"} -> ${currentlyOnline ? "ONLINE" : "OFFLINE"}',
        name: 'NetworkConnectivityService',
      );
      _connectivityController.add(currentlyOnline);
    }

    return currentlyOnline;
  }

  /// For testing or manual override
  void setOnlineStateForTest(bool online) {
    if (_isOnline != online) {
      _isOnline = online;
      _connectivityController.add(online);
    }
  }
}
