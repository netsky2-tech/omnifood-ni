import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../services/api_base_url_service.dart';

/// Thrown locally — before any socket is opened — when a transport request is
/// attempted on a Dio client built for an unconfigured backend: a release
/// build with neither a persisted `api_base_url` nor a build-time `API_URL`
/// define. This is a distinct, typed condition so "this device was never
/// configured" never reads as a network failure ("the server is down").
///
/// Extends [DioException] because Dio's request pipeline rethrows
/// `DioException` instances unchanged (`assureDioException`), so callers can
/// branch directly on `is UnconfiguredBackendException` while every generic
/// Dio error handler keeps working.
class UnconfiguredBackendException extends DioException {
  UnconfiguredBackendException(RequestOptions requestOptions, this.source)
      : super(
          requestOptions: requestOptions,
          type: DioExceptionType.unknown,
          error: 'No backend URL is configured (source: ${source.name}).',
        );

  /// The resolved provenance carried for callers that branch on it. For an
  /// unconfigured transport this is always
  /// [ApiBaseUrlSource.unconfigured], the only source with a null URL.
  final ApiBaseUrlSource source;

  @override
  String toString() =>
      'UnconfiguredBackendException: no backend URL is configured '
      '(source: ${source.name}). Provision the server URL on the device; '
      'this is not a network failure.';
}

/// An [HttpClientAdapter] wrapper that rejects every request with an
/// [UnconfiguredBackendException] instead of reaching the wrapped adapter, so
/// a request on an unconfigured transport fails locally, immediately, and
/// typed.
///
/// This is an adapter wrapper rather than an interceptor on purpose: the
/// pre-auth `claimDio` must stay free of interceptors (its construction
/// comment and the wiring test both require it), and an adapter guard covers
/// all five transport clients uniformly.
class UnconfiguredBackendAdapter implements HttpClientAdapter {
  UnconfiguredBackendAdapter(this._inner, {required this.source});

  final HttpClientAdapter _inner;
  final ApiBaseUrlSource source;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw UnconfiguredBackendException(options, source);
  }

  @override
  void close({bool force = false}) => _inner.close(force: force);
}
