import 'dart:async';
import 'dart:developer' as developer;
import 'package:dio/dio.dart';

enum NetworkStatus {
  online,
  offline,
}

class NetworkConnectivityService {
  final Dio _dio;
  final String _healthEndpoint;
  Timer? _pollingTimer;

  bool _isOnline = true;
  bool get isOnline => _isOnline;

  final StreamController<bool> _connectivityController =
      StreamController<bool>.broadcast();

  Stream<bool> get onConnectivityChanged => _connectivityController.stream;

  NetworkConnectivityService(
    this._dio, {
    String healthEndpoint = '/v1/health',
  }) : _healthEndpoint = healthEndpoint;

  void start({
    Duration checkInterval = const Duration(seconds: 30),
    bool runImmediately = true,
  }) {
    stop();
    if (runImmediately) {
      checkConnectivity();
    }
    _pollingTimer = Timer.periodic(checkInterval, (_) async {
      await checkConnectivity();
    });
    developer.log(
      'NetworkConnectivityService started with interval: ${checkInterval.inSeconds}s',
      name: 'NetworkConnectivityService',
    );
  }

  void stop() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
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
