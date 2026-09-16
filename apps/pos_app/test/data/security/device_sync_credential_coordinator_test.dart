import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';

class _MockDeviceSyncCredentialStore extends Mock implements DeviceSyncCredentialStore {}
class _MockDeviceSyncExchangePort extends Mock implements DeviceSyncExchangePort {}

String _buildMockJwt({required int expSeconds, Map<String, dynamic>? extraClaims}) {
  final header = base64Url.encode(utf8.encode(jsonEncode({'alg': 'HS256', 'typ': 'JWT'}))).replaceAll('=', '');
  final payloadMap = <String, dynamic>{
    'exp': expSeconds,
    'sub': 'device-01',
    if (extraClaims != null) ...extraClaims,
  };
  final payload = base64Url.encode(utf8.encode(jsonEncode(payloadMap))).replaceAll('=', '');
  return '$header.$payload.mockSignature';
}

void main() {
  late _MockDeviceSyncCredentialStore mockStore;
  late _MockDeviceSyncExchangePort mockExchangePort;
  const canonicalDeviceId = 'pos-canonical-terminal-99';

  final initialRecord = DeviceSyncCredentialRecord(
    credentialId: 'cred-v1-uuid',
    tenantId: 'tenant-test',
    deviceId: canonicalDeviceId,
    renewalSecret: 'sec_renewal_v1_abcdef1234567890',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2027, 1, 1),
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUp(() {
    mockStore = _MockDeviceSyncCredentialStore();
    mockExchangePort = _MockDeviceSyncExchangePort();
    registerFallbackValue(initialRecord);
  });

  DeviceSyncCredentialCoordinator createCoordinator({
    DateTime Function()? nowUtc,
    DeviceSyncCredentialStore? store,
    DeviceSyncExchangePort? exchangePort,
    Future<String> Function()? resolveDeviceId,
  }) {
    return DeviceSyncCredentialCoordinator(
      store: store ?? mockStore,
      exchangePort: exchangePort ?? mockExchangePort,
      resolveDeviceId: resolveDeviceId ?? (() async => canonicalDeviceId),
      nowUtc: nowUtc ?? () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );
  }

  group('DeviceSyncCredentialCoordinator', () {
    test('D: access expiry renews token automatically when expired or approaching expiration', () async {
      var currentTime = DateTime.utc(2026, 6, 1, 12, 0, 0);
      when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);

      final token1ExpSeconds = currentTime.add(const Duration(minutes: 10)).millisecondsSinceEpoch ~/ 1000;
      final token1Jwt = _buildMockJwt(expSeconds: token1ExpSeconds);

      final token2ExpSeconds = currentTime.add(const Duration(minutes: 25)).millisecondsSinceEpoch ~/ 1000;
      final token2Jwt = _buildMockJwt(expSeconds: token2ExpSeconds);

      var renewCallCount = 0;
      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenAnswer((_) async {
        renewCallCount++;
        if (renewCallCount == 1) {
          return DeviceSyncTokenResponse(
            accessToken: token1Jwt,
            tokenType: 'Bearer',
            expiresIn: 600,
          );
        } else {
          return DeviceSyncTokenResponse(
            accessToken: token2Jwt,
            tokenType: 'Bearer',
            expiresIn: 900,
          );
        }
      });

      final coordinator = createCoordinator(nowUtc: () => currentTime);

      // First call fetches token 1
      final token1 = await coordinator.getAccessToken();
      expect(token1, token1Jwt);
      expect(renewCallCount, 1);

      // Second call within validity window uses in-memory cached token without HTTP renewal
      currentTime = currentTime.add(const Duration(minutes: 5));
      final cachedToken = await coordinator.getAccessToken();
      expect(cachedToken, token1Jwt);
      expect(renewCallCount, 1);

      // Advance time past expiration (> 10 mins): coordinator automatically renews token
      currentTime = currentTime.add(const Duration(minutes: 6));
      final token2 = await coordinator.getAccessToken();
      expect(token2, token2Jwt);
      expect(renewCallCount, 2);
    });

    test('E: concurrent calls perform single renewal', () async {
      when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);

      final completer = Completer<DeviceSyncTokenResponse>();
      var renewCalls = 0;

      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenAnswer((_) {
        renewCalls++;
        return completer.future;
      });

      final coordinator = createCoordinator();

      // Launch 5 concurrent calls to getAccessToken()
      final futures = [
        coordinator.getAccessToken(),
        coordinator.getAccessToken(),
        coordinator.getAccessToken(),
        coordinator.getAccessToken(),
        coordinator.getAccessToken(),
      ];

      await pumpEventQueue();
      expect(renewCalls, 1);

      // Complete exchange response
      completer.complete(DeviceSyncTokenResponse(
        accessToken: _buildMockJwt(expSeconds: DateTime.utc(2026, 6, 1, 13, 0).millisecondsSinceEpoch ~/ 1000),
        tokenType: 'Bearer',
        expiresIn: 3600,
      ));

      final results = await Future.wait(futures);

      expect(renewCalls, 1);
      for (final result in results) {
        expect(result, results.first);
      }
    });

    test('I: revoked => surfaces typed blocked outcome, stored credential remains in store', () async {
      when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenThrow(const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'));

      final coordinator = createCoordinator();

      // Initial renewal fails with DeviceSyncRevokedException
      await expectLater(
        coordinator.getAccessToken(),
        throwsA(isA<DeviceSyncRevokedException>().having((e) => e.reason, 'reason', 'DEVICE_REVOKED')),
      );

      // Verify stored credential was NOT deleted from store (local outbox / local state intact)
      verifyNever(() => mockStore.clearCredential());

      // Subsequent attempt fails immediately with typed revoked without calling exchange port again
      await expectLater(
        coordinator.getAccessToken(),
        throwsA(isA<DeviceSyncRevokedException>()),
      );
      verify(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).called(1);
    });

    test('J: reprovision higher version resumes after revocation', () async {
      DeviceSyncCredentialRecord? stored = initialRecord;
      DeviceSyncCredentialRecord? candidate;
      when(() => mockStore.readCredential()).thenAnswer((_) async => stored);
      when(() => mockStore.stageCandidate(any())).thenAnswer((inv) async {
        candidate = inv.positionalArguments[0] as DeviceSyncCredentialRecord;
      });
      when(() => mockStore.readCandidate()).thenAnswer((_) async => candidate);
      when(() => mockStore.commitCandidate()).thenAnswer((_) async {
        stored = candidate;
        candidate = null;
      });
      when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {
        candidate = null;
      });

      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenThrow(const DeviceSyncRevokedException(reason: 'AUTH_BLOCKED'));

      final coordinator = createCoordinator();

      // Enter revoked state
      await expectLater(
        coordinator.getAccessToken(),
        throwsA(isA<DeviceSyncRevokedException>()),
      );

      final higherVersionRecord = initialRecord.copyWith(
        credentialId: 'cred-v2-uuid',
        renewalSecret: 'sec_renewal_v2_9876543210',
        credentialVersion: 2,
      );

      // Reprovision with higher version 2
      final provisioned = await coordinator.provision(higherVersionRecord);
      expect(provisioned.credentialVersion, 2);

      // Setup exchange port for version 2 to succeed
      const freshTokenJwt = 'mock.jwt.token.v2';
      when(() => mockExchangePort.renewToken(
            credentialId: higherVersionRecord.credentialId,
            deviceId: canonicalDeviceId,
            renewalSecret: higherVersionRecord.renewalSecret,
            tenantId: higherVersionRecord.tenantId,
            expectedCredentialVersion: higherVersionRecord.credentialVersion,
          )).thenAnswer((_) async => const DeviceSyncTokenResponse(
            accessToken: freshTokenJwt,
            tokenType: 'Bearer',
            expiresIn: 3600,
          ));

      // Coordinator is UNBLOCKED and successfully returns renewed token!
      final token = await coordinator.getAccessToken();
      expect(token, freshTokenJwt);
    });

    test('K: stale lower/equal response cannot overwrite newer credential', () async {
      final v2Record = initialRecord.copyWith(
        credentialId: 'cred-v2-uuid',
        credentialVersion: 2,
      );
      when(() => mockStore.readCredential()).thenAnswer((_) async => v2Record);

      final coordinator = createCoordinator();

      // Attempt to provision stale lower version 1
      final v1Stale = initialRecord.copyWith(
        credentialId: 'cred-v1-uuid',
        credentialVersion: 1,
      );
      expect(
        () => coordinator.provision(v1Stale),
        throwsA(isA<StaleCredentialVersionException>()
            .having((e) => e.currentVersion, 'currentVersion', 2)
            .having((e) => e.proposedVersion, 'proposedVersion', 1)),
      );

      // Attempt to provision equal version 2
      final v2Duplicate = initialRecord.copyWith(
        credentialId: 'cred-v2-duplicate',
        credentialVersion: 2,
      );
      expect(
        () => coordinator.provision(v2Duplicate),
        throwsA(isA<StaleCredentialVersionException>()
            .having((e) => e.currentVersion, 'currentVersion', 2)
            .having((e) => e.proposedVersion, 'proposedVersion', 2)),
      );

      // Store was never modified
      verifyNever(() => mockStore.writeCredential(any()));
    });

    test('invalidateAccessToken clears in-memory token, forcing renewal next call', () async {
      when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
      var callCount = 0;
      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenAnswer((_) async {
        callCount++;
        return DeviceSyncTokenResponse(
          accessToken: 'token-$callCount',
          tokenType: 'Bearer',
          expiresIn: 3600,
        );
      });

      final coordinator = createCoordinator();
      final token1 = await coordinator.getAccessToken();
      expect(token1, 'token-1');
      expect(callCount, 1);

      coordinator.invalidateAccessToken();

      final token2 = await coordinator.getAccessToken();
      expect(token2, 'token-2');
      expect(callCount, 2);
    });

    test('two-phase persistence verifies candidate before committing', () async {
      when(() => mockStore.readCredential()).thenAnswer((_) async => null);
      when(() => mockStore.stageCandidate(initialRecord)).thenAnswer((_) async {});
      when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {});

      // Simulate storage corrupted or readback mismatch on candidate readback
      final corruptRecord = initialRecord.copyWith(renewalSecret: 'tampered-secret');
      when(() => mockStore.readCandidate()).thenAnswer((_) async => corruptRecord);

      final coordinator = createCoordinator();

      await expectLater(
        () => coordinator.provision(initialRecord),
        throwsA(isA<DeviceSyncPersistenceVerificationException>()),
      );
      verifyNever(() => mockStore.commitCandidate());
      verify(() => mockStore.rollbackCandidate()).called(1);
    });

    test('rollback-safety: failed candidate verification leaves prior active credential intact', () async {
      final activeV1 = initialRecord.copyWith(credentialVersion: 1);
      final candidateV2 = initialRecord.copyWith(
        credentialId: 'cred-v2-id',
        credentialVersion: 2,
        renewalSecret: 'v2-secret-98765432101234567890',
      );

      when(() => mockStore.readCredential()).thenAnswer((_) async => activeV1);
      when(() => mockStore.stageCandidate(candidateV2)).thenAnswer((_) async {});
      // Candidate readback fails/tampered
      when(() => mockStore.readCandidate()).thenAnswer((_) async => candidateV2.copyWith(renewalSecret: 'corrupted'));
      when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {});

      final coordinator = createCoordinator();

      await expectLater(
        () => coordinator.provision(candidateV2),
        throwsA(isA<DeviceSyncPersistenceVerificationException>()),
      );

      // Active credential was NEVER committed with candidate
      verifyNever(() => mockStore.commitCandidate());
      verify(() => mockStore.rollbackCandidate()).called(1);

      // Prior active credential remains intact in store
      final currentActive = await mockStore.readCredential();
      expect(currentActive, equals(activeV1));
      expect(currentActive?.credentialVersion, 1);
    });

    test('forwards record tenantId and credentialVersion through exchange port during renewal', () async {
      when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
      when(() => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenAnswer((_) async => const DeviceSyncTokenResponse(
            accessToken: 'valid.token.jwt',
            tokenType: 'Bearer',
            expiresIn: 3600,
          ));

      final coordinator = createCoordinator();
      final token = await coordinator.getAccessToken();
      expect(token, 'valid.token.jwt');

      verify(() => mockExchangePort.renewToken(
            credentialId: initialRecord.credentialId,
            deviceId: canonicalDeviceId,
            renewalSecret: initialRecord.renewalSecret,
            tenantId: initialRecord.tenantId,
            expectedCredentialVersion: initialRecord.credentialVersion,
          )).called(1);
    });

    group('token response contract verification', () {
      test('rejects blank access token without caching', () async {
        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => const DeviceSyncTokenResponse(
              accessToken: '   ',
              tokenType: 'Bearer',
              expiresIn: 3600,
            ));

        final coordinator = createCoordinator();
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );

        // Does not mark coordinator as revoked
        expect(coordinator.isRevoked, isFalse);

        // Subsequent valid response succeeds cleanly without poisoned cache
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => const DeviceSyncTokenResponse(
              accessToken: 'recovered.valid.jwt',
              tokenType: 'Bearer',
              expiresIn: 3600,
            ));

        final validToken = await coordinator.getAccessToken();
        expect(validToken, 'recovered.valid.jwt');
      });

      test('rejects non-Bearer token type without caching', () async {
        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => const DeviceSyncTokenResponse(
              accessToken: 'valid.token.jwt',
              tokenType: 'Basic',
              expiresIn: 3600,
            ));

        final coordinator = createCoordinator();
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );
      });

      test('rejects non-positive expiresIn without caching', () async {
        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => const DeviceSyncTokenResponse(
              accessToken: 'valid.token.jwt',
              tokenType: 'Bearer',
              expiresIn: 0,
            ));

        final coordinator = createCoordinator();
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );
      });

      test('rejects negative expiresIn without caching', () async {
        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => const DeviceSyncTokenResponse(
              accessToken: 'valid.token.jwt',
              tokenType: 'Bearer',
              expiresIn: -60,
            ));

        final coordinator = createCoordinator();
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );
      });

      test('rejects explicit expiresAt in the past without caching', () async {
        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => DeviceSyncTokenResponse(
              accessToken: 'valid.token.jwt',
              tokenType: 'Bearer',
              expiresIn: 3600,
              expiresAt: DateTime.utc(2025, 1, 1),
            ));

        final coordinator = createCoordinator(
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );
      });

      test('rejects token when JWT exp is already in the past without caching', () async {
        final pastExpSeconds = DateTime.utc(2026, 6, 1, 11, 0, 0).millisecondsSinceEpoch ~/ 1000;
        final expiredJwt = _buildMockJwt(expSeconds: pastExpSeconds);

        when(() => mockStore.readCredential()).thenAnswer((_) async => initialRecord);
        when(() => mockExchangePort.renewToken(
              credentialId: any(named: 'credentialId'),
              deviceId: any(named: 'deviceId'),
              renewalSecret: any(named: 'renewalSecret'),
              tenantId: any(named: 'tenantId'),
              expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
            )).thenAnswer((_) async => DeviceSyncTokenResponse(
              accessToken: expiredJwt,
              tokenType: 'Bearer',
              expiresIn: 3600,
            ));

        final coordinator = createCoordinator(
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );
        await expectLater(
          coordinator.getAccessToken(),
          throwsA(isA<DeviceSyncMalformedResponseException>()),
        );
      });
    });
  });
}
