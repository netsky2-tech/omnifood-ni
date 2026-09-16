import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credential_record.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import 'package:pos_app/domain/security/device_sync_bootstrap_coordinator.dart';
import 'package:pos_app/data/security/legacy_human_credential_fallback_cleaner.dart';
import '../security/support/fake_cloud_credential_store.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockDio extends Mock implements Dio {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

class _MockDeviceSyncBootstrapCoordinator extends Mock
    implements DeviceSyncBootstrapCoordinator {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() {
    registerFallbackValue(
      const User(
        id: 'fallback-u',
        name: 'Fallback',
        role: UserRole.cashier,
        isActive: true,
      ),
    );
  });
  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockDio dio;
  late _MockLocalAuthService localAuthService;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;
  late FakeCloudCredentialStore credentialStore;
  late CloudCredentialCoordinator coordinator;
  late AuthRepositoryImpl repository;

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    CloudCredentialCoordinator.resetProcessCoordinationForTest();
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    dio = _MockDio();
    localAuthService = _MockLocalAuthService();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();
    when(
      () => totpSeedKeyProvider.getKeyMaterial(),
    ).thenAnswer((_) async => '0123456789abcdef0123456789abcdef');
    credentialStore = FakeCloudCredentialStore();
    coordinator = CloudCredentialCoordinator(
      credentialStore,
      commitId: () => 'b0000000-0000-4000-8000-000000000002',
    );

    when(() => userDao.deleteAllUsers()).thenAnswer((_) async {});
    when(() => userDao.insertUsers(any())).thenAnswer((_) async {});
    when(() => securityProfileDao.deleteAll()).thenAnswer((_) async {});
    when(
      () => securityProfileDao.insertProfiles(any()),
    ).thenAnswer((_) async {});
    when(
      () => securityProfileDao.findLegacyPlaintextTotpSeeds(),
    ).thenAnswer((_) async => []);

    when(() => dio.options).thenReturn(BaseOptions());

    repository = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: totpSeedKeyProvider,
      credentialCoordinator: coordinator,
    );
  });

  test(
    'loginOnline saves both access and refresh tokens into credential coordinator',
    () async {
      when(() => dio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 200,
          data: {
            'user': {
              'id': 'user-uuid-1',
              'email': 'cajero@omnifood.ni',
              'name': 'Cajero Uno',
              'role': 'CASHIER',
              'tenant_id': 'tenant-uuid-1',
              'isActive': true,
            },
            'access_token': 'new-access-jwt',
            'refresh_token': 'new-refresh-jwt',
          },
        ),
      );

      when(() => dio.get(any())).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          statusCode: 200,
          data: {'users': []},
        ),
      );

      final user = await repository.loginOnline(
        'cajero@omnifood.ni',
        'pass123',
      );

      expect(user, isNotNull);
      expect(user?.email, 'cajero@omnifood.ni');

      final recovery = await coordinator.recover();
      expect(recovery.record, isNotNull);
      expect(recovery.record?.credentialState, CredentialState.active);
      expect(recovery.record?.credentials?.accessToken, 'new-access-jwt');
      expect(recovery.record?.credentials?.refreshToken, 'new-refresh-jwt');
      expect(recovery.record?.credentials?.userId, 'user-uuid-1');
      expect(recovery.record?.credentials?.tenantId, 'tenant-uuid-1');

      final token = await repository.getAccessToken();
      expect(token, 'new-access-jwt');
    },
  );

  test(
    'logout clears credentials in coordinator creating CLEARED tombstone',
    () async {
      // Setup initial active credentials
      final intent = await coordinator.reserveIntent();
      await coordinator.commit(
        intent,
        CloudCredentials(
          accessToken: 'initial-access',
          refreshToken: 'initial-refresh',
          userId: 'u1',
          tenantId: 't1',
          issuedAtUtc: DateTime.utc(2026, 1, 1),
        ),
      );

      await repository.logout();

      final recovery = await coordinator.recover();
      expect(recovery.record?.credentialState, CredentialState.cleared);
      expect(recovery.record?.credentials, isNull);
      expect(await repository.getAccessToken(), isNull);
    },
  );

  test(
    'loginOffline performs 0 HTTP calls and 0 secure-store coordinator writes',
    () async {
      final userEntity = UserEntity(
        id: 'local-u1',
        email: 'cajero@omnifood.ni',
        name: 'Cajero Local',
        role: 'cashier',
        pinHash: 'hashed-1234',
        isActive: true,
      );
      final profileEntity = SecurityProfileEntity(
        userId: 'local-u1',
        pinHash: 'hashed-1234',
        isPinEnabled: true,
        isTotpEnabled: false,
      );

      when(
        () => userDao.findUserById('local-u1'),
      ).thenAnswer((_) async => userEntity);
      when(
        () => securityProfileDao.findByUserId('local-u1'),
      ).thenAnswer((_) async => profileEntity);
      when(
        () => localAuthService.verifyPin('1234', 'hashed-1234'),
      ).thenReturn(true);

      final user = await repository.loginOffline('local-u1', '1234');

      expect(user, isNotNull);
      expect(user?.id, 'local-u1');

      verifyZeroInteractions(dio);
      // coordinator was never modified
      expect((await coordinator.recover()).record, isNull);
    },
  );

  test(
    'loginOnline with OWNER invokes DeviceSyncBootstrapCoordinator',
    () async {
      final mockBootstrap = _MockDeviceSyncBootstrapCoordinator();
      when(() => mockBootstrap.bootstrap(user: any(named: 'user'))).thenAnswer(
        (_) async => const DeviceSyncBootstrapResult(
          status: DeviceSyncBootstrapStatus.noOpAlreadyActive,
        ),
      );

      final ownerRepo = AuthRepositoryImpl(
        userDao,
        securityProfileDao,
        localAuthService,
        dio,
        totpSeedKeyProvider: totpSeedKeyProvider,
        credentialCoordinator: coordinator,
        bootstrapCoordinator: mockBootstrap,
      );

      when(() => dio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 200,
          data: {
            'user': {
              'id': 'user-owner-1',
              'email': 'owner@omnifood.ni',
              'name': 'Owner Uno',
              'role': 'OWNER',
              'tenant_id': 'tenant-uuid-1',
              'isActive': true,
            },
            'access_token': 'new-access-jwt',
            'refresh_token': 'new-refresh-jwt',
          },
        ),
      );

      when(() => dio.get(any())).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          statusCode: 200,
          data: {'users': []},
        ),
      );

      final user = await ownerRepo.loginOnline('owner@omnifood.ni', 'pass123');

      expect(user, isNotNull);
      verify(() => mockBootstrap.bootstrap(user: any(named: 'user'))).called(1);
    },
  );

  test(
    'loginOnline with non-OWNER (CASHIER) does NOT invoke DeviceSyncBootstrapCoordinator',
    () async {
      final mockBootstrap = _MockDeviceSyncBootstrapCoordinator();

      final cashierRepo = AuthRepositoryImpl(
        userDao,
        securityProfileDao,
        localAuthService,
        dio,
        totpSeedKeyProvider: totpSeedKeyProvider,
        credentialCoordinator: coordinator,
        bootstrapCoordinator: mockBootstrap,
      );

      when(() => dio.post(any(), data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 200,
          data: {
            'user': {
              'id': 'user-cashier-1',
              'email': 'cashier@omnifood.ni',
              'name': 'Cashier Uno',
              'role': 'CASHIER',
              'tenant_id': 'tenant-uuid-1',
              'isActive': true,
            },
            'access_token': 'new-access-jwt',
            'refresh_token': 'new-refresh-jwt',
          },
        ),
      );

      when(() => dio.get(any())).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          statusCode: 200,
          data: {'users': []},
        ),
      );

      final user = await cashierRepo.loginOnline(
        'cashier@omnifood.ni',
        'pass123',
      );

      expect(user, isNotNull);
      verifyNever(() => mockBootstrap.bootstrap(user: any(named: 'user')));
    },
  );

  test(
    'loginOffline / PIN path does NOT invoke DeviceSyncBootstrapCoordinator',
    () async {
      final mockBootstrap = _MockDeviceSyncBootstrapCoordinator();

      final offlineRepo = AuthRepositoryImpl(
        userDao,
        securityProfileDao,
        localAuthService,
        dio,
        totpSeedKeyProvider: totpSeedKeyProvider,
        credentialCoordinator: coordinator,
        bootstrapCoordinator: mockBootstrap,
      );

      final userEntity = UserEntity(
        id: 'local-u1',
        email: 'cajero@omnifood.ni',
        name: 'Cajero Local',
        role: 'cashier',
        pinHash: 'hashed-1234',
        isActive: true,
      );
      final profileEntity = SecurityProfileEntity(
        userId: 'local-u1',
        pinHash: 'hashed-1234',
        isPinEnabled: true,
        isTotpEnabled: false,
      );

      when(
        () => userDao.findUserById('local-u1'),
      ).thenAnswer((_) async => userEntity);
      when(
        () => securityProfileDao.findByUserId('local-u1'),
      ).thenAnswer((_) async => profileEntity);
      when(
        () => localAuthService.verifyPin('1234', 'hashed-1234'),
      ).thenReturn(true);

      final user = await offlineRepo.loginOffline('local-u1', '1234');

      expect(user, isNotNull);
      verifyNever(() => mockBootstrap.bootstrap(user: any(named: 'user')));
    },
  );

  test(
    'logout fails closed locally even if coordinator.clear() throws',
    () async {
      final hungStore = FakeCloudCredentialStore();
      final hungCoordinator = CloudCredentialCoordinator(
        hungStore,
        commitId: () => 'b0000000-0000-4000-8000-000000000003',
      );
      final hungRepo = AuthRepositoryImpl(
        userDao,
        securityProfileDao,
        localAuthService,
        dio,
        totpSeedKeyProvider: totpSeedKeyProvider,
        credentialCoordinator: hungCoordinator,
      );

      // Commit an active token
      final intent = await hungCoordinator.reserveIntent();
      await hungCoordinator.commit(
        intent,
        CloudCredentials(
          accessToken: 'active-token',
          refreshToken: 'active-refresh',
          userId: 'u2',
          tenantId: 't2',
          issuedAtUtc: DateTime.utc(2026, 1, 1),
        ),
      );
      dio.options.headers['Authorization'] = 'Bearer active-token';

      // Simulate store write failure on clear
      hungStore.throwOnWrite();

      await hungRepo.logout();

      expect(await hungRepo.getCurrentUser(), isNull);
      expect(await hungRepo.getAccessToken(), isNull);
      expect(dio.options.headers.containsKey('Authorization'), isFalse);
    },
  );

  test(
    'logout fails closed locally in legacy mode even if secure storage delete throws',
    () async {
      final mockStorage = _MockFlutterSecureStorage();
      when(
        () => mockStorage.delete(key: 'access_token'),
      ).thenThrow(Exception('Keystore delete hang/failure'));
      when(
        () => mockStorage.read(key: 'access_token'),
      ).thenAnswer((_) async => 'un-deleted-zombie-token');

      final legacyRepo = AuthRepositoryImpl(
        userDao,
        securityProfileDao,
        localAuthService,
        dio,
        storage: mockStorage,
        totpSeedKeyProvider: totpSeedKeyProvider,
        credentialCoordinator: null,
      );

      dio.options.headers['Authorization'] = 'Bearer active-token';

      await legacyRepo.logout();

      // Fails closed locally: memory cleared, header removed, and revocation barrier rejects resurrection
      expect(await legacyRepo.getCurrentUser(), isNull);
      expect(await legacyRepo.getAccessToken(), isNull);
      expect(dio.options.headers.containsKey('Authorization'), isFalse);
    },
  );

  group('Logout cleaner integration & SharedPreferences isolation', () {
    const legacyHumanKeys = [
      'access_token',
      'refresh_token_fallback',
      'refresh_tenant_id_fallback',
      'refresh_user_id_fallback',
    ];

    test(
      'logout invokes cleaner and purges legacy human credentials when coordinator exists and succeeds',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'stale-human-access-jwt',
          'refresh_token_fallback': 'stale-human-refresh-jwt',
          'refresh_tenant_id_fallback': 'stale-tenant-id',
          'refresh_user_id_fallback': 'stale-user-id',
          'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
        });
        final prefs = await SharedPreferences.getInstance();

        for (final key in legacyHumanKeys) {
          expect(prefs.containsKey(key), isTrue);
        }

        final cleaner = LegacyHumanCredentialFallbackCleaner(prefs);
        final repoWithCleaner = AuthRepositoryImpl(
          userDao,
          securityProfileDao,
          localAuthService,
          dio,
          totpSeedKeyProvider: totpSeedKeyProvider,
          credentialCoordinator: coordinator,
          cleaner: cleaner,
        );

        await repoWithCleaner.logout();

        // Coordinator tombstoned
        final recovery = await coordinator.recover();
        expect(recovery.record?.credentialState, CredentialState.cleared);

        // Legacy human keys MUST be purged
        for (final key in legacyHumanKeys) {
          expect(
            prefs.containsKey(key),
            isFalse,
            reason: 'Key $key should have been purged by cleaner on logout',
          );
        }

        // Revocation barrier MUST be preserved
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
      },
    );

    test(
      'logout invokes cleaner and purges legacy human credentials even when coordinator.clear() throws',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'stale-human-access-jwt',
          'refresh_token_fallback': 'stale-human-refresh-jwt',
          'refresh_tenant_id_fallback': 'stale-tenant-id',
          'refresh_user_id_fallback': 'stale-user-id',
          'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
        });
        final prefs = await SharedPreferences.getInstance();

        final hungStore = FakeCloudCredentialStore();
        final hungCoordinator = CloudCredentialCoordinator(
          hungStore,
          commitId: () => 'b0000000-0000-4000-8000-000000000099',
        );
        hungStore.throwOnWrite();

        final cleaner = LegacyHumanCredentialFallbackCleaner(prefs);
        final hungRepo = AuthRepositoryImpl(
          userDao,
          securityProfileDao,
          localAuthService,
          dio,
          totpSeedKeyProvider: totpSeedKeyProvider,
          credentialCoordinator: hungCoordinator,
          cleaner: cleaner,
        );

        await hungRepo.logout();

        // Legacy human keys MUST still be purged despite coordinator error
        for (final key in legacyHumanKeys) {
          expect(
            prefs.containsKey(key),
            isFalse,
            reason:
                'Key $key should have been purged by cleaner even when clear throws',
          );
        }

        // Revocation barrier MUST be preserved
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
      },
    );

    test(
      'logout invokes cleaner and purges legacy human credentials in legacy mode even when storage.delete() throws',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'stale-human-access-jwt',
          'refresh_token_fallback': 'stale-human-refresh-jwt',
          'refresh_tenant_id_fallback': 'stale-tenant-id',
          'refresh_user_id_fallback': 'stale-user-id',
          'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
        });
        final prefs = await SharedPreferences.getInstance();

        final mockStorage = _MockFlutterSecureStorage();
        when(
          () => mockStorage.delete(key: 'access_token'),
        ).thenThrow(Exception('Keystore delete hang'));

        final cleaner = LegacyHumanCredentialFallbackCleaner(prefs);
        final legacyRepo = AuthRepositoryImpl(
          userDao,
          securityProfileDao,
          localAuthService,
          dio,
          storage: mockStorage,
          totpSeedKeyProvider: totpSeedKeyProvider,
          credentialCoordinator: null,
          cleaner: cleaner,
        );

        await legacyRepo.logout();

        // Legacy human keys MUST be purged even when storage.delete throws
        for (final key in legacyHumanKeys) {
          expect(
            prefs.containsKey(key),
            isFalse,
            reason:
                'Key $key should have been purged by cleaner in legacy failure',
          );
        }

        // Revocation barrier preserved
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
      },
    );

    test(
      'getAccessToken never recovers human credentials from SharedPreferences',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'unauthorized-sharedprefs-jwt',
          'refresh_token_fallback': 'unauthorized-refresh-jwt',
        });

        // Coordinator mode: empty coordinator
        expect(await repository.getAccessToken(), isNull);

        // Legacy mode with empty secure storage
        final mockStorage = _MockFlutterSecureStorage();
        when(
          () => mockStorage.read(key: 'access_token'),
        ).thenAnswer((_) async => null);

        final legacyRepo = AuthRepositoryImpl(
          userDao,
          securityProfileDao,
          localAuthService,
          dio,
          storage: mockStorage,
          totpSeedKeyProvider: totpSeedKeyProvider,
          credentialCoordinator: null,
        );

        // Under NO circumstance should SharedPreferences fallback be read
        expect(await legacyRepo.getAccessToken(), isNull);
      },
    );
  });
}
