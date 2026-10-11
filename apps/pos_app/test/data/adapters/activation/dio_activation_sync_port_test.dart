import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/domain/models/activation/activation_attempt_snapshot.dart';

void main() {
  late HttpServer server;
  late DioActivationSyncPort port;
  final requests = <_CapturedRequest>[];

  setUp(() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final body = await utf8.decoder.bind(request).join();
      requests.add(
        _CapturedRequest(
          path: request.uri.path,
          headers: request.headers,
          body: body.isEmpty ? null : jsonDecode(body) as Map<String, dynamic>,
        ),
      );
      request.response.headers.contentType = ContentType.json;
      if (request.uri.path.endsWith('/finalize')) {
        request.response.write(jsonEncode({
          'status': 'PASS_WITH_WARNING',
          'failureCode': null,
          'warningsCount': 1,
        }));
      } else {
        request.response.write(jsonEncode({'ok': true}));
      }
      await request.response.close();
    });
    port = DioActivationSyncPort(
      Dio(BaseOptions(baseUrl: 'http://${server.address.address}:${server.port}/')),
    );
  });

  tearDown(() async => server.close(force: true));

  test('posts each activation evidence type to its authoritative endpoint', () async {
    expect(
      await port.sendCheck(
        attemptId: 'attempt-1',
        checkCode: 'OFFLINE_SALE_PAID',
        status: 'PASS',
        tenantId: 'tenant-1',
        terminalId: 'terminal-1',
      ),
      isTrue,
    );
    expect(
      await port.sendVerificationSale(
        attemptId: 'attempt-1',
        salePayload: _verificationSaleRecord(),
      ),
      isTrue,
    );
    expect(
      await port.sendFirstSaleClaim(
        attemptId: 'attempt-1',
        claimPayload: _firstSaleClaim(),
      ),
      isTrue,
    );
    final finalized = await port.finalizeActivation(
      tenantId: 'tenant-1',
      attemptId: 'attempt-1',
    );

    expect(finalized.status, 'PASS_WITH_WARNING');
    expect(finalized.warningsCount, 1);
    expect(
      requests.map((request) => request.path),
      containsAll(<String>[
        '/onboarding/activation/attempts/attempt-1/checks',
        '/onboarding/activation/attempts/attempt-1/verification-sale',
        '/onboarding/activation/attempts/attempt-1/first-sale-claim',
        '/onboarding/activation/attempts/attempt-1/finalize',
      ]),
    );
    final verification = requests.firstWhere(
      (request) => request.path.endsWith('/verification-sale'),
    );
    expect(verification.headers.value('x-device-terminal-id'), 'terminal-1');
    expect(verification.body, _verificationSaleRecord());
  });

  group('F-10f — deterministic delivery rejection contract', () {
    late HttpServer server;
    late DioActivationSyncPort port;
    int responseStatus = 201;
    Object? responseBody;

    setUp(() async {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        await utf8.decoder.bind(request).join();
        request.response.headers.contentType = ContentType.json;
        request.response.statusCode = responseStatus;
        final body = responseBody;
        if (body is String) {
          request.response.write(body);
        } else {
          request.response.write(jsonEncode(body));
        }
        await request.response.close();
      });
      port = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://${server.address.address}:${server.port}/',
        )),
      );
    });

    tearDown(() async => server.close(force: true));

    test('(i) 201 with a syncBatch record IDEMPOTENCY_MISMATCH throws '
        'ActivationDeliveryRejection carrying the record code', () async {
      responseStatus = 201;
      responseBody = <String, dynamic>{
        'results': <dynamic>[
          <String, dynamic>{
            'status': 'IDEMPOTENCY_MISMATCH',
            'code': 'CRITICAL_SEQUENCE_PAYLOAD_MISMATCH',
            'retryable': false,
          },
        ],
      };

      await expectLater(
        port.sendVerificationSale(
          attemptId: 'attempt-1',
          salePayload: _verificationSaleRecord(),
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'CRITICAL_SEQUENCE_PAYLOAD_MISMATCH',
          ),
        ),
      );
    });

    test('(i-b) a rejected record WITHOUT a code falls back to RECORD_REJECTED',
        () async {
      responseStatus = 201;
      responseBody = <String, dynamic>{
        'results': <dynamic>[
          <String, dynamic>{'status': 'BLOCKED_BY_PRIOR_FAILURE'},
        ],
      };

      await expectLater(
        port.sendVerificationSale(
          attemptId: 'attempt-1',
          salePayload: _verificationSaleRecord(),
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'RECORD_REJECTED',
          ),
        ),
      );
    });

    test('(ii) DioException WITH a 409 response whose body has a code throws '
        'ActivationDeliveryRejection with that code', () async {
      responseStatus = 409;
      responseBody = <String, dynamic>{
        'code': 'ATTEMPT_ALREADY_FINALIZED',
        'message': 'attempt already finalized',
      };

      await expectLater(
        port.sendVerificationSale(
          attemptId: 'attempt-1',
          salePayload: _verificationSaleRecord(),
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'ATTEMPT_ALREADY_FINALIZED',
          ),
        ),
      );
    });

    test('(ii-b) a non-2xx response whose body carries no parsable code falls '
        'back to SERVER_REJECTED', () async {
      responseStatus = 500;
      responseBody = <String, dynamic>{'message': 'boom'};

      await expectLater(
        port.sendVerificationSale(
          attemptId: 'attempt-1',
          salePayload: _verificationSaleRecord(),
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'SERVER_REJECTED',
          ),
        ),
      );
    });

    test('(iii) a DioException WITHOUT a response (connection error) still '
        'returns false', () async {
      final deadPort = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://127.0.0.1:1/',
          connectTimeout: const Duration(milliseconds: 500),
        )),
      );

      expect(
        await deadPort.sendVerificationSale(
          attemptId: 'attempt-1',
          salePayload: _verificationSaleRecord(),
        ),
        isFalse,
      );
    });

    test('sendCheck discriminates: server answered (409) → rejection with the '
        'body code', () async {
      responseStatus = 409;
      responseBody = <String, dynamic>{'code': 'CHECK_REJECTED_BY_BACKEND'};

      await expectLater(
        port.sendCheck(
          attemptId: 'attempt-1',
          checkCode: 'OFFLINE_SALE_PAID',
          status: 'PASS',
          tenantId: 'tenant-1',
          terminalId: 'terminal-1',
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'CHECK_REJECTED_BY_BACKEND',
          ),
        ),
      );
    });

    test('sendCheck keeps returning false for a connection error (no response)',
        () async {
      final deadPort = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://127.0.0.1:1/',
          connectTimeout: const Duration(milliseconds: 500),
        )),
      );

      expect(
        await deadPort.sendCheck(
          attemptId: 'attempt-1',
          checkCode: 'OFFLINE_SALE_PAID',
          status: 'PASS',
          tenantId: 'tenant-1',
          terminalId: 'terminal-1',
        ),
        isFalse,
      );
    });

    test('sendFirstSaleClaim discriminates: server answered (409) → rejection '
        'with the body code', () async {
      responseStatus = 409;
      responseBody = <String, dynamic>{'code': 'CLAIM_CONFLICT'};

      await expectLater(
        port.sendFirstSaleClaim(
          attemptId: 'attempt-1',
          claimPayload: _firstSaleClaim(),
        ),
        throwsA(
          isA<ActivationDeliveryRejection>().having(
            (e) => e.code,
            'code',
            'CLAIM_CONFLICT',
          ),
        ),
      );
    });

    test('sendFirstSaleClaim keeps returning false for a connection error '
        '(no response)', () async {
      final deadPort = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://127.0.0.1:1/',
          connectTimeout: const Duration(milliseconds: 500),
        )),
      );

      expect(
        await deadPort.sendFirstSaleClaim(
          attemptId: 'attempt-1',
          claimPayload: _firstSaleClaim(),
        ),
        isFalse,
      );
    });
  });

  group('DioActivationSyncPort.fetchActiveAttempt payload contract', () {
    late HttpServer server;
    late DioActivationSyncPort port;

    /// Raw response body for GET /attempts/active: a String is written
    /// verbatim (raw JSON text), anything else is jsonEncoded.
    Object? activeResponseBody;
    int activeResponseStatus = 200;

    setUp(() async {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        await utf8.decoder.bind(request).join();
        request.response.headers.contentType = ContentType.json;
        request.response.statusCode = activeResponseStatus;
        final body = activeResponseBody;
        if (body is String) {
          request.response.write(body);
        } else {
          request.response.write(jsonEncode(body));
        }
        await request.response.close();
      });
      port = DioActivationSyncPort(
        Dio(BaseOptions(
          baseUrl: 'http://${server.address.address}:${server.port}/',
        )),
      );
    });

    tearDown(() async => server.close(force: true));

    Map<String, dynamic> validActivePayload() => <String, dynamic>{
          'id': 'attempt-active-1',
          'tenantId': 'tenant-founder-01',
          'candidateTerminalId': 'pos-term-01',
          'requiredFiscalRevision': 3,
          'requiredFiscalFingerprint': 'fiscal-fp-sha256-abc',
          'verificationProductId': 'prod-uuid-1',
          'serverTimeAnchorAt': '2026-09-04T11:59:58.000Z',
          'startedAt': '2026-09-04T12:00:00.000Z',
        };

    test('parses the backend serverTimeAnchorAt into the snapshot', () async {
      activeResponseBody = validActivePayload();

      final snapshot = await port.fetchActiveAttempt();

      expect(snapshot, isNotNull);
      expect(snapshot!.attemptId, 'attempt-active-1');
      expect(snapshot.serverTimeAnchorAt, '2026-09-04T11:59:58.000Z');
      expect(snapshot.assignedAt, '2026-09-04T12:00:00.000Z');
    });

    test('fails closed when serverTimeAnchorAt is absent', () async {
      activeResponseBody = validActivePayload()..remove('serverTimeAnchorAt');

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when serverTimeAnchorAt is unparseable', () async {
      activeResponseBody = validActivePayload();
      (activeResponseBody as Map<String, dynamic>)['serverTimeAnchorAt'] =
          'not-a-timestamp';

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when requiredFiscalRevision is missing', () async {
      activeResponseBody = validActivePayload()..remove('requiredFiscalRevision');

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when requiredFiscalRevision is not a number', () async {
      activeResponseBody = validActivePayload();
      (activeResponseBody as Map<String, dynamic>)['requiredFiscalRevision'] = '3';

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when requiredFiscalFingerprint is missing or blank', () async {
      activeResponseBody = validActivePayload()..remove('requiredFiscalFingerprint');
      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );

      activeResponseBody = validActivePayload();
      (activeResponseBody as Map<String, dynamic>)['requiredFiscalFingerprint'] =
          '   ';
      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when verificationProductId is missing or blank', () async {
      activeResponseBody = validActivePayload()..remove('verificationProductId');
      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );

      activeResponseBody = validActivePayload();
      (activeResponseBody as Map<String, dynamic>)['verificationProductId'] = '';
      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('fails closed when a hard identity field is blank', () async {
      activeResponseBody = validActivePayload();
      (activeResponseBody as Map<String, dynamic>)['candidateTerminalId'] = '';

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('maps a non-object payload to a named error instead of StateError', () async {
      activeResponseBody = <Object>['unusable'];

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('maps a JSON string payload to a named error instead of StateError', () async {
      activeResponseBody = jsonEncode('unusable');

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<ActivationAttemptPayloadException>()),
      );
    });

    test('keeps reporting no active attempt for a null body', () async {
      activeResponseBody = 'null';

      expect(await port.fetchActiveAttempt(), isNull);
    });

    test('propagates a non-2xx response as DioException, not a snapshot', () async {
      activeResponseBody = <String, dynamic>{'statusCode': 500};
      activeResponseStatus = 500;

      await expectLater(
        port.fetchActiveAttempt(),
        throwsA(isA<DioException>()),
      );
    });
  });
}

class _CapturedRequest {
  final String path;
  final HttpHeaders headers;
  final Map<String, dynamic>? body;

  const _CapturedRequest({
    required this.path,
    required this.headers,
    required this.body,
  });
}

Map<String, dynamic> _verificationSaleRecord() => <String, dynamic>{
      'idempotencyKey': 'sale:terminal-1:invoice-1',
      'sourceDeviceId': 'terminal-1',
      'sourceSequence': 7,
      'flowType': 'sales',
      'documentType': 'SALE',
      'invoiceId': 'invoice-1',
      'terminalId': 'terminal-1',
      'invoice': <String, dynamic>{
        'id': 'invoice-1',
        'number': 'F001-7',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'userId': 'cashier-1',
        'subtotal': 10.0,
        'totalTax': 0.0,
        'total': 10.0,
        'paymentStatus': 'paid',
        'items': <dynamic>[],
        'payments': <dynamic>[],
      },
    };

Map<String, dynamic> _firstSaleClaim() => <String, dynamic>{
      'ticketId': 'invoice-1',
      'declarativeTenantId': 'tenant-1',
      'declarativeTerminalId': 'terminal-1',
      'activationAttemptId': 'attempt-1',
      'deviceOccurredAt': '2026-01-01T00:00:00.000Z',
      'clockConfidence': 'ANCHORED',
      'outboxEventId': 'outbox-1',
    };
