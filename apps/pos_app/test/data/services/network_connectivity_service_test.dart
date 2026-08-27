import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';

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
}
