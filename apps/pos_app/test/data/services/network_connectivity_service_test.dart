import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';

/// Pump the event loop enough times for immediate native-signal handling and
/// the HTTP health check it triggers to settle.
Future<void> pumpEventLoop({int cycles = 25}) async {
  for (var i = 0; i < cycles; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  group('NetworkConnectivityService Tests', () {
    late Dio dio;
    late NetworkConnectivityService connectivityService;

    setUp(() {
      dio = Dio();
      connectivityService = NetworkConnectivityService(dio);
    });

    tearDown(() {
      connectivityService.dispose();
    });

    test('checkConnectivity returns true when /v1/health returns 200 OK', () async {
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'ok', 'timestamp': '2026-08-26T18:00:00Z'},
              ),
            );
          },
        ),
      );

      final isOnline = await connectivityService.checkConnectivity();
      expect(isOnline, isTrue);
      expect(connectivityService.isOnline, isTrue);
    });

    test('checkConnectivity returns false when health check throws DioException', () async {
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionTimeout,
                message: 'No internet connection',
              ),
            );
          },
        ),
      );

      final isOnline = await connectivityService.checkConnectivity();
      expect(isOnline, isFalse);
      expect(connectivityService.isOnline, isFalse);
    });

    test('emits event on onConnectivityChanged when state transitions', () async {
      connectivityService.setOnlineStateForTest(false);

      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'ok'},
              ),
            );
          },
        ),
      );

      final events = <bool>[];
      final sub = connectivityService.onConnectivityChanged.listen(events.add);

      await connectivityService.checkConnectivity();
      await Future<void>.delayed(Duration.zero);

      expect(events, [true]);

      await sub.cancel();
    });
  });

  group('NetworkConnectivityService native signal (M10)', () {
    late Dio dio;
    late StreamController<List<ConnectivityResult>> nativeController;
    late List<Map<String, String>> httpRequests;

    setUp(() {
      dio = Dio();
      nativeController = StreamController<List<ConnectivityResult>>.broadcast();
      httpRequests = [];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            httpRequests.add({'method': options.method, 'path': options.path});
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'ok'},
              ),
            );
          },
        ),
      );
    });

    tearDown(() {
      nativeController.close();
    });

    NetworkConnectivityService buildService() => NetworkConnectivityService(
          dio,
          connectivityStreamFactory: () => nativeController.stream,
        );

    test('native none signal flips offline immediately with no HTTP call', () async {
      final service = buildService();
      service.start(runImmediately: false);

      final events = <bool>[];
      final sub = service.onConnectivityChanged.listen(events.add);

      // Device reports link lost: must not require any HTTP verification.
      nativeController.add(const [ConnectivityResult.none]);
      await pumpEventLoop();

      expect(events, [false]);
      expect(service.isOnline, isFalse);
      expect(httpRequests, isEmpty);

      await sub.cancel();
      service.dispose();
    });

    test('native regain signal triggers health check and emits online on 200', () async {
      final service = buildService();
      // Start from the default online state so the none->any transition is
      // fully observable: offline emitted immediately, then online after the
      // HTTP verification succeeds.
      service.start(runImmediately: false);

      final events = <bool>[];
      final sub = service.onConnectivityChanged.listen(events.add);

      // Link reported lost, then regained: the none->any transition must
      // trigger an immediate HTTP reachability verification.
      nativeController.add(const [ConnectivityResult.none]);
      await pumpEventLoop();
      nativeController.add(const [ConnectivityResult.wifi]);
      await pumpEventLoop();

      expect(events, [false, true]);
      expect(service.isOnline, isTrue);
      expect(
        httpRequests.any((request) => request['path'] == '/v1/health'),
        isTrue,
      );

      await sub.cancel();
      service.dispose();
    });

    test('health poll still flips offline on HTTP failure while native says connected', () async {
      final service = buildService();
      dio.interceptors.clear();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            httpRequests.add({'method': options.method, 'path': options.path});
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
                message: 'Backend unreachable',
              ),
            );
          },
        ),
      );
      service.start(
        checkInterval: const Duration(milliseconds: 20),
        runImmediately: false,
      );
      // Native reports an active link the whole time: the HTTP poll is the
      // layer that detects the backend being unreachable.
      nativeController.add(const [ConnectivityResult.ethernet]);
      await pumpEventLoop(cycles: 5);

      final events = <bool>[];
      final sub = service.onConnectivityChanged.listen(events.add);

      await Future<void>.delayed(const Duration(milliseconds: 120));
      await pumpEventLoop();

      expect(service.isOnline, isFalse);
      expect(events, [false]);
      expect(
        httpRequests.any((request) => request['path'] == '/v1/health'),
        isTrue,
      );

      await sub.cancel();
      service.dispose();
    });

    test('stop cancels both the poll timer and the native subscription', () async {
      final service = buildService();
      service.start(
        checkInterval: const Duration(milliseconds: 20),
        runImmediately: false,
      );

      final events = <bool>[];
      final sub = service.onConnectivityChanged.listen(events.add);
      await pumpEventLoop(cycles: 5);

      service.stop();
      await pumpEventLoop();

      // After stop, neither native signals nor poll ticks may produce
      // emissions or HTTP calls.
      nativeController.add(const [ConnectivityResult.none]);
      nativeController.add(const [ConnectivityResult.wifi]);
      await Future<void>.delayed(const Duration(milliseconds: 80));
      await pumpEventLoop();

      expect(events, isEmpty);
      expect(httpRequests, isEmpty);
      expect(service.isOnline, isTrue);

      await sub.cancel();
      service.dispose();
    });
  });
}
