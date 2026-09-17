import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';

class _MockCoordinator extends Mock
    implements DeviceSyncCredentialCoordinator {}

void main() {
  late HttpServer server;
  late DioActivationSyncPort port;
  late _MockCoordinator coordinator;
  final requests = <String>[];

  setUpAll(() {
    registerFallbackValue(
      DeviceSyncCredentialRecord(
        credentialId: 'fallback',
        tenantId: 'fallback',
        deviceId: 'fallback',
        renewalSecret: 'fallback',
        credentialVersion: 1,
        expiresAt: DateTime.utc(2026, 1, 1),
      ),
    );
  });

  setUp(() async {
    coordinator = _MockCoordinator();
    requests.clear();
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      requests.add(request.uri.path);
      request.response.headers.contentType = ContentType.json;

      if (request.uri.path == '/onboarding/activation/device-sync-credential') {
        request.response.write(
          jsonEncode({
            'credentialId': 'cred-q80-boot',
            'tenantId': 'tenant-test',
            'deviceId': 'terminal-q80-matched',
            'scopes': ['sync:push', 'sync:pull'],
            'credentialVersion': 1,
            'renewalSecret': 'sec_boot_entropy_secret_1234567890',
            'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
          }),
        );
      } else if (request.uri.path ==
          '/onboarding/activation/device-sync-credential/confirm') {
        request.response.write(
          jsonEncode({
            'credentialId': 'cred-q80-boot',
            'tenantId': 'tenant-test',
            'deviceId': 'terminal-q80-matched',
            'scopes': ['sync:push', 'sync:pull'],
            'credentialVersion': 1,
            'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
          }),
        );
      } else if (request.uri.path ==
          '/onboarding/activation/attempts/attempt-pass-1/device-sync-credential') {
        request.response.write(
          jsonEncode({
            'credentialId': 'cred-q80-1234',
            'tenantId': 'tenant-test',
            'deviceId': 'terminal-q80-matched',
            'scopes': ['sync:push', 'sync:pull'],
            'credentialVersion': 1,
            'renewalSecret': 'sec_high_entropy_secret_1234567890',
            'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
          }),
        );
      } else if (request.uri.path ==
          '/onboarding/activation/attempts/attempt-mismatch/device-sync-credential') {
        request.response.write(
          jsonEncode({
            'credentialId': 'cred-q80-wrong',
            'tenantId': 'tenant-test',
            'deviceId': 'terminal-different-device',
            'scopes': ['sync:push', 'sync:pull'],
            'credentialVersion': 1,
            'renewalSecret': 'sec_high_entropy_secret_1234567890',
            'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
          }),
        );
      } else if (request.uri.path ==
          '/onboarding/activation/attempts/attempt-pass-1/device-sync-credential/confirm') {
        request.response.write(
          jsonEncode({
            'credentialId': 'cred-q80-1234',
            'tenantId': 'tenant-test',
            'deviceId': 'terminal-q80-matched',
            'scopes': ['sync:push', 'sync:pull'],
            'credentialVersion': 1,
            'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
          }),
        );
      } else if (request.uri.path ==
          '/onboarding/activation/attempts/attempt-revoked/device-sync-credential') {
        request.response.statusCode = 409;
        request.response.write(
          jsonEncode({
            'statusCode': 409,
            'error': 'DEVICE_RECOVERY_REQUIRED',
            'code': 'DEVICE_RECOVERY_REQUIRED',
            'message': 'Device credential requires explicit recovery',
          }),
        );
      } else {
        request.response.statusCode = 404;
        request.response.write(jsonEncode({'error': 'Not found'}));
      }
      await request.response.close();
    });

    port = DioActivationSyncPort(
      Dio(
        BaseOptions(
          baseUrl: 'http://${server.address.address}:${server.port}/',
        ),
      ),
      coordinator,
    );
  });

  tearDown(() async => server.close(force: true));

  test(
    'calls POST /onboarding/activation/attempts/:id/device-sync-credential, parses record, verifies deviceId, and leaves two-phase persistence to bootstrap coordinator',
    () async {
      final record = await port.provisionDeviceSyncCredential(
        attemptId: 'attempt-pass-1',
        expectedDeviceId: 'terminal-q80-matched',
      );

      expect(
        requests,
        contains(
          '/onboarding/activation/attempts/attempt-pass-1/device-sync-credential',
        ),
      );
      expect(record.credentialId, 'cred-q80-1234');
      expect(record.tenantId, 'tenant-test');
      expect(record.deviceId, 'terminal-q80-matched');
      expect(record.renewalSecret, 'sec_high_entropy_secret_1234567890');
      expect(record.credentialVersion, 1);
      expect(record.scopes, ['sync:push', 'sync:pull']);

      verifyNever(() => coordinator.provision(any()));
    },
  );

  test(
    'rejects and does not provision when returned deviceId does not match expected deviceId',
    () async {
      expect(
        () => port.provisionDeviceSyncCredential(
          attemptId: 'attempt-mismatch',
          expectedDeviceId: 'terminal-q80-matched',
        ),
        throwsA(isA<StateError>()),
      );

      verifyNever(() => coordinator.provision(any()));
    },
  );

  test(
    'confirmDeviceSyncCredential posts to confirm endpoint and preserves renewalSecret',
    () async {
      final record = await port.confirmDeviceSyncCredential(
        attemptId: 'attempt-pass-1',
        credentialId: 'cred-q80-1234',
        deviceId: 'terminal-q80-matched',
        credentialVersion: 1,
        renewalSecret: 'sec_high_entropy_secret_1234567890',
      );

      expect(
        requests,
        contains(
          '/onboarding/activation/attempts/attempt-pass-1/device-sync-credential/confirm',
        ),
      );
      expect(record.credentialId, 'cred-q80-1234');
      expect(record.renewalSecret, 'sec_high_entropy_secret_1234567890');
    },
  );

  test(
    'maps 409 DEVICE_RECOVERY_REQUIRED to DeviceSyncRecoveryRequiredException',
    () async {
      await expectLater(
        () => port.provisionDeviceSyncCredential(
          attemptId: 'attempt-revoked',
          expectedDeviceId: 'terminal-q80-matched',
        ),
        throwsA(isA<DeviceSyncRecoveryRequiredException>()),
      );
    },
  );

  test(
    'provisionBootstrapDeviceSyncCredential calls POST /onboarding/activation/device-sync-credential with deviceId without premature commit',
    () async {
      final record = await port.provisionBootstrapDeviceSyncCredential(
        deviceId: 'terminal-q80-matched',
      );

      expect(
        requests,
        contains('/onboarding/activation/device-sync-credential'),
      );
      expect(record.credentialId, 'cred-q80-boot');
      expect(record.deviceId, 'terminal-q80-matched');
      verifyNever(() => coordinator.provision(any()));
    },
  );

  test(
    'confirmBootstrapDeviceSyncCredential calls POST /onboarding/activation/device-sync-credential/confirm',
    () async {
      final record = await port.confirmBootstrapDeviceSyncCredential(
        credentialId: 'cred-q80-boot',
        deviceId: 'terminal-q80-matched',
        credentialVersion: 1,
        renewalSecret: 'sec_boot_entropy_secret_1234567890',
      );

      expect(
        requests,
        contains('/onboarding/activation/device-sync-credential/confirm'),
      );
      expect(record.credentialId, 'cred-q80-boot');
      expect(record.renewalSecret, 'sec_boot_entropy_secret_1234567890');
    },
  );
}
