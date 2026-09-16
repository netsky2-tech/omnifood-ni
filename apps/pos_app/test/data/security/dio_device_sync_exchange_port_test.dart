import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/config/production_transport_config.dart';
import 'package:pos_app/data/security/dio_device_sync_exchange_port.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  late _MockDio mockDio;
  late DioDeviceSyncExchangePort exchangePort;

  setUp(() {
    mockDio = _MockDio();
    exchangePort = DioDeviceSyncExchangePort(mockDio);
  });

  const credentialId = 'cred-uuid-1';
  const deviceId = 'pos-term-1';
  const renewalSecret = 'sec-1234567890abcdef1234567890abcdef';
  const tenantId = 'tenant-100';
  const expectedVersion = 1;

  test(
    'successfully exchanges renewal credentials and returns DeviceSyncTokenResponse',
    () async {
      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: RequestOptions(path: 'identity/device-sync/token'),
          statusCode: HttpStatus.ok,
          data: {
            'accessToken': 'signed.device.jwt',
            'tokenType': 'Bearer',
            'expiresIn': 900,
          },
        ),
      );

      final response = await exchangePort.renewToken(
        credentialId: credentialId,
        deviceId: deviceId,
        renewalSecret: renewalSecret,
        tenantId: tenantId,
        expectedCredentialVersion: expectedVersion,
      );

      verify(
        () => mockDio.post<dynamic>(
          '/identity/device-sync/token',
          data: {
            'credentialId': credentialId,
            'renewalSecret': renewalSecret,
            'declarativeTenantId': tenantId,
            'declarativeDeviceId': deviceId,
            'expectedCredentialVersion': expectedVersion,
          },
          options: any(named: 'options'),
        ),
      ).called(1);

      expect(response.accessToken, 'signed.device.jwt');
      expect(response.tokenType, 'Bearer');
      expect(response.expiresIn, 900);
      expect(response.expiresAt, isNotNull);
    },
  );

  test(
    'maps 401 with explicit code DEVICE_REVOKED to DeviceSyncRevokedException',
    () async {
      final dioException = DioException(
        requestOptions: RequestOptions(path: 'identity/device-sync/token'),
        response: Response(
          requestOptions: RequestOptions(path: 'identity/device-sync/token'),
          statusCode: HttpStatus.unauthorized,
          data: {
            'statusCode': 401,
            'error': 'DEVICE_REVOKED',
            'code': 'DEVICE_REVOKED',
            'message': 'Device credential is revoked',
          },
        ),
        type: DioExceptionType.badResponse,
      );

      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(dioException);

      expect(
        () => exchangePort.renewToken(
          credentialId: credentialId,
          deviceId: deviceId,
          renewalSecret: renewalSecret,
          tenantId: tenantId,
          expectedCredentialVersion: expectedVersion,
        ),
        throwsA(
          isA<DeviceSyncRevokedException>().having(
            (e) => e.reason,
            'reason',
            'DEVICE_REVOKED',
          ),
        ),
      );
    },
  );

  test(
    'maps generic 401 without explicit revoked code to DeviceSyncUnavailableException',
    () async {
      final dioException = DioException(
        requestOptions: RequestOptions(path: 'identity/device-sync/token'),
        response: Response(
          requestOptions: RequestOptions(path: 'identity/device-sync/token'),
          statusCode: HttpStatus.unauthorized,
          data: {'statusCode': 401, 'message': 'Invalid device credentials'},
        ),
        type: DioExceptionType.badResponse,
      );

      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(dioException);

      expect(
        () => exchangePort.renewToken(
          credentialId: credentialId,
          deviceId: deviceId,
          renewalSecret: renewalSecret,
          tenantId: tenantId,
          expectedCredentialVersion: expectedVersion,
        ),
        throwsA(
          isA<DeviceSyncUnavailableException>().having(
            (e) => e.toString(),
            'message',
            contains('Invalid device credentials'),
          ),
        ),
      );
    },
  );

  test(
    'maps 401 containing "revoked" in message but without explicit DEVICE_REVOKED code to DeviceSyncUnavailableException',
    () async {
      final dioException = DioException(
        requestOptions: RequestOptions(path: 'identity/device-sync/token'),
        response: Response(
          requestOptions: RequestOptions(path: 'identity/device-sync/token'),
          statusCode: HttpStatus.unauthorized,
          data: {
            'statusCode': 401,
            'message': 'Some credential was revoked by administrator',
          },
        ),
        type: DioExceptionType.badResponse,
      );

      when(
        () => mockDio.post<dynamic>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(dioException);

      expect(
        () => exchangePort.renewToken(
          credentialId: credentialId,
          deviceId: deviceId,
          renewalSecret: renewalSecret,
          tenantId: tenantId,
          expectedCredentialVersion: expectedVersion,
        ),
        throwsA(
          isA<DeviceSyncUnavailableException>().having(
            (e) => e.toString(),
            'message',
            contains('Some credential was revoked'),
          ),
        ),
      );
    },
  );

  test('maps connection error to DeviceSyncUnavailableException', () async {
    final dioException = DioException(
      requestOptions: RequestOptions(path: 'identity/device-sync/token'),
      type: DioExceptionType.connectionError,
      error: const SocketException('Connection refused'),
    );

    when(
      () => mockDio.post<dynamic>(
        any(),
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(dioException);

    expect(
      () => exchangePort.renewToken(
        credentialId: credentialId,
        deviceId: deviceId,
        renewalSecret: renewalSecret,
        tenantId: tenantId,
        expectedCredentialVersion: expectedVersion,
      ),
      throwsA(isA<DeviceSyncUnavailableException>()),
    );
  });

  group('URL resolution with real Dio and HttpClientAdapter', () {
    test(
      'resolves to /api/identity/device-sync/token with exact base URL http://127.0.0.1:3000/api without trailing slash',
      () async {
        late RequestOptions capturedOptions;
        const expectedBaseUrl = 'http://127.0.0.1:3000/api';
        final realDio = Dio(productionTransportOptions(expectedBaseUrl));
        realDio.httpClientAdapter = _MockHttpClientAdapter((options) {
          capturedOptions = options;
          return ResponseBody.fromString(
            '{"accessToken": "device.jwt", "tokenType": "Bearer", "expiresIn": 900}',
            HttpStatus.ok,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        });

        final port = DioDeviceSyncExchangePort(realDio);
        final response = await port.renewToken(
          credentialId: credentialId,
          deviceId: deviceId,
          renewalSecret: renewalSecret,
          tenantId: tenantId,
          expectedCredentialVersion: expectedVersion,
        );

        expect(response.accessToken, 'device.jwt');
        // Final request URI path must be exactly /api/identity/device-sync/token
        expect(capturedOptions.uri.path, '/api/identity/device-sync/token');
        expect(
          capturedOptions.uri.toString(),
          'http://127.0.0.1:3000/api/identity/device-sync/token',
        );
        expect(
          capturedOptions.uri,
          Uri.parse('http://127.0.0.1:3000/api/identity/device-sync/token'),
        );
        // Regress physical Q80 failure where malformed concatenation yielded /apiidentity
        expect(
          capturedOptions.uri.path,
          isNot('/apiidentity/device-sync/token'),
        );
        expect(capturedOptions.uri.path, isNot('/identity/device-sync/token'));
      },
    );

    test(
      'resolves to /api/identity/device-sync/token when baseUrl HAS trailing slash',
      () async {
        late RequestOptions capturedOptions;
        final realDio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'));
        realDio.httpClientAdapter = _MockHttpClientAdapter((options) {
          capturedOptions = options;
          return ResponseBody.fromString(
            '{"accessToken": "device.jwt", "tokenType": "Bearer", "expiresIn": 900}',
            HttpStatus.ok,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        });

        final port = DioDeviceSyncExchangePort(realDio);
        final response = await port.renewToken(
          credentialId: credentialId,
          deviceId: deviceId,
          renewalSecret: renewalSecret,
          tenantId: tenantId,
          expectedCredentialVersion: expectedVersion,
        );

        expect(response.accessToken, 'device.jwt');
        expect(capturedOptions.uri.path, '/api/identity/device-sync/token');
        expect(
          capturedOptions.uri.toString(),
          'http://127.0.0.1:3000/api/identity/device-sync/token',
        );
        expect(
          capturedOptions.uri,
          Uri.parse('http://127.0.0.1:3000/api/identity/device-sync/token'),
        );
        expect(
          capturedOptions.uri.path,
          isNot('/apiidentity/device-sync/token'),
        );
      },
    );
  });
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  _MockHttpClientAdapter(this._handler);
  final ResponseBody Function(RequestOptions options) _handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}
