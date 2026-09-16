import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/security/device_sync_bootstrap_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';
import 'support/fake_device_sync_credential_store.dart';

class _MockDeviceSyncCredentialStore extends Mock
    implements DeviceSyncCredentialStore {}

class _MockActivationSyncPort extends Mock implements ActivationSyncPort {}

class _MockDeviceSyncExchangePort extends Mock
    implements DeviceSyncExchangePort {}

void main() {
  late _MockDeviceSyncCredentialStore mockStore;
  late _MockActivationSyncPort mockActivationSyncPort;
  late _MockDeviceSyncExchangePort mockExchangePort;
  late DeviceSyncCredentialCoordinator credentialCoordinator;

  const canonicalDeviceId = 'pos-term-q80-001';
  const testAttemptId = 'att-test-attempt-uuid';
  const testTenantId = 'tenant-test-100';

  final ownerUser = const User(
    id: 'user-owner-1',
    name: 'Owner Alice',
    role: UserRole.owner,
    isActive: true,
    tenantId: testTenantId,
  );

  final managerUser = const User(
    id: 'user-mgr-1',
    name: 'Manager Bob',
    role: UserRole.manager,
    isActive: true,
    tenantId: testTenantId,
  );

  final cashierUser = const User(
    id: 'user-cashier-1',
    name: 'Cashier Charlie',
    role: UserRole.cashier,
    isActive: true,
    tenantId: testTenantId,
  );

  final pendingRecordV1 = DeviceSyncCredentialRecord(
    credentialId: 'cred-v1-uuid',
    tenantId: testTenantId,
    deviceId: canonicalDeviceId,
    renewalSecret:
        'secret-entropy-v1-64-bytes-long-padding-for-security-assurance!!',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2026, 6, 1, 12, 15, 0), // 15 min bounded pending
    scopes: const ['sync:push', 'sync:pull'],
  );

  final activeRecordV1 = DeviceSyncCredentialRecord(
    credentialId: 'cred-v1-uuid',
    tenantId: testTenantId,
    deviceId: canonicalDeviceId,
    renewalSecret:
        'secret-entropy-v1-64-bytes-long-padding-for-security-assurance!!',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0), // 1 year active
    scopes: const ['sync:push', 'sync:pull'],
  );

  final pendingRecordV2 = DeviceSyncCredentialRecord(
    credentialId: 'cred-v2-uuid',
    tenantId: testTenantId,
    deviceId: canonicalDeviceId,
    renewalSecret:
        'secret-entropy-v2-64-bytes-long-padding-for-security-assurance!!',
    credentialVersion: 2,
    expiresAt: DateTime.utc(2026, 6, 1, 12, 15, 0),
    scopes: const ['sync:push', 'sync:pull'],
  );

  final activeRecordV2 = DeviceSyncCredentialRecord(
    credentialId: 'cred-v2-uuid',
    tenantId: testTenantId,
    deviceId: canonicalDeviceId,
    renewalSecret:
        'secret-entropy-v2-64-bytes-long-padding-for-security-assurance!!',
    credentialVersion: 2,
    expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUpAll(() {
    registerFallbackValue(pendingRecordV1);
    registerFallbackValue(pendingRecordV2);
  });

  setUp(() {
    mockStore = _MockDeviceSyncCredentialStore();
    mockActivationSyncPort = _MockActivationSyncPort();
    mockExchangePort = _MockDeviceSyncExchangePort();

    when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
    when(() => mockStore.readCredential()).thenAnswer((_) async => null);
    when(() => mockStore.stageCandidate(any())).thenAnswer((_) async {});
    when(() => mockStore.commitCandidate()).thenAnswer((_) async {});
    when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {});
    when(() => mockStore.clearCredential()).thenAnswer((_) async {});

    credentialCoordinator = DeviceSyncCredentialCoordinator(
      store: mockStore,
      exchangePort: mockExchangePort,
      resolveDeviceId: () async => canonicalDeviceId,
      nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );
  });

  DeviceSyncBootstrapCoordinator createBootstrapCoordinator({
    Future<String> Function()? resolveDeviceId,
    Future<String?> Function()? resolveAttemptId,
    DateTime Function()? nowUtc,
    DeviceSyncCredentialCoordinator? coord,
  }) {
    return DeviceSyncBootstrapCoordinator(
      store: mockStore,
      activationSyncPort: mockActivationSyncPort,
      resolveDeviceId: resolveDeviceId ?? (() async => canonicalDeviceId),
      resolveAttemptId: resolveAttemptId ?? (() async => testAttemptId),
      credentialCoordinator: coord ?? credentialCoordinator,
      nowUtc: nowUtc ?? (() => DateTime.utc(2026, 6, 1, 12, 0, 0)),
    );
  }

  group('DeviceSyncBootstrapCoordinator - Lifecycle & Security', () {
    test(
      '1. first OWNER login: MISSING -> provision -> stage/verify -> confirm -> commit ACTIVE',
      () async {
        var candidateReads = 0;
        when(() => mockStore.readCandidate()).thenAnswer((_) async {
          candidateReads++;
          return candidateReads > 1 ? pendingRecordV1 : null;
        });

        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => pendingRecordV1);

        when(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenAnswer((_) async => activeRecordV1);

        final coordinator = createBootstrapCoordinator();
        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.provisionedAndConfirmed),
        );
        expect(result.record, equals(activeRecordV1));

        // Verification order: provision -> stageCandidate -> readCandidate -> confirm -> stageCandidate (re-stage confirmed) -> commitCandidate
        verifyInOrder([
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
          () => mockStore.stageCandidate(pendingRecordV1),
          () => mockStore.readCandidate(),
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
          () => mockStore.stageCandidate(activeRecordV1),
          () => mockStore.commitCandidate(),
        ]);
      },
    );

    test(
      '2. second-N no-op: ACTIVE local valid => no-op, no server calls',
      () async {
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
        when(
          () => mockStore.readCredential(),
        ).thenAnswer((_) async => activeRecordV1);

        final coordinator = createBootstrapCoordinator();
        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.noOpAlreadyActive),
        );
        expect(result.record, equals(activeRecordV1));

        // Absolutely no network calls to provision or confirm
        verifyNever(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            expectedDeviceId: any(named: 'expectedDeviceId'),
          ),
        );
        verifyNever(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            credentialVersion: any(named: 'credentialVersion'),
            renewalSecret: any(named: 'renewalSecret'),
          ),
        );
      },
    );

    test(
      '3. non-owner no call: manager / cashier login skips bootstrap completely',
      () async {
        final coordinator = createBootstrapCoordinator();

        final mgrResult = await coordinator.bootstrap(user: managerUser);
        expect(
          mgrResult.status,
          equals(DeviceSyncBootstrapStatus.skippedNonOwner),
        );

        final cashierResult = await coordinator.bootstrap(user: cashierUser);
        expect(
          cashierResult.status,
          equals(DeviceSyncBootstrapStatus.skippedNonOwner),
        );

        verifyZeroInteractions(mockStore);
        verifyZeroInteractions(mockActivationSyncPort);
      },
    );

    test(
      '4. persistence failure no confirm: staging candidate failure aborts before confirm',
      () async {
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
        when(() => mockStore.readCredential()).thenAnswer((_) async => null);
        when(() => mockStore.stageCandidate(any())).thenAnswer((_) async {});
        when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {});

        // Simulate verification readback mismatch (corrupted candidate or null)
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);

        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => pendingRecordV1);

        final coordinator = createBootstrapCoordinator();

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<DeviceSyncPersistenceVerificationException>()),
        );

        // Confirm MUST NOT be called!
        verifyNever(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            credentialVersion: any(named: 'credentialVersion'),
            renewalSecret: any(named: 'renewalSecret'),
          ),
        );
        verifyNever(() => mockStore.commitCandidate());
        verify(() => mockStore.rollbackCandidate()).called(1);
      },
    );

    test(
      '5. confirm network failure retry: candidate stays staged, retry confirms and commits',
      () async {
        // Step A: First attempt: confirm fails with network exception
        var candidateReads = 0;
        when(() => mockStore.readCandidate()).thenAnswer((_) async {
          candidateReads++;
          return candidateReads > 1 ? pendingRecordV1 : null;
        });

        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => pendingRecordV1);

        when(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenThrow(Exception('Simulated network timeout during confirm'));

        final coordinator = createBootstrapCoordinator();

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<Exception>()),
        );

        // Rollback MUST NOT be called on network failure (candidate remains staged for retry)
        verifyNever(() => mockStore.rollbackCandidate());
        verifyNever(() => mockStore.commitCandidate());

        // Step B: Second attempt: coordinator sees staged candidate, retries confirm with stored secret
        reset(mockStore);
        reset(mockActivationSyncPort);

        when(
          () => mockStore.readCandidate(),
        ).thenAnswer((_) async => pendingRecordV1);
        when(() => mockStore.stageCandidate(any())).thenAnswer((_) async {});
        when(() => mockStore.commitCandidate()).thenAnswer((_) async {});

        when(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenAnswer((_) async => activeRecordV1);

        final retryResult = await coordinator.bootstrap(user: ownerUser);

        expect(
          retryResult.status,
          equals(DeviceSyncBootstrapStatus.confirmedStagedCandidate),
        );
        expect(retryResult.record, equals(activeRecordV1));

        // Provision is NOT called again on retry
        verifyNever(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            expectedDeviceId: any(named: 'expectedDeviceId'),
          ),
        );
        verify(() => mockStore.stageCandidate(activeRecordV1)).called(1);
        verify(() => mockStore.commitCandidate()).called(1);
      },
    );

    test(
      '6. missing-local pending replacement: server pending exists but local missing, issues N+1',
      () async {
        var candidateReads = 0;
        when(() => mockStore.readCandidate()).thenAnswer((_) async {
          candidateReads++;
          return candidateReads > 1 ? pendingRecordV2 : null;
        });

        // Server provision replaced pending V1 with V2
        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => pendingRecordV2);

        when(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV2.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: 2,
            renewalSecret: pendingRecordV2.renewalSecret,
          ),
        ).thenAnswer((_) async => activeRecordV2);

        final coordinator = createBootstrapCoordinator();
        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.provisionedAndConfirmed),
        );
        expect(result.record!.credentialVersion, equals(2));
        verify(() => mockStore.commitCandidate()).called(1);
      },
    );

    test(
      '7. stale N rejection: candidate confirm failure with recovery required rolls back candidate',
      () async {
        // Staged candidate V1 was superseded on server
        when(
          () => mockStore.readCandidate(),
        ).thenAnswer((_) async => pendingRecordV1);
        when(() => mockStore.rollbackCandidate()).thenAnswer((_) async {});

        when(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: testAttemptId,
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: 1,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenThrow(
          const DeviceSyncRecoveryRequiredException(
            'Candidate version is stale',
          ),
        );

        final coordinator = createBootstrapCoordinator();

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<DeviceSyncRecoveryRequiredException>()),
        );

        verify(() => mockStore.rollbackCandidate()).called(1);
      },
    );

    test(
      '8. revoked/retired block: coordinator in revoked state blocks bootstrap',
      () async {
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
        when(
          () => mockStore.readCredential(),
        ).thenAnswer((_) async => activeRecordV1);

        // Make coordinator report revoked
        when(
          () => mockExchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          ),
        ).thenThrow(const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'));

        // Force coordinator into revoked state
        try {
          await credentialCoordinator.getAccessToken();
        } catch (_) {}
        expect(credentialCoordinator.isRevoked, isTrue);

        final coordinator = createBootstrapCoordinator(
          coord: credentialCoordinator,
        );

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<DeviceSyncRecoveryRequiredException>()),
        );

        // Never auto-provisions when revoked
        verifyNever(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            expectedDeviceId: any(named: 'expectedDeviceId'),
          ),
        );
      },
    );

    test(
      '9. server preconditions: server returns 409 DEVICE_RECOVERY_REQUIRED during provision',
      () async {
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
        when(() => mockStore.readCredential()).thenAnswer((_) async => null);

        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenThrow(
          const DeviceSyncRecoveryRequiredException(
            'Latest credential was REVOKED; auto-bootstrap blocked',
          ),
        );

        final coordinator = createBootstrapCoordinator();

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<DeviceSyncRecoveryRequiredException>()),
        );

        verifyNever(() => mockStore.stageCandidate(any()));
        verifyNever(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            credentialVersion: any(named: 'credentialVersion'),
            renewalSecret: any(named: 'renewalSecret'),
          ),
        );
      },
    );

    test(
      '10. server preconditions: provisioned deviceId does not match canonical terminal',
      () async {
        when(() => mockStore.readCandidate()).thenAnswer((_) async => null);
        when(() => mockStore.readCredential()).thenAnswer((_) async => null);

        final mismatchedRecord = DeviceSyncCredentialRecord(
          credentialId: 'cred-mismatch-id',
          tenantId: testTenantId,
          deviceId: 'WRONG-TERMINAL-ID',
          renewalSecret:
              'valid-secret-64-chars-long-with-padding-bytes-for-entropy-requirement!!',
          credentialVersion: 1,
          expiresAt: DateTime.utc(2026, 6, 1, 12, 15, 0),
          scopes: const ['sync:push', 'sync:pull'],
        );

        when(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: testAttemptId,
            expectedDeviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => mismatchedRecord);

        final coordinator = createBootstrapCoordinator();

        await expectLater(
          () => coordinator.bootstrap(user: ownerUser),
          throwsA(isA<DeviceSyncPersistenceVerificationException>()),
        );

        verifyNever(
          () => mockActivationSyncPort.confirmDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            credentialVersion: any(named: 'credentialVersion'),
            renewalSecret: any(named: 'renewalSecret'),
          ),
        );
      },
    );

    test(
      '11. logout / cashier switch leaves credential: store is never cleared by human logout',
      () async {
        // Ensure coordinator never exposes a clear or delete operation during human session end
        when(
          () => mockStore.readCredential(),
        ).thenAnswer((_) async => activeRecordV1);

        final coordinator = createBootstrapCoordinator();
        final result = await coordinator.bootstrap(user: ownerUser);
        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.noOpAlreadyActive),
        );

        // After user logout:
        verifyNever(() => mockStore.clearCredential());
        verifyNever(() => mockStore.rollbackCandidate());
      },
    );
  });

  group('DeviceSyncBootstrapCoordinator - Derived Bootstrap Seam (No attemptId)', () {
    test(
      'first OWNER login without resolveAttemptId calls derived endpoints and commits ACTIVE',
      () async {
        var candidateReads = 0;
        when(() => mockStore.readCandidate()).thenAnswer((_) async {
          candidateReads++;
          return candidateReads > 1 ? pendingRecordV1 : null;
        });

        when(
          () => mockActivationSyncPort.provisionBootstrapDeviceSyncCredential(
            deviceId: canonicalDeviceId,
          ),
        ).thenAnswer((_) async => pendingRecordV1);

        when(
          () => mockActivationSyncPort.confirmBootstrapDeviceSyncCredential(
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenAnswer((_) async => activeRecordV1);

        // Instantiate coordinator WITHOUT resolveAttemptId (production pattern)
        final coordinator = DeviceSyncBootstrapCoordinator(
          store: mockStore,
          activationSyncPort: mockActivationSyncPort,
          resolveDeviceId: () async => canonicalDeviceId,
          credentialCoordinator: credentialCoordinator,
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );

        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.provisionedAndConfirmed),
        );
        expect(result.record, equals(activeRecordV1));
        expect(
          coordinator.lastResult?.status,
          equals(DeviceSyncBootstrapStatus.provisionedAndConfirmed),
        );
        expect(coordinator.lastError, isNull);

        // Verification order: provisionBootstrap -> stage -> readCandidate -> confirmBootstrap -> stageCandidate (re-stage confirmed) -> commit
        verifyInOrder([
          () => mockActivationSyncPort.provisionBootstrapDeviceSyncCredential(
            deviceId: canonicalDeviceId,
          ),
          () => mockStore.stageCandidate(pendingRecordV1),
          () => mockStore.readCandidate(),
          () => mockActivationSyncPort.confirmBootstrapDeviceSyncCredential(
            credentialId: pendingRecordV1.credentialId,
            deviceId: canonicalDeviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
          () => mockStore.stageCandidate(activeRecordV1),
          () => mockStore.commitCandidate(),
        ]);
        verifyNever(
          () => mockActivationSyncPort.provisionDeviceSyncCredential(
            attemptId: any(named: 'attemptId'),
            expectedDeviceId: any(named: 'expectedDeviceId'),
          ),
        );
      },
    );

    test(
      'second login with active credential is no-op and makes no network calls',
      () async {
        when(
          () => mockStore.readCredential(),
        ).thenAnswer((_) async => activeRecordV1);

        final coordinator = DeviceSyncBootstrapCoordinator(
          store: mockStore,
          activationSyncPort: mockActivationSyncPort,
          resolveDeviceId: () async => canonicalDeviceId,
          credentialCoordinator: credentialCoordinator,
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );

        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.noOpAlreadyActive),
        );
        expect(result.record, equals(activeRecordV1));
        verifyNever(
          () => mockActivationSyncPort.provisionBootstrapDeviceSyncCredential(
            deviceId: any(named: 'deviceId'),
          ),
        );
        verifyNever(
          () => mockActivationSyncPort.confirmBootstrapDeviceSyncCredential(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            credentialVersion: any(named: 'credentialVersion'),
            renewalSecret: any(named: 'renewalSecret'),
          ),
        );
      },
    );

    test(
      'staged pending candidate retry without resolveAttemptId calls confirmBootstrap',
      () async {
        when(
          () => mockStore.readCandidate(),
        ).thenAnswer((_) async => pendingRecordV1);
        when(
          () => mockActivationSyncPort.confirmBootstrapDeviceSyncCredential(
            credentialId: pendingRecordV1.credentialId,
            deviceId: pendingRecordV1.deviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).thenAnswer((_) async => activeRecordV1);

        final coordinator = DeviceSyncBootstrapCoordinator(
          store: mockStore,
          activationSyncPort: mockActivationSyncPort,
          resolveDeviceId: () async => canonicalDeviceId,
          credentialCoordinator: credentialCoordinator,
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );

        final result = await coordinator.bootstrap(user: ownerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.confirmedStagedCandidate),
        );
        expect(result.record, equals(activeRecordV1));
        verify(
          () => mockActivationSyncPort.confirmBootstrapDeviceSyncCredential(
            credentialId: pendingRecordV1.credentialId,
            deviceId: pendingRecordV1.deviceId,
            credentialVersion: pendingRecordV1.credentialVersion,
            renewalSecret: pendingRecordV1.renewalSecret,
          ),
        ).called(1);
        verify(() => mockStore.commitCandidate()).called(1);
      },
    );

    test(
      'non-owner user login skips bootstrap completely without network calls',
      () async {
        final coordinator = DeviceSyncBootstrapCoordinator(
          store: mockStore,
          activationSyncPort: mockActivationSyncPort,
          resolveDeviceId: () async => canonicalDeviceId,
          credentialCoordinator: credentialCoordinator,
          nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
        );

        final result = await coordinator.bootstrap(user: managerUser);

        expect(
          result.status,
          equals(DeviceSyncBootstrapStatus.skippedNonOwner),
        );
        verifyNever(
          () => mockActivationSyncPort.provisionBootstrapDeviceSyncCredential(
            deviceId: any(named: 'deviceId'),
          ),
        );
      },
    );
  });

  group(
    'DeviceSyncBootstrapCoordinator - Confirmed Long-Lived Expiry & Mismatch Protection',
    () {
      late FakeDeviceSyncCredentialStore fakeStore;

      setUp(() {
        fakeStore = FakeDeviceSyncCredentialStore();
      });

      test(
        'fresh provision+confirm: re-stages confirmed record so final active store has long-lived expiry',
        () async {
          when(
            () => mockActivationSyncPort.provisionDeviceSyncCredential(
              attemptId: testAttemptId,
              expectedDeviceId: canonicalDeviceId,
            ),
          ).thenAnswer((_) async => pendingRecordV1);

          when(
            () => mockActivationSyncPort.confirmDeviceSyncCredential(
              attemptId: testAttemptId,
              credentialId: pendingRecordV1.credentialId,
              deviceId: canonicalDeviceId,
              credentialVersion: pendingRecordV1.credentialVersion,
              renewalSecret: pendingRecordV1.renewalSecret,
            ),
          ).thenAnswer((_) async => activeRecordV1);

          final coordinator = DeviceSyncBootstrapCoordinator(
            store: fakeStore,
            activationSyncPort: mockActivationSyncPort,
            resolveDeviceId: () async => canonicalDeviceId,
            resolveAttemptId: () async => testAttemptId,
            credentialCoordinator: credentialCoordinator,
            nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
          );

          final result = await coordinator.bootstrap(user: ownerUser);

          expect(
            result.status,
            equals(DeviceSyncBootstrapStatus.provisionedAndConfirmed),
          );
          expect(result.record, equals(activeRecordV1));

          final committedActive = await fakeStore.readCredential();
          expect(committedActive, isNotNull);
          expect(
            committedActive!.credentialId,
            equals(activeRecordV1.credentialId),
          );
          expect(committedActive.expiresAt, equals(activeRecordV1.expiresAt));
          expect(
            committedActive.expiresAt,
            isNot(equals(pendingRecordV1.expiresAt)),
          );
          expect(committedActive, equals(activeRecordV1));
          expect(await fakeStore.readCandidate(), isNull);
        },
      );

      test(
        'staged candidate retry: re-stages confirmed record so final active store has long-lived expiry',
        () async {
          await fakeStore.stageCandidate(pendingRecordV1);

          when(
            () => mockActivationSyncPort.confirmDeviceSyncCredential(
              attemptId: testAttemptId,
              credentialId: pendingRecordV1.credentialId,
              deviceId: canonicalDeviceId,
              credentialVersion: pendingRecordV1.credentialVersion,
              renewalSecret: pendingRecordV1.renewalSecret,
            ),
          ).thenAnswer((_) async => activeRecordV1);

          final coordinator = DeviceSyncBootstrapCoordinator(
            store: fakeStore,
            activationSyncPort: mockActivationSyncPort,
            resolveDeviceId: () async => canonicalDeviceId,
            resolveAttemptId: () async => testAttemptId,
            credentialCoordinator: credentialCoordinator,
            nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
          );

          final result = await coordinator.bootstrap(user: ownerUser);

          expect(
            result.status,
            equals(DeviceSyncBootstrapStatus.confirmedStagedCandidate),
          );
          expect(result.record, equals(activeRecordV1));

          final committedActive = await fakeStore.readCredential();
          expect(committedActive, isNotNull);
          expect(
            committedActive!.credentialId,
            equals(activeRecordV1.credentialId),
          );
          expect(committedActive.expiresAt, equals(activeRecordV1.expiresAt));
          expect(
            committedActive.expiresAt,
            isNot(equals(pendingRecordV1.expiresAt)),
          );
          expect(committedActive, equals(activeRecordV1));
          expect(await fakeStore.readCandidate(), isNull);
        },
      );

      test(
        'confirmed response mismatch fails closed and does not overwrite staged candidate',
        () async {
          await fakeStore.stageCandidate(pendingRecordV1);

          final mismatchedConfirmed = DeviceSyncCredentialRecord(
            credentialId: 'cred-mismatched-uuid',
            tenantId: testTenantId,
            deviceId: canonicalDeviceId,
            renewalSecret: pendingRecordV1.renewalSecret,
            credentialVersion: pendingRecordV1.credentialVersion,
            expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
            scopes: const ['sync:push', 'sync:pull'],
          );

          when(
            () => mockActivationSyncPort.confirmDeviceSyncCredential(
              attemptId: testAttemptId,
              credentialId: pendingRecordV1.credentialId,
              deviceId: canonicalDeviceId,
              credentialVersion: pendingRecordV1.credentialVersion,
              renewalSecret: pendingRecordV1.renewalSecret,
            ),
          ).thenAnswer((_) async => mismatchedConfirmed);

          final coordinator = DeviceSyncBootstrapCoordinator(
            store: fakeStore,
            activationSyncPort: mockActivationSyncPort,
            resolveDeviceId: () async => canonicalDeviceId,
            resolveAttemptId: () async => testAttemptId,
            credentialCoordinator: credentialCoordinator,
            nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
          );

          await expectLater(
            () => coordinator.bootstrap(user: ownerUser),
            throwsA(isA<DeviceSyncPersistenceVerificationException>()),
          );

          // Fails closed: active is never written, and candidate is NOT overwritten
          expect(await fakeStore.readCredential(), isNull);
          final retainedCandidate = await fakeStore.readCandidate();
          expect(retainedCandidate, isNotNull);
          expect(
            retainedCandidate!.credentialId,
            equals(pendingRecordV1.credentialId),
          );
          expect(
            retainedCandidate.expiresAt,
            equals(pendingRecordV1.expiresAt),
          );
        },
      );
    },
  );
}
