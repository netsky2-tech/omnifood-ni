import 'package:dio/dio.dart';
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
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credential_record.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import '../security/support/fake_cloud_credential_store.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockDio extends Mock implements Dio {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
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
}
