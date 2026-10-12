import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/network/unconfigured_backend_interceptor.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';

class _RecordingAdapter implements HttpClientAdapter {
  int fetchCount = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    fetchCount++;
    throw StateError('inner adapter must never be reached when unconfigured');
  }

  @override
  void close({bool force = false}) {}
}

class _CloseRecordingAdapter extends _RecordingAdapter {
  bool closed = false;

  @override
  void close({bool force = false}) => closed = true;
}

void main() {
  group('UnconfiguredBackendAdapter', () {
    test(
        'rejects every request with UnconfiguredBackendException before the '
        'inner adapter (and therefore any socket) is invoked', () async {
      final recorder = _RecordingAdapter();
      final dio = Dio(BaseOptions(baseUrl: ''))
        ..httpClientAdapter = UnconfiguredBackendAdapter(
          recorder,
          source: ApiBaseUrlSource.unconfigured,
        );

      await expectLater(
        dio.get<void>('/v1/health'),
        throwsA(isA<UnconfiguredBackendException>()),
      );
      expect(
        recorder.fetchCount,
        0,
        reason: 'the request must fail locally, before any adapter I/O',
      );
    });

    test('carries the resolved source so a caller can branch on it', () async {
      final dio = Dio(BaseOptions(baseUrl: ''))
        ..httpClientAdapter = UnconfiguredBackendAdapter(
          _RecordingAdapter(),
          source: ApiBaseUrlSource.unconfigured,
        );

      await expectLater(
        dio.post<void>('/onboarding/activation/link'),
        throwsA(
          isA<UnconfiguredBackendException>().having(
            (e) => e.source,
            'source',
            ApiBaseUrlSource.unconfigured,
          ),
        ),
      );
    });

    test('delegates close to the wrapped adapter', () {
      final inner = _CloseRecordingAdapter();
      final adapter = UnconfiguredBackendAdapter(
        inner,
        source: ApiBaseUrlSource.unconfigured,
      );

      expect(inner.closed, isFalse);
      adapter.close(force: true);
      expect(inner.closed, isTrue);
    });
  });
}
