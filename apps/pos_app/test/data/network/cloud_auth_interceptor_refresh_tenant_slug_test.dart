import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/network/cloud_auth_interceptor.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import '../security/support/fake_cloud_credential_store.dart';

/// Verifies the POST /identity/refresh wire contract for the optional
/// `tenantSlug` field: it is sent only when the resolved stored slug is
/// non-blank after trimming, and omitted entirely for legacy/unprovisioned
/// installs (issue #556). Mirrors auth_repository_login_tenant_slug_test.
void main() {
  late FakeCloudCredentialStore store;
  late CloudCredentialCoordinator coordinator;
  late Dio clientDio;
  late Dio refreshDio;
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
  });

  CloudAuthInterceptor buildInterceptor({
    Future<String?> Function()? tenantSlugResolver,
    List<Map<String, dynamic>>? capturedBodies,
  }) {
    refreshDio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.contains('identity/refresh')) {
            capturedBodies?.add(
              Map<String, dynamic>.from(options.data as Map),
            );
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

    final interceptor = CloudAuthInterceptor(
      coordinator: coordinator,
      refreshDio: refreshDio,
      clientDio: clientDio,
      onReauthenticationRequired: () => reauthEmitted = true,
      tenantSlugResolver: tenantSlugResolver,
    );
    clientDio.interceptors.add(interceptor);
    return interceptor;
  }

  Future<void> trigger401Refresh(CloudAuthInterceptor interceptor) async {
    final options = RequestOptions(
      baseUrl: 'http://127.0.0.1:3000/api/',
      path: 'v1/sync/batch',
    );
    final error = DioException(
      requestOptions: options,
      response: Response(requestOptions: options, statusCode: 401),
      type: DioExceptionType.badResponse,
    );
    await interceptor.onError(error, _TestErrorHandler());
  }

  test(
    'refresh sends tenantSlug when the resolver returns a stored slug',
    () async {
      final capturedBodies = <Map<String, dynamic>>[];
      final interceptor = buildInterceptor(
        tenantSlugResolver: () async => 'omnifood-managua',
        capturedBodies: capturedBodies,
      );

      await trigger401Refresh(interceptor);

      expect(capturedBodies, hasLength(1));
      expect(capturedBodies.single['tenantSlug'], 'omnifood-managua');
      expect(capturedBodies.single['userId'], 'user-123');
      expect(capturedBodies.single['refreshToken'], 'initial-refresh-token');
      expect(reauthEmitted, isFalse);
    },
  );

  test(
    'refresh omits the tenantSlug key when the resolver returns null',
    () async {
      final capturedBodies = <Map<String, dynamic>>[];
      final interceptor = buildInterceptor(
        tenantSlugResolver: () async => null,
        capturedBodies: capturedBodies,
      );

      await trigger401Refresh(interceptor);

      expect(capturedBodies, hasLength(1));
      expect(capturedBodies.single.containsKey('tenantSlug'), isFalse);
      expect(capturedBodies.single['userId'], 'user-123');
    },
  );

  test(
    'refresh omits the tenantSlug key when the resolver returns a blank slug',
    () async {
      final capturedBodies = <Map<String, dynamic>>[];
      final interceptor = buildInterceptor(
        tenantSlugResolver: () async => '   ',
        capturedBodies: capturedBodies,
      );

      await trigger401Refresh(interceptor);

      expect(capturedBodies, hasLength(1));
      expect(capturedBodies.single.containsKey('tenantSlug'), isFalse);
    },
  );

  test(
    'refresh omits the tenantSlug key when no resolver is provided (legacy)',
    () async {
      final capturedBodies = <Map<String, dynamic>>[];
      final interceptor = buildInterceptor(capturedBodies: capturedBodies);

      await trigger401Refresh(interceptor);

      expect(capturedBodies, hasLength(1));
      expect(capturedBodies.single.containsKey('tenantSlug'), isFalse);
    },
  );

  test(
    'refresh trims surrounding whitespace from the resolved slug',
    () async {
      final capturedBodies = <Map<String, dynamic>>[];
      final interceptor = buildInterceptor(
        tenantSlugResolver: () async => '  omnifood-managua  ',
        capturedBodies: capturedBodies,
      );

      await trigger401Refresh(interceptor);

      expect(capturedBodies, hasLength(1));
      expect(capturedBodies.single['tenantSlug'], 'omnifood-managua');
    },
  );
}

class _TestErrorHandler extends ErrorInterceptorHandler {
  @override
  void next(DioException err) {}

  @override
  void resolve(Response response) {}
}
