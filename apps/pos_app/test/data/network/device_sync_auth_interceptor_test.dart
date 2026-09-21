import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/network/device_sync_auth_interceptor.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';

class _MockCoordinator extends Mock
    implements DeviceSyncCredentialCoordinator {}

class _MockDio extends Mock implements Dio {}

class _TestRequestHandler extends RequestInterceptorHandler {
  bool isNextCalled = false;
  bool isRejected = false;
  DioException? rejectionError;

  @override
  void next(RequestOptions requestOptions) {
    isNextCalled = true;
  }

  @override
  void reject(DioException err, [bool callFollowingErrorInterceptor = false]) {
    isRejected = true;
    rejectionError = err;
  }
}

class _TestErrorHandler extends ErrorInterceptorHandler {
  bool isNextCalled = false;
  bool isResolved = false;
  bool isRejected = false;
  Response? resolvedResponse;
  DioException? nextError;
  DioException? rejectionError;

  @override
  void next(DioException err) {
    isNextCalled = true;
    nextError = err;
  }

  @override
  void resolve(Response response) {
    isResolved = true;
    resolvedResponse = response;
  }

  @override
  void reject(DioException err) {
    isRejected = true;
    rejectionError = err;
  }
}

void main() {
  late _MockCoordinator coordinator;
  late _MockDio clientDio;
  late DeviceSyncAuthInterceptor interceptor;

  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  setUp(() {
    coordinator = _MockCoordinator();
    clientDio = _MockDio();
    interceptor = DeviceSyncAuthInterceptor(
      coordinator: coordinator,
      clientDio: clientDio,
    );
  });

  group('DeviceSyncAuthInterceptor onRequest', () {
    test(
      'attaches device access token as Bearer only to /v1/sync/* routes',
      () async {
        when(
          () => coordinator.getAccessToken(),
        ).thenAnswer((_) async => 'device.access.jwt');

        final options = RequestOptions(
          path: '/v1/sync/batch',
          baseUrl: 'https://api.test',
        );
        final handler = _TestRequestHandler();

        await interceptor.onRequest(options, handler);

        expect(handler.isNextCalled, isTrue);
        expect(options.headers['Authorization'], 'Bearer device.access.jwt');
        verify(() => coordinator.getAccessToken()).called(1);
      },
    );

    test(
      'attaches device token to relative path v1/sync/inbound/deltas',
      () async {
        when(
          () => coordinator.getAccessToken(),
        ).thenAnswer((_) async => 'device.access.jwt');

        final options = RequestOptions(
          path: 'v1/sync/inbound/deltas',
          baseUrl: 'https://api.test',
        );
        final handler = _TestRequestHandler();

        await interceptor.onRequest(options, handler);

        expect(handler.isNextCalled, isTrue);
        expect(options.headers['Authorization'], 'Bearer device.access.jwt');
      },
    );

    test(
      'attaches device token to the three device-transported inventory document routes',
      () async {
        when(
          () => coordinator.getAccessToken(),
        ).thenAnswer((_) async => 'device.access.jwt');

        const deviceTransportedRoutes = [
          '/inventory/purchases',
          '/inventory/recipes/versions',
          '/inventory/production-orders/close',
        ];

        for (final path in deviceTransportedRoutes) {
          final options = RequestOptions(
            path: path,
            baseUrl: 'https://api.test',
          );
          final handler = _TestRequestHandler();

          await interceptor.onRequest(options, handler);

          expect(handler.isNextCalled, isTrue);
          expect(options.headers['Authorization'], 'Bearer device.access.jwt');
        }

        verify(() => coordinator.getAccessToken()).called(3);
      },
    );

    test(
      'NEVER attaches device token to inventory routes outside the explicit allowlist',
      () async {
        final paths = [
          '/inventory/purchase',
          '/inventory/purchases/doc-1/correction',
          '/inventory/count-sessions',
          '/inventory/regularization/sync',
          '/inventory/shrinkage',
          '/inventory/recipes/versions/suffix',
          '/inventory/production-orders/close/extra',
          '/inventory/alerts',
        ];

        for (final path in paths) {
          final options = RequestOptions(
            path: path,
            baseUrl: 'https://api.test',
          );
          final handler = _TestRequestHandler();

          await interceptor.onRequest(options, handler);

          expect(handler.isNextCalled, isTrue);
          expect(options.headers['Authorization'], isNull);
        }

        verifyNever(() => coordinator.getAccessToken());
      },
    );

    test(
      'NEVER attaches device token to admin/onboarding/human endpoints',
      () async {
        final paths = [
          '/identity/login',
          '/admin/users',
          '/onboarding/activation/attempts/1/checks',
          'identity/refresh',
        ];

        for (final path in paths) {
          final options = RequestOptions(
            path: path,
            baseUrl: 'https://api.test',
          );
          final handler = _TestRequestHandler();

          await interceptor.onRequest(options, handler);

          expect(handler.isNextCalled, isTrue);
          expect(options.headers['Authorization'], isNull);
        }

        verifyNever(() => coordinator.getAccessToken());
      },
    );

    test(
      'rejects request when coordinator throws DeviceSyncRevokedException',
      () async {
        when(
          () => coordinator.getAccessToken(),
        ).thenThrow(const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'));

        final options = RequestOptions(
          path: '/v1/sync/batch',
          baseUrl: 'https://api.test',
        );
        final handler = _TestRequestHandler();

        await interceptor.onRequest(options, handler);

        expect(handler.isRejected, isTrue);
        expect(handler.rejectionError, isNotNull);
        expect(
          handler.rejectionError!.error,
          isA<DeviceSyncRevokedException>(),
        );
      },
    );

    test(
      'rejects request when coordinator throws DeviceSyncUnavailableException',
      () async {
        when(() => coordinator.getAccessToken()).thenThrow(
          const DeviceSyncUnavailableException('No credential provisioned'),
        );

        final options = RequestOptions(
          path: '/v1/sync/batch',
          baseUrl: 'https://api.test',
        );
        final handler = _TestRequestHandler();

        await interceptor.onRequest(options, handler);

        expect(handler.isRejected, isTrue);
        expect(handler.rejectionError, isNotNull);
        expect(
          handler.rejectionError!.error,
          isA<DeviceSyncUnavailableException>(),
        );
      },
    );
  });

  group('DeviceSyncAuthInterceptor onError (retry handling)', () {
    test(
      'on 401 on /v1/sync/* invalidates token and retries exactly once',
      () async {
        when(() => coordinator.invalidateAccessToken()).thenReturn(null);
        when(
          () => coordinator.getAccessToken(),
        ).thenAnswer((_) async => 'new.refreshed.device.jwt');

        final requestOptions = RequestOptions(
          path: '/v1/sync/batch',
          headers: {'Authorization': 'Bearer expired.jwt'},
        );

        when(() => clientDio.fetch<dynamic>(any())).thenAnswer(
          (_) async => Response<dynamic>(
            requestOptions: requestOptions,
            statusCode: 200,
            data: {'status': 'OK'},
          ),
        );

        final dioErr = DioException(
          requestOptions: requestOptions,
          response: Response(requestOptions: requestOptions, statusCode: 401),
        );

        final handler = _TestErrorHandler();

        await interceptor.onError(dioErr, handler);

        verify(() => coordinator.invalidateAccessToken()).called(1);
        verify(() => coordinator.getAccessToken()).called(1);

        expect(handler.isResolved, isTrue);
        expect(handler.resolvedResponse?.statusCode, 200);

        final captured =
            verify(() => clientDio.fetch<dynamic>(captureAny())).captured.first
                as RequestOptions;
        expect(
          captured.headers['Authorization'],
          'Bearer new.refreshed.device.jwt',
        );
        expect(captured.extra['retryAttempt'], 1);
      },
    );

    test(
      'does NOT retry when retryAttempt >= 1 (prevents retry storm)',
      () async {
        final requestOptions = RequestOptions(
          path: '/v1/sync/batch',
          extra: {'retryAttempt': 1},
        );

        final dioErr = DioException(
          requestOptions: requestOptions,
          response: Response(requestOptions: requestOptions, statusCode: 401),
        );

        final handler = _TestErrorHandler();

        await interceptor.onError(dioErr, handler);

        expect(handler.isNextCalled, isTrue);
        expect(handler.nextError, equals(dioErr));
        verifyNever(() => coordinator.invalidateAccessToken());
        verifyNever(() => coordinator.getAccessToken());
        verifyNever(() => clientDio.fetch<dynamic>(any()));
      },
    );

    test('does not retry when path is not a sync route', () async {
      final requestOptions = RequestOptions(path: '/identity/login');

      final dioErr = DioException(
        requestOptions: requestOptions,
        response: Response(requestOptions: requestOptions, statusCode: 401),
      );

      final handler = _TestErrorHandler();

      await interceptor.onError(dioErr, handler);

      expect(handler.isNextCalled, isTrue);
      expect(handler.nextError, equals(dioErr));
      verifyNever(() => coordinator.invalidateAccessToken());
    });

    test(
      'on 401 on /v1/sync/* when renewal fails with DeviceSyncRevokedException, propagates typed cause via reject',
      () async {
        when(() => coordinator.invalidateAccessToken()).thenReturn(null);
        when(
          () => coordinator.getAccessToken(),
        ).thenThrow(const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'));

        final requestOptions = RequestOptions(
          path: '/v1/sync/batch',
          headers: {'Authorization': 'Bearer expired.jwt'},
        );

        final dioErr = DioException(
          requestOptions: requestOptions,
          response: Response(requestOptions: requestOptions, statusCode: 401),
        );

        final handler = _TestErrorHandler();

        await interceptor.onError(dioErr, handler);

        expect(handler.isRejected, isTrue);
        expect(handler.rejectionError, isNotNull);
        expect(
          handler.rejectionError!.error,
          isA<DeviceSyncRevokedException>(),
        );
        expect(handler.isNextCalled, isFalse);
        verify(() => coordinator.invalidateAccessToken()).called(1);
        verify(() => coordinator.getAccessToken()).called(1);
      },
    );

    test(
      'on 401 on /v1/sync/* when renewal fails with DeviceSyncUnavailableException, propagates typed cause via reject',
      () async {
        when(() => coordinator.invalidateAccessToken()).thenReturn(null);
        when(() => coordinator.getAccessToken()).thenThrow(
          const DeviceSyncUnavailableException('Exchange port unavailable'),
        );

        final requestOptions = RequestOptions(
          path: '/v1/sync/batch',
          headers: {'Authorization': 'Bearer expired.jwt'},
        );

        final dioErr = DioException(
          requestOptions: requestOptions,
          response: Response(requestOptions: requestOptions, statusCode: 401),
        );

        final handler = _TestErrorHandler();

        await interceptor.onError(dioErr, handler);

        expect(handler.isRejected, isTrue);
        expect(handler.rejectionError, isNotNull);
        expect(
          handler.rejectionError!.error,
          isA<DeviceSyncUnavailableException>(),
        );
        expect(handler.isNextCalled, isFalse);
        verify(() => coordinator.invalidateAccessToken()).called(1);
        verify(() => coordinator.getAccessToken()).called(1);
      },
    );
  });
}
