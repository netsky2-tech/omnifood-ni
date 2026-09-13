import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../domain/security/cloud_auth_unavailable_exception.dart';
import '../../domain/security/cloud_credential_coordinator.dart';
import '../../domain/security/cloud_credential_record.dart';
import '../../domain/security/cloud_credentials.dart';

class CloudAuthInterceptor extends Interceptor {
  final CloudCredentialCoordinator coordinator;
  final Dio refreshDio;
  final Dio clientDio;
  final VoidCallback? onReauthenticationRequired;

  /// Fallback that provides a raw access token when the credential
  /// coordinator cannot recover (e.g. Keystore hung on cold start).
  final Future<String?> Function()? tokenFallback;

  Completer<String?>? _inFlightRefresh;

  static const Set<String> _publicAllowlist = {
    'identity/login',
    'identity/refresh',
    'v1/health',
    'health',
  };

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

  CloudAuthInterceptor({
    required this.coordinator,
    required this.refreshDio,
    required this.clientDio,
    this.onReauthenticationRequired,
    this.tokenFallback,
  });

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!options.baseUrl.endsWith('/')) {
      options.baseUrl = '${options.baseUrl}/';
    }
    if (options.path.startsWith('/')) {
      options.path = options.path.substring(1);
    }

    final path = options.path;

    // Narrowest exact path allowlist: login, refresh, health only
    if (_publicAllowlist.contains(_normalizePath(path))) {
      handler.next(options);
      return;
    }

    try {
      final recovery = await coordinator.recover();
      final creds = recovery.record?.credentials;
      if (creds != null &&
          recovery.record?.credentialState == CredentialState.active) {
        options.headers['Authorization'] = 'Bearer ${creds.accessToken}';
        handler.next(options);
        return;
      }
    } catch (_) {
      // Coordinator threw — treat as unavailable
    }

    // Coordinator has no valid credentials. Try the SharedPreferences
    // fallback (covers Keystore-hung cold-start where the coordinator
    // lost its in-memory record but the token was persisted to prefs).
    if (tokenFallback != null) {
      try {
        final fallbackToken = await tokenFallback!();
        if (fallbackToken != null && fallbackToken.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $fallbackToken';
          handler.next(options);
          return;
        }
      } catch (_) {}
    }

    handler.reject(
      DioException(
        requestOptions: options,
        type: DioExceptionType.cancel,
        error: const CloudAuthUnavailableException(
          reason: 'No valid cloud credentials available',
        ),
      ),
    );
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

    // Do not intercept public requests (login, refresh, health) to avoid infinite recursion
    final path = options.path;
    if (_publicAllowlist.contains(_normalizePath(path))) {
      return handler.next(err);
    }

    // Do not retry more than once
    final retryAttempt = options.extra['retryAttempt'] ?? 0;
    if (retryAttempt >= 1) {
      return handler.next(err);
    }

    try {
      final newAccessToken = await _executeCoalescedRefresh();
      if (newAccessToken != null) {
        final retryOptions = options.copyWith(
          extra: Map<String, dynamic>.from(options.extra)..['retryAttempt'] = 1,
          headers: Map<String, dynamic>.from(options.headers)
            ..['Authorization'] = 'Bearer $newAccessToken'
            ..['X-Retry-Attempt'] = '1',
        );

        final retryResponse = await clientDio.fetch(retryOptions);
        return handler.resolve(retryResponse);
      }
    } catch (e) {
      // In case of unexpected failure during retry dispatch, pass error
    }

    handler.next(err);
  }

  Future<String?> _executeCoalescedRefresh() async {
    if (_inFlightRefresh != null) {
      return _inFlightRefresh!.future;
    }

    final completer = Completer<String?>();
    _inFlightRefresh = completer;

    try {
      final intent = await coordinator.reserveIntent();
      final recovery = await coordinator.recover();
      final currentRecord = recovery.record;
      final creds = currentRecord?.credentials;

      if (creds == null ||
          currentRecord?.credentialState != CredentialState.active) {
        onReauthenticationRequired?.call();
        completer.complete(null);
        return null;
      }

      final refreshResponse = await refreshDio.post<Map<String, dynamic>>(
        '/identity/refresh',
        data: {'userId': creds.userId, 'refreshToken': creds.refreshToken},
      );

      if (refreshResponse.statusCode == 200 ||
          refreshResponse.statusCode == 201) {
        final data = refreshResponse.data;
        final tokens = data?['tokens'] as Map<String, dynamic>?;
        final accessToken = tokens?['access_token'] as String?;
        final refreshToken = tokens?['refresh_token'] as String?;

        if (accessToken != null && refreshToken != null) {
          final newCreds = CloudCredentials(
            accessToken: accessToken,
            refreshToken: refreshToken,
            userId: creds.userId,
            tenantId: creds.tenantId,
            issuedAtUtc: DateTime.now().toUtc(),
          );
          final commitResult = await coordinator.commit(intent, newCreds);
          if (commitResult.committed) {
            completer.complete(accessToken);
            return accessToken;
          }
        }
      }

      // If response was not 200/201 or tokens missing
      onReauthenticationRequired?.call();
      completer.complete(null);
      return null;
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      if (statusCode == 401 || statusCode == 403) {
        // Token revoked or invalid
        onReauthenticationRequired?.call();
      }
      // In all cases (including connection timeout / network error),
      // preserve local credentials and do not crash
      completer.complete(null);
      return null;
    } catch (_) {
      completer.complete(null);
      return null;
    } finally {
      _inFlightRefresh = null;
    }
  }
}
