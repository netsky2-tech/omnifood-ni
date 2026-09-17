import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/security/app_private_device_sync_credential_store.dart';
import 'package:pos_app/data/security/flutter_secure_device_sync_credential_store.dart';
import 'package:pos_app/data/security/resilient_device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

void main() {
  setUpAll(() {
    registerFallbackValue(LocalConfigEntity(key: '', value: ''));
  });

  late _MockFlutterSecureStorage mockSecureStorage;
  late _MockLocalConfigDao mockLocalConfigDao;
  final testRecord = DeviceSyncCredentialRecord(
    credentialId: 'cred-test-01',
    tenantId: 'tenant-test-01',
    deviceId: 'pos-test-terminal-01',
    renewalSecret: 'secret_1234567890abcdef',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2026, 12, 31, 23, 59, 59),
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUp(() {
    mockSecureStorage = _MockFlutterSecureStorage();
    mockLocalConfigDao = _MockLocalConfigDao();
  });

  group('FlutterSecureDeviceSyncCredentialStore', () {
    test(
      'writes, reads, and deletes using dedicated device sync namespace',
      () async {
        final inMemorySecure = <String, String>{};
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (invocation) async =>
              inMemorySecure[invocation.namedArguments[#key] as String],
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((invocation) async {
          inMemorySecure[invocation.namedArguments[#key] as String] =
              invocation.namedArguments[#value] as String;
        });
        when(() => mockSecureStorage.delete(key: any(named: 'key'))).thenAnswer(
          (invocation) async {
            inMemorySecure.remove(invocation.namedArguments[#key] as String);
          },
        );

        final store = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 200),
        );

        await store.writeCredential(testRecord);
        final readBack = await store.readCredential();

        expect(readBack, equals(testRecord));
        verify(
          () => mockSecureStorage.write(
            key: 'device_sync_credential_v1',
            value: any(named: 'value'),
          ),
        ).called(1);

        await store.clearCredential();
        expect(await store.readCredential(), isNull);
      },
    );

    test(
      'circuit breaker opens after first failure and subsequent calls fail instantly',
      () async {
        var nativeCalls = 0;
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer((
          _,
        ) async {
          nativeCalls++;
          throw StateError('Keystore daemon dead');
        });

        final store = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 50),
        );

        // First call: hits native, throws, opens circuit
        expect(
          () => store.readCredential(),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
        await pumpEventQueue();
        expect(nativeCalls, 1);

        // Second call: circuit is OPEN / degraded, immediately throws without touching native
        expect(
          () => store.readCredential(),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
        expect(nativeCalls, 1);
      },
    );
  });

  group('AppPrivateDeviceSyncCredentialStore (Fallback Store)', () {
    test(
      'writes and reads valid DeviceSyncCredentialRecord via local config dao',
      () async {
        LocalConfigEntity? storedEntity;
        when(
          () => mockLocalConfigDao.getConfigByKey(
            'device_sync_credential_fallback_v1',
          ),
        ).thenAnswer((_) async => storedEntity);
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          storedEntity = inv.positionalArguments[0] as LocalConfigEntity;
        });

        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        await fallbackStore.writeCredential(testRecord);
        final readBack = await fallbackStore.readCredential();

        expect(readBack, equals(testRecord));
        expect(storedEntity?.key, 'device_sync_credential_fallback_v1');
      },
    );

    test('L: fallback schema cannot store prohibited fields', () async {
      final fallbackStore = AppPrivateDeviceSyncCredentialStore(
        mockLocalConfigDao,
      );

      // Attempting to write prohibited fields via raw JSON or corrupted payload throws
      final prohibitedPayloads = [
        {'accessToken': 'jwt.secret.token', ...testRecord.toJson()},
        {'password': 'super-secret-password', ...testRecord.toJson()},
        {'pin': '1234', ...testRecord.toJson()},
        {'pinHash': 'hash1234', ...testRecord.toJson()},
        {'totpSecretSeed': 'seed123', ...testRecord.toJson()},
        {'cashier': 'cashier-user-1', ...testRecord.toJson()},
        {'role': 'admin', ...testRecord.toJson()},
      ];

      for (final payload in prohibitedPayloads) {
        expect(
          () => fallbackStore.writeRawJson(payload),
          throwsA(isA<DeviceSyncProhibitedFieldException>()),
          reason:
              'Fallback store must strictly reject prohibited fields: $payload',
        );
      }
    });

    test(
      'staging candidate and rollback does NOT overwrite active fallback credential',
      () async {
        final inMemoryConfigs = <String, LocalConfigEntity>{};
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });
        when(() => mockLocalConfigDao.deleteConfig(any())).thenAnswer((
          inv,
        ) async {
          inMemoryConfigs.remove(inv.positionalArguments[0] as String);
        });

        final store = AppPrivateDeviceSyncCredentialStore(mockLocalConfigDao);

        // 1. Initial active
        await store.writeCredential(testRecord);
        expect(await store.readCredential(), equals(testRecord));

        // 2. Stage candidate v2
        final candidateV2 = testRecord.copyWith(
          credentialId: 'cred-v2',
          credentialVersion: 2,
        );
        await store.stageCandidate(candidateV2);

        // Active unchanged
        expect(await store.readCredential(), equals(testRecord));
        expect(await store.readCandidate(), equals(candidateV2));

        // 3. Rollback candidate
        await store.rollbackCandidate();
        expect(await store.readCandidate(), isNull);
        expect(await store.readCredential(), equals(testRecord));

        // 4. Commit candidate
        await store.stageCandidate(candidateV2);
        await store.commitCandidate();
        expect(await store.readCandidate(), isNull);
        expect(await store.readCredential(), equals(candidateV2));
      },
    );
  });

  group('ResilientDeviceSyncCredentialStore (Mandatory Tests A, B, C)', () {
    test(
      'A: healthy Keystore writes a verified fallback safety replica',
      () async {
        final inMemorySecure = <String, String>{};
        final inMemoryConfigs = <String, LocalConfigEntity>{};
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (inv) async => inMemorySecure[inv.namedArguments[#key] as String],
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((inv) async {
          inMemorySecure[inv.namedArguments[#key] as String] =
              inv.namedArguments[#value] as String;
        });
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        await resilientStore.writeCredential(testRecord);
        final readBack = await resilientStore.readCredential();

        expect(readBack, equals(testRecord));
        expect(
          await fallbackStore.readCredential(),
          equals(testRecord),
          reason: 'Fallback must remain a verified safety replica',
        );
      },
    );

    test(
      'B: hung Keystore first failure opens circuit and fallback works without retry storm',
      () async {
        var secureStorageCalls = 0;
        LocalConfigEntity? fallbackEntity;

        // Keystore hangs or throws
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((_) async {
          secureStorageCalls++;
          throw TimeoutException('Keystore locked up');
        });
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer((
          _,
        ) async {
          secureStorageCalls++;
          throw TimeoutException('Keystore locked up');
        });

        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          fallbackEntity = inv.positionalArguments[0] as LocalConfigEntity;
        });
        when(
          () => mockLocalConfigDao.getConfigByKey(any()),
        ).thenAnswer((_) async => fallbackEntity);

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 50),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // First call: Keystore hangs/times out -> circuit opens -> falls back to fallbackStore
        await resilientStore.writeCredential(testRecord);
        expect(fallbackEntity, isNotNull);
        expect(secureStorageCalls, 1);

        // Second call: circuit is already OPEN -> does NOT touch Keystore, directly uses fallbackStore
        final readBack = await resilientStore.readCredential();
        expect(readBack, equals(testRecord));
        expect(
          secureStorageCalls,
          1,
        ); // NO retry storm: Keystore was NOT called again
      },
    );

    test(
      'C: no fallback => DeviceSyncUnavailable without affecting local auth',
      () async {
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenThrow(StateError('Keystore dead'));

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 50),
        );

        // No fallback provided
        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: null,
        );

        expect(
          () => resilientStore.writeCredential(testRecord),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
      },
    );
  });

  group('ResilientDeviceSyncCredentialStore (Cross-Store Monotonicity & Conflict)', () {
    final recordV1 = testRecord.copyWith(
      credentialId: 'cred-v1',
      credentialVersion: 1,
      renewalSecret: 'secret_v1_1234567890abcdef',
    );
    final recordV2 = testRecord.copyWith(
      credentialId: 'cred-v2',
      credentialVersion: 2,
      renewalSecret: 'secret_v2_1234567890abcdef',
    );

    test(
      'preferred N + fallback N+1 returns fallback N+1 and reconciles to preferred',
      () async {
        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.storageKey:
              '{"credentialId":"cred-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        };
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (inv) async => inMemorySecure[inv.namedArguments[#key] as String],
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((inv) async {
          inMemorySecure[inv.namedArguments[#key] as String] =
              inv.namedArguments[#value] as String;
        });
        when(() => mockSecureStorage.delete(key: any(named: 'key'))).thenAnswer(
          (inv) async {
            inMemorySecure.remove(inv.namedArguments[#key] as String);
          },
        );

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey: LocalConfigEntity(
            key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
            value:
                '{"credentialId":"cred-v2","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v2_1234567890abcdef","credentialVersion":2,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
          ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.deleteConfig(any())).thenAnswer((
          inv,
        ) async {
          inMemoryConfigs.remove(inv.positionalArguments[0] as String);
        });
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // Must return N+1 (recordV2) and NOT hide it behind Keystore N (recordV1)
        final active = await resilientStore.readCredential();
        expect(active, equals(recordV2));

        // Monotonic reconciliation must have copied N+1 into preferred store
        final preferredReadBack = await preferredStore.readCredential();
        expect(preferredReadBack, equals(recordV2));

        // The newest fallback remains as a safety replica for a later outage.
        expect(await fallbackStore.readCredential(), equals(recordV2));
      },
    );

    test(
      'same identity/binding/secret/version with preferred expiry past and fallback expiry later returns fallback, reconciles to preferred, and retains fallback',
      () async {
        final pastExpiry = DateTime.utc(2025, 1, 1, 0, 0, 0);
        final laterExpiry = DateTime.utc(2026, 12, 31, 23, 59, 59);

        final preferredRecordStale = testRecord.copyWith(expiresAt: pastExpiry);
        final fallbackRecordRepaired = testRecord.copyWith(
          expiresAt: laterExpiry,
        );

        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.storageKey: jsonEncode(
            preferredRecordStale.toJson(),
          ),
        };
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (inv) async => inMemorySecure[inv.namedArguments[#key] as String],
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((inv) async {
          inMemorySecure[inv.namedArguments[#key] as String] =
              inv.namedArguments[#value] as String;
        });

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore.fallbackStorageKey:
              LocalConfigEntity(
                key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
                value: jsonEncode(fallbackRecordRepaired.toJson()),
              ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        final active = await resilientStore.readCredential();

        // 1. Returns later-expiring fallback record
        expect(active, equals(fallbackRecordRepaired));

        // 2. Reconciled exact record to preferred, verify preferred now has later expiry
        final preferredReadBack = await preferredStore.readCredential();
        expect(preferredReadBack, equals(fallbackRecordRepaired));
        expect(preferredReadBack!.expiresAt, equals(laterExpiry));

        // 3. Fallback is retained
        final fallbackReadBack = await fallbackStore.readCredential();
        expect(fallbackReadBack, equals(fallbackRecordRepaired));
      },
    );

    test(
      'same identity/binding/secret/version with preferred expiry later and fallback expiry past returns preferred, mirrors to fallback, and retains preferred',
      () async {
        final pastExpiry = DateTime.utc(2025, 1, 1, 0, 0, 0);
        final laterExpiry = DateTime.utc(2026, 12, 31, 23, 59, 59);

        final preferredRecordLater = testRecord.copyWith(
          expiresAt: laterExpiry,
        );
        final fallbackRecordStale = testRecord.copyWith(expiresAt: pastExpiry);

        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.storageKey: jsonEncode(
            preferredRecordLater.toJson(),
          ),
        };
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (inv) async => inMemorySecure[inv.namedArguments[#key] as String],
        );

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore.fallbackStorageKey:
              LocalConfigEntity(
                key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
                value: jsonEncode(fallbackRecordStale.toJson()),
              ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        final active = await resilientStore.readCredential();

        // 1. Returns later-expiring preferred record
        expect(active, equals(preferredRecordLater));

        // 2. Mirrored to fallback, verify fallback now has later expiry
        final fallbackReadBack = await fallbackStore.readCredential();
        expect(fallbackReadBack, equals(preferredRecordLater));
        expect(fallbackReadBack!.expiresAt, equals(laterExpiry));

        // 3. Preferred is retained
        final preferredReadBack = await preferredStore.readCredential();
        expect(preferredReadBack, equals(preferredRecordLater));
      },
    );

    test(
      'equal-version with different credentialId/secret/device binding fails closed as conflict',
      () async {
        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.storageKey:
              '{"credentialId":"cred-v1-a","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_aaaaaaaaaaaaaaaa","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        };
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer(
          (inv) async => inMemorySecure[inv.namedArguments[#key] as String],
        );

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey: LocalConfigEntity(
            key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
            value:
                '{"credentialId":"cred-v1-b","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_bbbbbbbbbbbbbbbb","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
          ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        expect(
          () => resilientStore.readCredential(),
          throwsA(isA<DeviceSyncConflictException>()),
        );
      },
    );

    test(
      'recovered Keystore reconciliation failure still returns newest valid record and keeps fallback',
      () async {
        // Preferred has v1, Fallback has v2
        // But writing to preferred fails during reconciliation
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.storageKey,
          ),
        ).thenAnswer(
          (_) async =>
              '{"credentialId":"cred-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenThrow(Exception('Write failed in native layer'));

        final fallbackRecord = recordV2;
        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey: LocalConfigEntity(
            key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
            value:
                '{"credentialId":"cred-v2","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v2_1234567890abcdef","credentialVersion":2,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
          ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.deleteConfig(any())).thenAnswer((
          inv,
        ) async {
          inMemoryConfigs.remove(inv.positionalArguments[0] as String);
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // Returns newest valid record (v2) despite reconciliation write failure
        final active = await resilientStore.readCredential();
        expect(active, equals(fallbackRecord));

        // Fallback was preserved because reconciliation failed
        expect(
          inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey],
          isNotNull,
        );
      },
    );

    test(
      'transient preferred recovery retains fallback for a later Keystore outage',
      () async {
        var preferredUnavailable = false;
        final encodedRecord =
            '{"credentialId":"cred-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}';
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.storageKey,
          ),
        ).thenAnswer((_) async {
          if (preferredUnavailable) {
            throw TimeoutException('Keystore became unavailable again');
          }
          return encodedRecord;
        });

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore.fallbackStorageKey:
              LocalConfigEntity(
                key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
                value: encodedRecord,
              ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (invocation) async =>
              inMemoryConfigs[invocation.positionalArguments[0] as String],
        );
        when(() => mockLocalConfigDao.deleteConfig(any())).thenAnswer((
          invocation,
        ) async {
          inMemoryConfigs.remove(invocation.positionalArguments[0] as String);
        });
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          invocation,
        ) async {
          final entity = invocation.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 50),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );
        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        expect(await resilientStore.readCredential(), equals(recordV1));
        expect(
          inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey],
          isNotNull,
          reason:
              'A transient preferred read must not delete the safety replica',
        );

        preferredUnavailable = true;

        expect(await resilientStore.readCredential(), equals(recordV1));
      },
    );

    test(
      'preferred hang on read opens circuit and causes no retry storm on subsequent reads',
      () async {
        var nativeReadCalls = 0;
        when(() => mockSecureStorage.read(key: any(named: 'key'))).thenAnswer((
          _,
        ) async {
          nativeReadCalls++;
          throw TimeoutException('Keystore read hung');
        });

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore
              .fallbackStorageKey: LocalConfigEntity(
            key: AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
            value:
                '{"credentialId":"cred-v2","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v2_1234567890abcdef","credentialVersion":2,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
          ),
        };
        when(() => mockLocalConfigDao.getConfigByKey(any())).thenAnswer(
          (inv) async => inMemoryConfigs[inv.positionalArguments[0] as String],
        );

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 50),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // First read: preferred times out -> circuit opens -> fallback read succeeds
        final firstRead = await resilientStore.readCredential();
        expect(firstRead, equals(recordV2));
        expect(nativeReadCalls, 1);

        // Second read: preferred circuit is degraded -> zero native calls -> fallback read succeeds
        final secondRead = await resilientStore.readCredential();
        expect(secondRead, equals(recordV2));
        expect(nativeReadCalls, 1); // No retry storm!
      },
    );

    test('candidate monotonicity chooses N+1 and rejects conflict', () async {
      final candidateV2 = recordV2.copyWith(
        credentialId: 'cand-v2',
        credentialVersion: 2,
      );

      final inMemorySecure = <String, String>{
        FlutterSecureDeviceSyncCredentialStore.candidateStorageKey:
            '{"credentialId":"cand-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
      };
      when(
        () => mockSecureStorage.read(
          key: FlutterSecureDeviceSyncCredentialStore.candidateStorageKey,
        ),
      ).thenAnswer(
        (_) async =>
            inMemorySecure[FlutterSecureDeviceSyncCredentialStore
                .candidateStorageKey],
      );
      when(
        () => mockSecureStorage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((inv) async {
        inMemorySecure[inv.namedArguments[#key] as String] =
            inv.namedArguments[#value] as String;
      });

      final inMemoryConfigs = <String, LocalConfigEntity>{
        AppPrivateDeviceSyncCredentialStore
            .candidateStorageKey: LocalConfigEntity(
          key: AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
          value:
              '{"credentialId":"cand-v2","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v2_1234567890abcdef","credentialVersion":2,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        ),
      };
      when(
        () => mockLocalConfigDao.getConfigByKey(
          AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
        ),
      ).thenAnswer(
        (_) async =>
            inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
                .candidateStorageKey],
      );
      when(() => mockLocalConfigDao.deleteConfig(any())).thenAnswer((
        inv,
      ) async {
        inMemoryConfigs.remove(inv.positionalArguments[0] as String);
      });

      final preferredStore = FlutterSecureDeviceSyncCredentialStore(
        storage: mockSecureStorage,
        timeout: const Duration(milliseconds: 100),
      );
      final fallbackStore = AppPrivateDeviceSyncCredentialStore(
        mockLocalConfigDao,
      );

      final resilientStore = ResilientDeviceSyncCredentialStore(
        preferredStore: preferredStore,
        fallbackStore: fallbackStore,
      );

      // Reads candidate: preferred v1 vs fallback v2 -> chooses v2
      final cand = await resilientStore.readCandidate();
      expect(cand, equals(candidateV2));
    });

    test(
      'candidate same identity/binding/secret/version with fallback expiry later returns fallback, reconciles to preferred candidate, and retains fallback',
      () async {
        final pastExpiry = DateTime.utc(2025, 1, 1, 0, 0, 0);
        final laterExpiry = DateTime.utc(2026, 12, 31, 23, 59, 59);

        final preferredCandidateStale = testRecord.copyWith(
          expiresAt: pastExpiry,
        );
        final fallbackCandidateLater = testRecord.copyWith(
          expiresAt: laterExpiry,
        );

        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.candidateStorageKey:
              jsonEncode(preferredCandidateStale.toJson()),
        };
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemorySecure[FlutterSecureDeviceSyncCredentialStore
                  .candidateStorageKey],
        );
        when(
          () => mockSecureStorage.write(
            key: any(named: 'key'),
            value: any(named: 'value'),
          ),
        ).thenAnswer((inv) async {
          inMemorySecure[inv.namedArguments[#key] as String] =
              inv.namedArguments[#value] as String;
        });

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore.candidateStorageKey:
              LocalConfigEntity(
                key: AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
                value: jsonEncode(fallbackCandidateLater.toJson()),
              ),
        };
        when(
          () => mockLocalConfigDao.getConfigByKey(
            AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
                  .candidateStorageKey],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        final cand = await resilientStore.readCandidate();

        // 1. Returns later-expiring fallback candidate
        expect(cand, equals(fallbackCandidateLater));

        // 2. Reconciled to preferred candidate store
        final preferredReadBack = await preferredStore.readCandidate();
        expect(preferredReadBack, equals(fallbackCandidateLater));
        expect(preferredReadBack!.expiresAt, equals(laterExpiry));

        // 3. Fallback candidate retained
        final fallbackReadBack = await fallbackStore.readCandidate();
        expect(fallbackReadBack, equals(fallbackCandidateLater));
      },
    );

    test(
      'candidate same identity/binding/secret/version with preferred expiry later returns preferred candidate, mirrors to fallback candidate, and retains preferred',
      () async {
        final pastExpiry = DateTime.utc(2025, 1, 1, 0, 0, 0);
        final laterExpiry = DateTime.utc(2026, 12, 31, 23, 59, 59);

        final preferredCandidateLater = testRecord.copyWith(
          expiresAt: laterExpiry,
        );
        final fallbackCandidateStale = testRecord.copyWith(
          expiresAt: pastExpiry,
        );

        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.candidateStorageKey:
              jsonEncode(preferredCandidateLater.toJson()),
        };
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemorySecure[FlutterSecureDeviceSyncCredentialStore
                  .candidateStorageKey],
        );

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore.candidateStorageKey:
              LocalConfigEntity(
                key: AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
                value: jsonEncode(fallbackCandidateStale.toJson()),
              ),
        };
        when(
          () => mockLocalConfigDao.getConfigByKey(
            AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
                  .candidateStorageKey],
        );
        when(() => mockLocalConfigDao.saveConfig(any())).thenAnswer((
          inv,
        ) async {
          final entity = inv.positionalArguments[0] as LocalConfigEntity;
          inMemoryConfigs[entity.key] = entity;
        });

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        final cand = await resilientStore.readCandidate();

        // 1. Returns later-expiring preferred candidate
        expect(cand, equals(preferredCandidateLater));

        // 2. Mirrored to fallback candidate store
        final fallbackReadBack = await fallbackStore.readCandidate();
        expect(fallbackReadBack, equals(preferredCandidateLater));
        expect(fallbackReadBack!.expiresAt, equals(laterExpiry));

        // 3. Preferred candidate retained
        final preferredReadBack = await preferredStore.readCandidate();
        expect(preferredReadBack, equals(preferredCandidateLater));
      },
    );

    test(
      'candidate equal-version with differing binding fails closed as conflict',
      () async {
        final inMemorySecure = <String, String>{
          FlutterSecureDeviceSyncCredentialStore.candidateStorageKey:
              '{"credentialId":"cand-v1-a","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_aaaaaaaaaaaaaaaa","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        };
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemorySecure[FlutterSecureDeviceSyncCredentialStore
                  .candidateStorageKey],
        );

        final inMemoryConfigs = <String, LocalConfigEntity>{
          AppPrivateDeviceSyncCredentialStore
              .candidateStorageKey: LocalConfigEntity(
            key: AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
            value:
                '{"credentialId":"cand-v1-b","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_bbbbbbbbbbbbbbbb","credentialVersion":1,"expiresAt":"2027-01-01T00:00:00.000Z","scopes":["sync:push","sync:pull"]}',
          ),
        };
        when(
          () => mockLocalConfigDao.getConfigByKey(
            AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              inMemoryConfigs[AppPrivateDeviceSyncCredentialStore
                  .candidateStorageKey],
        );

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        expect(
          () => resilientStore.readCandidate(),
          throwsA(isA<DeviceSyncConflictException>()),
        );
      },
    );

    test(
      'fallback read throws while preferred N exists fails closed and does not return stale preferred',
      () async {
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.storageKey,
          ),
        ).thenAnswer(
          (_) async =>
              '{"credentialId":"cred-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        );

        when(
          () => mockLocalConfigDao.getConfigByKey(
            AppPrivateDeviceSyncCredentialStore.fallbackStorageKey,
          ),
        ).thenThrow(Exception('Fallback disk read error'));

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // Must fail closed with typed DeviceSyncUnavailableException and NOT return stale v1
        expect(
          () => resilientStore.readCredential(),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
      },
    );

    test(
      'fallback candidate read throws while preferred candidate exists fails closed and does not return stale candidate',
      () async {
        when(
          () => mockSecureStorage.read(
            key: FlutterSecureDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenAnswer(
          (_) async =>
              '{"credentialId":"cand-v1","tenantId":"tenant-test-01","deviceId":"pos-test-terminal-01","renewalSecret":"secret_v1_1234567890abcdef","credentialVersion":1,"expiresAt":"2026-12-31T23:59:59.000Z","scopes":["sync:push","sync:pull"]}',
        );

        when(
          () => mockLocalConfigDao.getConfigByKey(
            AppPrivateDeviceSyncCredentialStore.candidateStorageKey,
          ),
        ).thenThrow(Exception('Fallback candidate disk read error'));

        final preferredStore = FlutterSecureDeviceSyncCredentialStore(
          storage: mockSecureStorage,
          timeout: const Duration(milliseconds: 100),
        );
        final fallbackStore = AppPrivateDeviceSyncCredentialStore(
          mockLocalConfigDao,
        );

        final resilientStore = ResilientDeviceSyncCredentialStore(
          preferredStore: preferredStore,
          fallbackStore: fallbackStore,
        );

        // Must fail closed with typed DeviceSyncUnavailableException and NOT return stale v1 candidate
        expect(
          () => resilientStore.readCandidate(),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
      },
    );
  });
}
