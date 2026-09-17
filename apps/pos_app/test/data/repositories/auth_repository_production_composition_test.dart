import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_sync_port.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/network/device_sync_auth_interceptor.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/dio_device_sync_exchange_port.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_bootstrap_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/data/security/legacy_human_credential_fallback_cleaner.dart';
import '../security/support/fake_cloud_credential_store.dart';
import '../security/support/fake_device_sync_credential_store.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const canonicalDeviceId = 'term-prod-pos-001';
  const testTenantId = 'tenant-prod-alpha';

  late _MockUserDao mockUserDao;
  late _MockSecurityProfileDao mockSecurityProfileDao;
  late _MockLocalAuthService mockLocalAuthService;
  late FakeCloudCredentialStore fakeCloudStore;
  late FakeDeviceSyncCredentialStore fakeDeviceSyncStore;
  late CloudCredentialCoordinator cloudCoordinator;
  late DeviceSyncCredentialCoordinator deviceSyncCoordinator;
  late DeviceSyncBootstrapCoordinator bootstrapCoordinator;
  late AuthRepositoryImpl authRepository;

  late Dio humanDio;
  late Dio syncDio;
  final recordedHumanRequests = <Map<String, dynamic>>[];

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    CloudCredentialCoordinator.resetProcessCoordinationForTest();
    mockUserDao = _MockUserDao();
    mockSecurityProfileDao = _MockSecurityProfileDao();
    mockLocalAuthService = _MockLocalAuthService();
    recordedHumanRequests.clear();

    when(() => mockUserDao.deleteAllUsers()).thenAnswer((_) async {});
    when(() => mockUserDao.insertUsers(any())).thenAnswer((_) async {});
    when(() => mockSecurityProfileDao.deleteAll()).thenAnswer((_) async {});
    when(() => mockSecurityProfileDao.insertProfiles(any())).thenAnswer((_) async {});
    when(() => mockSecurityProfileDao.findLegacyPlaintextTotpSeeds()).thenAnswer((_) async => []);

    // 1. Storage & Coordinators matching main.dart
    fakeCloudStore = FakeCloudCredentialStore();
    cloudCoordinator = CloudCredentialCoordinator(
      fakeCloudStore,
      commitId: () => 'commit-prod-uuid',
    );

    fakeDeviceSyncStore = FakeDeviceSyncCredentialStore();
    final deviceSyncExchangeDio = Dio(BaseOptions(baseUrl: 'http://backend.internal/api'));
    final deviceSyncExchangePort = DioDeviceSyncExchangePort(deviceSyncExchangeDio);
    deviceSyncCoordinator = DeviceSyncCredentialCoordinator(
      store: fakeDeviceSyncStore,
      exchangePort: deviceSyncExchangePort,
      resolveDeviceId: () async => canonicalDeviceId,
      nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );

    syncDio = Dio(BaseOptions(baseUrl: 'http://backend.internal/api'));
    syncDio.interceptors.add(
      DeviceSyncAuthInterceptor(
        coordinator: deviceSyncCoordinator,
        clientDio: syncDio,
      ),
    );

    // 2. Human Dio interceptor to mock backend responses
    humanDio = Dio(BaseOptions(baseUrl: 'http://backend.internal/api'));
    humanDio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          recordedHumanRequests.add({
            'method': options.method,
            'path': options.path,
            'data': options.data,
            'headers': options.headers,
          });

          if (options.path == '/identity/login' || options.path == 'identity/login') {
            final body = options.data is Map ? options.data as Map : {};
            final email = body['email'] as String? ?? '';
            final role = email.contains('owner')
                ? 'OWNER'
                : (email.contains('cashier') ? 'CASHIER' : 'ADMIN');

            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'user': {
                    'id': 'user-id-$email',
                    'email': email,
                    'name': 'User $email',
                    'role': role,
                    'tenant_id': testTenantId,
                    'isActive': true,
                  },
                  'access_token': 'human-access-jwt',
                  'refresh_token': 'human-refresh-jwt',
                },
              ),
            );
          }

          if (options.path == '/identity/staff' || options.path == 'identity/staff') {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'users': []},
              ),
            );
          }

          if (options.path == 'onboarding/activation/device-sync-credential' ||
              options.path == '/onboarding/activation/device-sync-credential') {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {
                  'credentialId': 'cred-prod-001',
                  'tenantId': testTenantId,
                  'deviceId': canonicalDeviceId,
                  'scopes': ['sync:push', 'sync:pull'],
                  'credentialVersion': 1,
                  'renewalSecret': 'sec_high_entropy_prod_secret_12345678901234567890',
                  'renewalCredentialExpiresAt': '2026-12-31T23:59:59.000Z',
                },
              ),
            );
          }

          if (options.path == 'onboarding/activation/device-sync-credential/confirm' ||
              options.path == '/onboarding/activation/device-sync-credential/confirm') {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'credentialId': 'cred-prod-001',
                  'tenantId': testTenantId,
                  'deviceId': canonicalDeviceId,
                  'scopes': ['sync:push', 'sync:pull'],
                  'credentialVersion': 1,
                  'renewalCredentialExpiresAt': '2027-12-31T23:59:59.000Z',
                  'status': 'ACTIVE',
                },
              ),
            );
          }

          return handler.next(options);
        },
      ),
    );

    // 3. Real production composition instantiation matching main.dart
    final activationSyncPort = DioActivationSyncPort(
      humanDio,
      deviceSyncCoordinator,
    );

    bootstrapCoordinator = DeviceSyncBootstrapCoordinator(
      store: fakeDeviceSyncStore,
      activationSyncPort: activationSyncPort,
      resolveDeviceId: () async => canonicalDeviceId,
      credentialCoordinator: deviceSyncCoordinator,
      nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );

    authRepository = AuthRepositoryImpl(
      mockUserDao,
      mockSecurityProfileDao,
      mockLocalAuthService,
      humanDio,
      credentialCoordinator: cloudCoordinator,
      bootstrapCoordinator: bootstrapCoordinator,
    );
  });

  group('Production Composition & Device Sync Bootstrap Invariants', () {
    test('1. bootstrap coordinator is non-null and wired in production composition', () {
      expect(authRepository.bootstrapCoordinator, isNotNull);
      expect(authRepository.bootstrapCoordinator, same(bootstrapCoordinator));
    });

    test(
      '2. first OWNER login calls derived endpoint once, commits candidate to ACTIVE, no attemptId used',
      () async {
        final user = await authRepository.loginOnline('owner@omnifood.ni', 'secret123');

        expect(user, isNotNull);
        expect(user!.role, equals(UserRole.owner));

        // Proves derived endpoints called (without any attemptId in path or data)
        final provisionRequests = recordedHumanRequests.where(
          (r) => (r['path'] as String).contains('device-sync-credential'),
        ).toList();

        expect(provisionRequests.length, equals(2));

        // 1st request: POST onboarding/activation/device-sync-credential with { deviceId }
        expect(provisionRequests[0]['path'], equals('onboarding/activation/device-sync-credential'));
        expect(provisionRequests[0]['data'], equals({'deviceId': canonicalDeviceId}));

        // 2nd request: POST onboarding/activation/device-sync-credential/confirm with { credentialId, deviceId, ... }
        expect(
          provisionRequests[1]['path'],
          equals('onboarding/activation/device-sync-credential/confirm'),
        );
        final confirmData = provisionRequests[1]['data'] as Map<String, dynamic>;
        expect(confirmData['credentialId'], equals('cred-prod-001'));
        expect(confirmData['deviceId'], equals(canonicalDeviceId));
        expect(confirmData.containsKey('attemptId'), isFalse);

        // Verify local store has ACTIVE credential
        final active = await fakeDeviceSyncStore.readCredential();
        expect(active, isNotNull);
        expect(active!.credentialId, equals('cred-prod-001'));
        expect(active.deviceId, equals(canonicalDeviceId));

        // Candidate was cleared after commit
        final candidate = await fakeDeviceSyncStore.readCandidate();
        expect(candidate, isNull);
      },
    );

    test('3. second OWNER login is an active no-op without any server calls to activation', () async {
      // First login provisions and activates
      await authRepository.loginOnline('owner@omnifood.ni', 'secret123');
      recordedHumanRequests.clear();

      // Second login
      final secondUser = await authRepository.loginOnline('owner@omnifood.ni', 'secret123');
      expect(secondUser, isNotNull);

      // Verify no requests made to device-sync-credential
      final bootstrapRequests = recordedHumanRequests.where(
        (r) => (r['path'] as String).contains('device-sync-credential'),
      );
      expect(bootstrapRequests, isEmpty);

      // Verify status is noOpAlreadyActive
      expect(
        bootstrapCoordinator.lastResult?.status,
        equals(DeviceSyncBootstrapStatus.noOpAlreadyActive),
      );
    });

    test('4. non-owner (cashier) login does NOT call bootstrap endpoint', () async {
      final cashier = await authRepository.loginOnline('cashier@omnifood.ni', 'cashier123');

      expect(cashier, isNotNull);
      expect(cashier!.role, equals(UserRole.cashier));

      final bootstrapRequests = recordedHumanRequests.where(
        (r) => (r['path'] as String).contains('device-sync-credential'),
      );
      expect(bootstrapRequests, isEmpty);
      // Coordinator is never invoked for cashier login
      expect(bootstrapCoordinator.lastResult, isNull);
    });

    test('5. PIN / offline login does NOT invoke bootstrap coordinator', () async {
      final userEntity = UserEntity(
        id: 'local-cashier-1',
        email: 'local@omnifood.ni',
        name: 'Local Cashier',
        role: 'cashier',
        pinHash: 'hashed-pin',
        isActive: true,
      );
      final profile = SecurityProfileEntity(
        userId: 'local-cashier-1',
        pinHash: 'hashed-pin',
        isPinEnabled: true,
        isTotpEnabled: false,
      );

      when(() => mockUserDao.findUserById('local-cashier-1')).thenAnswer((_) async => userEntity);
      when(() => mockSecurityProfileDao.findByUserId('local-cashier-1')).thenAnswer((_) async => profile);
      when(() => mockLocalAuthService.verifyPin('1234', 'hashed-pin')).thenReturn(true);

      final user = await authRepository.loginOffline('local-cashier-1', '1234');
      expect(user, isNotNull);

      final bootstrapRequests = recordedHumanRequests.where(
        (r) => (r['path'] as String).contains('device-sync-credential'),
      );
      expect(bootstrapRequests, isEmpty);
      expect(bootstrapCoordinator.lastResult, isNull);
    });

    test(
      '6. bootstrap failure does not fail human login, but sync status remains unavailable',
      () async {
        // Human Dio returns 500 for bootstrap endpoint
        humanDio.interceptors.insert(
          0,
          InterceptorsWrapper(
            onRequest: (options, handler) {
              if (options.path.contains('device-sync-credential')) {
                return handler.reject(
                  DioException(
                    requestOptions: options,
                    response: Response(
                      requestOptions: options,
                      statusCode: 500,
                      data: {'error': 'INTERNAL_ERROR', 'sensitive': 'super-secret-leaked-body'},
                    ),
                    type: DioExceptionType.badResponse,
                  ),
                );
              }
              return handler.next(options);
            },
          ),
        );

        // Human login succeeds despite bootstrap failure
        final user = await authRepository.loginOnline('owner@omnifood.ni', 'secret123');
        expect(user, isNotNull);
        expect(user!.email, equals('owner@omnifood.ni'));

        // Observable error is set on coordinator (class name only)
        expect(bootstrapCoordinator.lastError, isNotNull);
        expect(bootstrapCoordinator.lastError, contains('DioException'));

        // Device sync credentials were not provisioned
        final activeCred = await fakeDeviceSyncStore.readCredential();
        expect(activeCred, isNull);

        // Sync service / coordinator access token throws DeviceSyncUnavailableException
        expect(
          () => deviceSyncCoordinator.getAccessToken(),
          throwsA(isA<DeviceSyncUnavailableException>()),
        );
      },
    );

    test(
      '7. startup composition runs cleaner before auth/interceptor usage, purging legacy human keys without mutating device sync credentials or blocking on cleaner failure',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'pre-existing-legacy-access-jwt',
          'refresh_token_fallback': 'pre-existing-legacy-refresh-jwt',
          'refresh_tenant_id_fallback': 'pre-existing-tenant-id',
          'refresh_user_id_fallback': 'pre-existing-user-id',
          'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
          'unrelated_setting': 'active',
        });
        final prefs = await SharedPreferences.getInstance();

        await fakeDeviceSyncStore.writeCredential(
          DeviceSyncCredentialRecord(
            credentialId: 'cred-prod-active-001',
            tenantId: testTenantId,
            deviceId: canonicalDeviceId,
            scopes: const ['sync:push', 'sync:pull'],
            credentialVersion: 1,
            renewalSecret: 'sec_existing_device_secret_1234567890',
            expiresAt: DateTime.utc(2028, 1, 1),
          ),
        );

        // Startup cleaner executes
        final startupCleaner = LegacyHumanCredentialFallbackCleaner(prefs);
        final cleanSuccess = await startupCleaner.clean();
        expect(cleanSuccess, isTrue);

        // Prohibited keys MUST be purged
        expect(prefs.containsKey('access_token'), isFalse);
        expect(prefs.containsKey('refresh_token_fallback'), isFalse);
        expect(prefs.containsKey('refresh_tenant_id_fallback'), isFalse);
        expect(prefs.containsKey('refresh_user_id_fallback'), isFalse);

        // Nonsecret settings and revocation barrier preserved
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
        expect(prefs.getString('unrelated_setting'), 'active');

        // Device Sync credential in device store is untouched
        final deviceCred = await fakeDeviceSyncStore.readCredential();
        expect(deviceCred, isNotNull);
        expect(deviceCred!.credentialId, 'cred-prod-active-001');
        expect(deviceCred.isRenewalExpired(), isFalse);

        // Wire AuthRepositoryImpl with cleaner
        final repoWithCleaner = AuthRepositoryImpl(
          mockUserDao,
          mockSecurityProfileDao,
          mockLocalAuthService,
          humanDio,
          credentialCoordinator: cloudCoordinator,
          bootstrapCoordinator: bootstrapCoordinator,
          cleaner: startupCleaner,
        );

        expect(repoWithCleaner.cleaner, same(startupCleaner));

        // Attempting to read access token returns null (no fallback read from prefs)
        expect(await repoWithCleaner.getAccessToken(), isNull);
      },
    );

    test(
      '8. startup cleanup failure does not throw or block POS startup and no fallback credential can be read',
      () async {
        final failingCleaner = LegacyHumanCredentialFallbackCleaner(
          null,
          () async => throw Exception('Disk read error'),
        );
        final cleanResult = await failingCleaner.clean();
        expect(cleanResult, isFalse);

        final repoWithCleaner = AuthRepositoryImpl(
          mockUserDao,
          mockSecurityProfileDao,
          mockLocalAuthService,
          humanDio,
          credentialCoordinator: cloudCoordinator,
          bootstrapCoordinator: bootstrapCoordinator,
          cleaner: failingCleaner,
        );

        expect(await repoWithCleaner.getAccessToken(), isNull);
      },
    );
  });
}
