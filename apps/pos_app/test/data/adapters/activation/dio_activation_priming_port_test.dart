import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_priming_port.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';

void main() {
  late HttpServer server;
  late DioActivationPrimingPort port;
  final requests = <_CapturedRequest>[];

  Map<String, dynamic> validPayload() => {
        'status': 'success',
        'serverTime': '2026-09-21T10:00:00.000Z',
        'currentVersion': 7,
        'deltas': {
          'products': [
            {
              'id': 'prod-uuid-1',
              'name': 'Gallo Pinto Tradicional',
              'uom': 'PLATO',
              'stock': 10,
              'averageCost': 40,
              'sellPrice': 75,
              'isActive': true,
              'productType': 'SIMPLE',
              'tenantId': 'tenant-founder-01',
            },
          ],
          'catalogValues': [],
          'fiscalConfig': {
            'tenantId': 'tenant-founder-01',
            'businessName': 'Fonda La Patrona',
            'fiscalRegime': 'RIM',
            'configVersion': {
              'revision': 3,
              'fingerprint': 'fiscal-fp-sha256-abc',
            },
            'taxRate': 15,
            'pricesIncludeTax': true,
          },
        },
      };

  setUp(() async {
    requests.clear();
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      await utf8.decoder.bind(request).join();
      requests.add(_CapturedRequest(
        method: request.method,
        path: request.uri.path,
      ));
      request.response.headers.contentType = ContentType.json;
      if (request.uri.path.endsWith('/priming')) {
        request.response.write(jsonEncode(validPayload()));
      } else {
        request.response.statusCode = HttpStatus.notFound;
        request.response.write(jsonEncode({'error': 'not found'}));
      }
      await request.response.close();
    });
    port = DioActivationPrimingPort(
      Dio(BaseOptions(
        baseUrl: 'http://${server.address.address}:${server.port}/',
      )),
    );
  });

  tearDown(() async => server.close(force: true));

  test('GETs the relative priming path and parses the payload', () async {
    final payload = await port.fetchPrimingPayload();

    expect(requests, hasLength(1));
    expect(requests.single.method, equals('GET'));
    expect(requests.single.path, endsWith('onboarding/terminals/priming'));

    expect(payload.status, equals('success'));
    expect(payload.currentVersion, equals(7));
    expect(payload.products, hasLength(1));
    expect(payload.products.first['id'], equals('prod-uuid-1'));
    expect(payload.catalogValues, isEmpty);
    expect(payload.fiscalEnvelope, isNotNull);
    expect(payload.fiscalEnvelope!['businessName'], equals('Fonda La Patrona'));
  });

  test('throws the named payload exception on a malformed body', () async {
    await server.close(force: true);
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      await utf8.decoder.bind(request).join();
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'status': 'success',
        'serverTime': '2026-09-21T10:00:00.000Z',
        'currentVersion': 7,
        // No deltas at all: a partial payload must never be applied.
      }));
      await request.response.close();
    });
    port = DioActivationPrimingPort(
      Dio(BaseOptions(
        baseUrl: 'http://${server.address.address}:${server.port}/',
      )),
    );

    await expectLater(
      port.fetchPrimingPayload(),
      throwsA(isA<TerminalPrimingPayloadException>().having(
        (e) => e.code,
        'code',
        'TERMINAL_PRIMING_DELTAS_MISSING',
      )),
    );
  });

  test('propagates network failures so the caller can block activation',
      () async {
    final unreachablePort = DioActivationPrimingPort(
      Dio(BaseOptions(
        baseUrl: 'http://127.0.0.1:1/',
        connectTimeout: const Duration(seconds: 1),
      )),
    );

    await expectLater(
      unreachablePort.fetchPrimingPayload(),
      throwsA(isA<DioException>()),
    );
  });
}

class _CapturedRequest {
  final String method;
  final String path;

  const _CapturedRequest({required this.method, required this.path});
}
