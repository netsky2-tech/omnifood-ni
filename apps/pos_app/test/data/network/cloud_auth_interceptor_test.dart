import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/network/cloud_auth_interceptor.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import '../security/support/fake_cloud_credential_store.dart';

void main() {
  late FakeCloudCredentialStore store;
  late CloudCredentialCoordinator coordinator;
  late Dio clientDio;
  late Dio refreshDio;
  late CloudAuthInterceptor interceptor;
  bool reauthEmitted = false;

  setUp(() async {
    CloudCredentialCoordinator.resetProcessCoordinationForTest();
    store = FakeCloudCredentialStore();
    coordinator = CloudCredentialCoordinator(
      store,
      commitId: () => 'a0000000-0000-4000-8000-000000000001',
    );
    reauthEmitted = false;

    final intent = await coordinator.reserveIntent();
    await coordinator.commit(
      intent,
      CloudCredentials(
        accessToken: 'initial-access-token',
        refreshToken: 'initial-refresh-token',
        userId: 'user-123',
        tenantId: 'tenant-456',
        issuedAtUtc: DateTime.utc(2026, 1, 1),
      ),
    );

    clientDio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'));
    refreshDio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'));

    interceptor = CloudAuthInterceptor(
      coordinator: coordinator,
      refreshDio: refreshDio,
      clientDio: clientDio,
      onReauthenticationRequired: () => reauthEmitted = true,
    );

    clientDio.interceptors.add(interceptor);
  });

  test(
    'onRequest normalizes trailing slash in baseUrl and leading slash in path and injects Bearer token',
    () async {
      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api',
        path: '/v1/sync/status',
      );

      final handler = _TestRequestHandler();
      await interceptor.onRequest(options, handler);

      expect(options.baseUrl, 'http://127.0.0.1:3000/api/');
      expect(options.path, 'v1/sync/status');
      expect(options.headers['Authorization'], 'Bearer initial-access-token');
      expect(handler.isNextCalled, isTrue);
    },
  );

  test(
    '401 on login or refresh endpoint is passed through without refresh attempt',
    () async {
      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api/',
        path: 'identity/login',
      );
      final error = DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: 401),
        type: DioExceptionType.badResponse,
      );

      final handler = _TestErrorHandler();
      await interceptor.onError(error, handler);

      expect(handler.isNextCalled, isTrue);
      expect(reauthEmitted, isFalse);
      final recovery = await coordinator.recover();
      expect(recovery.record?.credentials?.accessToken, 'initial-access-token');
    },
  );

  test(
    '401 with retryAttempt >= 1 is passed through without infinite loop',
    () async {
      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api/',
        path: 'v1/sync/batch',
        extra: {'retryAttempt': 1},
      );
      final error = DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: 401),
        type: DioExceptionType.badResponse,
      );

      final handler = _TestErrorHandler();
      await interceptor.onError(error, handler);

      expect(handler.isNextCalled, isTrue);
      expect(reauthEmitted, isFalse);
    },
  );

  test(
    'successful 401 refresh rotates coordinator tokens and retries original request with retryAttempt=1',
    () async {
      int refreshCallCount = 0;
      int clientFetchCount = 0;

      // Intercept refreshDio calls
      refreshDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.path.contains('identity/refresh')) {
              refreshCallCount++;
              final data = options.data as Map<String, dynamic>;
              expect(data['userId'], 'user-123');
              expect(data['refreshToken'], 'initial-refresh-token');

              return handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'tokens': {
                      'access_token': 'new-rotated-access-token',
                      'refresh_token': 'new-rotated-refresh-token',
                    },
                  },
                ),
              );
            }
            handler.next(options);
          },
        ),
      );

      // Intercept clientDio retry calls
      clientDio.interceptors.insert(
        0,
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.extra['retryAttempt'] == 1) {
              clientFetchCount++;
              expect(
                options.headers['Authorization'],
                'Bearer new-rotated-access-token',
              );
              expect(options.headers['X-Retry-Attempt'], '1');
              return handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {'status': 'success'},
                ),
              );
            }
            handler.next(options);
          },
        ),
      );

      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api/',
        path: 'v1/sync/batch',
      );
      final error = DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: 401),
        type: DioExceptionType.badResponse,
      );

      final handler = _TestErrorHandler();
      await interceptor.onError(error, handler);

      expect(refreshCallCount, 1);
      expect(clientFetchCount, 1);
      expect(handler.isResolved, isTrue);
      expect(handler.resolvedResponse?.data, {'status': 'success'});

      // Coordinator now holds the new rotated credentials
      final recovery = await coordinator.recover();
      expect(
        recovery.record?.credentials?.accessToken,
        'new-rotated-access-token',
      );
      expect(
        recovery.record?.credentials?.refreshToken,
        'new-rotated-refresh-token',
      );
      expect(reauthEmitted, isFalse);
    },
  );

  test('concurrent 401 errors coalesce into a single refresh flight', () async {
    int refreshCallCount = 0;

    refreshDio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.path.contains('identity/refresh')) {
            refreshCallCount++;
            await Future.delayed(const Duration(milliseconds: 50));
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'tokens': {
                    'access_token': 'coalesced-access-token',
                    'refresh_token': 'coalesced-refresh-token',
                  },
                },
              ),
            );
          }
          handler.next(options);
        },
      ),
    );

    clientDio.interceptors.insert(
      0,
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.extra['retryAttempt'] == 1) {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'path': options.path},
              ),
            );
          }
          handler.next(options);
        },
      ),
    );

    final opt1 = RequestOptions(
      baseUrl: 'http://127.0.0.1:3000/api/',
      path: 'req1',
    );
    final err1 = DioException(
      requestOptions: opt1,
      response: Response(requestOptions: opt1, statusCode: 401),
    );
    final h1 = _TestErrorHandler();

    final opt2 = RequestOptions(
      baseUrl: 'http://127.0.0.1:3000/api/',
      path: 'req2',
    );
    final err2 = DioException(
      requestOptions: opt2,
      response: Response(requestOptions: opt2, statusCode: 401),
    );
    final h2 = _TestErrorHandler();

    // Trigger both concurrently
    await Future.wait([
      interceptor.onError(err1, h1),
      interceptor.onError(err2, h2),
    ]);

    // Only one HTTP refresh should have occurred
    expect(refreshCallCount, 1);
    expect(h1.isResolved, isTrue);
    expect(h2.isResolved, isTrue);
  });

  test(
    '401 during refresh emits onReauthenticationRequired and passes error without crash',
    () async {
      refreshDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            return handler.reject(
              DioException(
                requestOptions: options,
                response: Response(requestOptions: options, statusCode: 401),
                type: DioExceptionType.badResponse,
              ),
            );
          },
        ),
      );

      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api/',
        path: 'v1/sync/batch',
      );
      final err = DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: 401),
      );
      final handler = _TestErrorHandler();

      await interceptor.onError(err, handler);

      expect(handler.isNextCalled, isTrue);
      expect(reauthEmitted, isTrue);
      // Credentials in coordinator are NOT erased/cleared blindly
      final recovery = await coordinator.recover();
      expect(recovery.record, isNotNull);
    },
  );

  test(
    'network timeout during refresh does not emit onReauthenticationRequired and preserves credentials',
    () async {
      refreshDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            return handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionTimeout,
                message: 'Connection timed out',
              ),
            );
          },
        ),
      );

      final options = RequestOptions(
        baseUrl: 'http://127.0.0.1:3000/api/',
        path: 'v1/sync/batch',
      );
      final err = DioException(
        requestOptions: options,
        response: Response(requestOptions: options, statusCode: 401),
      );
      final handler = _TestErrorHandler();

      await interceptor.onError(err, handler);

      expect(handler.isNextCalled, isTrue);
      expect(reauthEmitted, isFalse);
      final recovery = await coordinator.recover();
      expect(recovery.record?.credentials?.accessToken, 'initial-access-token');
    },
  );
}

class _TestRequestHandler extends RequestInterceptorHandler {
  bool isNextCalled = false;
  @override
  void next(RequestOptions requestOptions) {
    isNextCalled = true;
  }
}

class _TestErrorHandler extends ErrorInterceptorHandler {
  bool isNextCalled = false;
  bool isResolved = false;
  Response? resolvedResponse;

  @override
  void next(DioException err) {
    isNextCalled = true;
  }

  @override
  void resolve(Response response) {
    isResolved = true;
    resolvedResponse = response;
  }
}
