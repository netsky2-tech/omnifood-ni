import 'dart:async';
import 'package:dio/dio.dart';
import '../../domain/security/device_sync_credential_coordinator.dart';
import '../../domain/security/device_sync_exceptions.dart';

/// Interceptor attached exclusively to the dedicated device sync [Dio] client.
///
/// Key Guarantees:
/// - Attaches short-lived device sync access JWT as Bearer ONLY to canonical sync
///   routes (`/v1/sync/*` and `v1/sync/*`) and the explicitly allowlisted
///   device-transported inventory document routes (exact match, no prefix
///   matching).
/// - NEVER attaches device credentials to human, admin, onboarding, or activation endpoints.
/// - Obtains tokens from [DeviceSyncCredentialCoordinator] which provides memory-first caching
///   and single-flight concurrent token renewals.
/// - Retries at most once on 401 Unauthorized by invalidating cached token and re-requesting.
/// - Prevents retry storms by enforcing `retryAttempt >= 1` termination.
/// - Surfaces typed [DeviceSyncRevokedException] and [DeviceSyncUnavailableException] errors
///   without altering or deleting pending Outbox state.
class DeviceSyncAuthInterceptor extends Interceptor {
  DeviceSyncAuthInterceptor({
    required this.coordinator,
    required this.clientDio,
  });

  final DeviceSyncCredentialCoordinator coordinator;
  final Dio clientDio;

  static const String _syncPathPrefix = 'v1/sync';

  /// Inventory document writes transmitted by the background sync pass on the
  /// device sync Dio. The backend guards exactly these routes with
  /// SyncTransportGuard (ST-03/ST-04/ST-06, issues #478/#445 and the
  /// regularization sync work unit); every other inventory route stays
  /// human-transported and must never receive the device token. Keep this
  /// allowlist explicit and exact-match: widening it to all of `/inventory/*`
  /// would leak device credentials to human surfaces.
  static const List<String> _deviceTransportedInventoryRoutes = [
    'inventory/purchases',
    'inventory/recipes/versions',
    'inventory/production-orders/close',
    'inventory/count-sessions',
    'inventory/regularization/sync',
  ];

  static String _normalizePath(String path) {
    var p = path.split('?').first;
    while (p.startsWith('/')) {
      p = p.substring(1);
    }
    while (p.endsWith('/') && p.length > 1) {
      p = p.substring(0, p.length - 1);
    }
    return p;
  }

  static bool isSyncRoute(String path) {
    final normalized = _normalizePath(path);
    return normalized == _syncPathPrefix ||
        normalized.startsWith('$_syncPathPrefix/');
  }

  static bool isDeviceTransportedInventoryRoute(String path) {
    final normalized = _normalizePath(path);
    return _deviceTransportedInventoryRoutes.contains(normalized);
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final path = options.path;

    // Bearer token must ONLY be attached to canonical /v1/sync/* routes and
    // the explicitly allowlisted device-transported inventory document routes
    if (!isSyncRoute(path) && !isDeviceTransportedInventoryRoute(path)) {
      handler.next(options);
      return;
    }

    try {
      final token = await coordinator.getAccessToken();
      options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    } on DeviceSyncRevokedException catch (revokedErr) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: revokedErr,
          message: revokedErr.message,
        ),
      );
    } on DeviceSyncException catch (syncErr) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: syncErr,
          message: syncErr.message,
        ),
      );
    } catch (e) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: DeviceSyncUnavailableException(
            'Failed to acquire device sync token: $e',
          ),
        ),
      );
    }
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    final options = err.requestOptions;

    // Only intercept 401 Unauthorized
    if (response?.statusCode != 401) {
      return handler.next(err);
    }

    // Only retry for sync routes
    if (!isSyncRoute(options.path)) {
      return handler.next(err);
    }

    // Do not retry more than once (prevent retry storms)
    final retryAttempt = (options.extra['retryAttempt'] as num?)?.toInt() ?? 0;
    if (retryAttempt >= 1) {
      return handler.next(err);
    }

    try {
      coordinator.invalidateAccessToken();
      final newToken = await coordinator.getAccessToken();

      final retryOptions = options.copyWith(
        extra: Map<String, dynamic>.from(options.extra)..['retryAttempt'] = 1,
        headers: Map<String, dynamic>.from(options.headers)
          ..['Authorization'] = 'Bearer $newToken'
          ..['X-Retry-Attempt'] = '1',
      );

      final retryResponse = await clientDio.fetch<dynamic>(retryOptions);
      return handler.resolve(retryResponse);
    } on DeviceSyncRevokedException catch (revokedErr) {
      return handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: revokedErr,
          message: revokedErr.message,
          response: response,
        ),
      );
    } on DeviceSyncException catch (syncErr) {
      return handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: syncErr,
          message: syncErr.message,
          response: response,
        ),
      );
    } catch (e) {
      // For unexpected non-device errors, pass through original 401 error
      return handler.next(err);
    }
  }
}
