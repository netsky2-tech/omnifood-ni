import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';

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
