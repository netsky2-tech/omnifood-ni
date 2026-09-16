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
import 'package:pos_app/domain/security/cloud_credentials.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';
import 'support/fake_cloud_credential_store.dart';

class _MockUserDao extends Mock implements UserDao {}
class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}
class _MockDio extends Mock implements Dio {}
class _MockLocalAuthService extends Mock implements LocalAuthService {}
class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}
class _MockDeviceSyncExchangePort extends Mock implements DeviceSyncExchangePort {}
class _MockDeviceSyncCredentialStore extends Mock implements DeviceSyncCredentialStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockDio dio;
  late _MockLocalAuthService localAuthService;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;
  late FakeCloudCredentialStore cloudStore;
  late CloudCredentialCoordinator cloudCoordinator;
  late AuthRepositoryImpl authRepo;

  late _MockDeviceSyncCredentialStore deviceStore;
  late _MockDeviceSyncExchangePort deviceExchangePort;
  late DeviceSyncCredentialCoordinator deviceCoordinator;

  const canonicalDeviceId = 'pos-canonical-terminal-isolation';
  final deviceRecord = DeviceSyncCredentialRecord(
    credentialId: 'cred-isolation-uuid',
    tenantId: 'tenant-iso',
    deviceId: canonicalDeviceId,
    renewalSecret: 'sec_iso_1234567890abcdef',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2028, 1, 1),
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUpAll(() {
    registerFallbackValue(deviceRecord);
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    CloudCredentialCoordinator.resetProcessCoordinationForTest();

    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    dio = _MockDio();
    localAuthService = _MockLocalAuthService();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();

    when(() => totpSeedKeyProvider.getKeyMaterial())
        .thenAnswer((_) async => '0123456789abcdef0123456789abcdef');
    when(() => dio.options).thenReturn(BaseOptions());

    cloudStore = FakeCloudCredentialStore();
    cloudCoordinator = CloudCredentialCoordinator(
      cloudStore,
      commitId: () => 'b0000000-0000-4000-8000-000000000001',
    );

    authRepo = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: totpSeedKeyProvider,
      credentialCoordinator: cloudCoordinator,
    );

    deviceStore = _MockDeviceSyncCredentialStore();
    deviceExchangePort = _MockDeviceSyncExchangePort();

    DeviceSyncCredentialRecord? inMemoryDeviceCred = deviceRecord;
    when(() => deviceStore.readCredential()).thenAnswer((_) async => inMemoryDeviceCred);
    when(() => deviceStore.writeCredential(any())).thenAnswer((inv) async {
      inMemoryDeviceCred = inv.positionalArguments[0] as DeviceSyncCredentialRecord;
    });
    when(() => deviceStore.clearCredential()).thenAnswer((_) async {
      inMemoryDeviceCred = null;
    });

    when(() => deviceExchangePort.renewToken(
          credentialId: any(named: 'credentialId'),
          deviceId: any(named: 'deviceId'),
          renewalSecret: any(named: 'renewalSecret'),
          tenantId: any(named: 'tenantId'),
          expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
        )).thenAnswer((_) async => const DeviceSyncTokenResponse(
          accessToken: 'mock.device.sync.jwt',
          tokenType: 'Bearer',
          expiresIn: 3600,
        ));

    deviceCoordinator = DeviceSyncCredentialCoordinator(
      store: deviceStore,
      exchangePort: deviceExchangePort,
      resolveDeviceId: () async => canonicalDeviceId,
      nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );
  });

  group('Device Sync & Human Auth Isolation (Mandatory Tests F, G, H, C)', () {
    test('F: human logout leaves device credential untouched and functioning', () async {
      // Human logs in with cloud credentials
      final cloudIntent = await cloudCoordinator.reserveIntent();
      await cloudCoordinator.commit(
        cloudIntent,
        CloudCredentials(
          accessToken: 'human-access-jwt',
          refreshToken: 'human-refresh-jwt',
          userId: 'user-human-1',
          tenantId: 'tenant-iso',
          issuedAtUtc: DateTime.utc(2026, 6, 1, 10, 0, 0),
        ),
      );
      dio.options.headers['Authorization'] = 'Bearer human-access-jwt';

      // Human logs out
      await authRepo.logout();

      // Cloud state is cleared
      expect(await authRepo.getCurrentUser(), isNull);
      expect(await authRepo.getAccessToken(), isNull);
      expect(dio.options.headers.containsKey('Authorization'), isFalse);

      // Device sync credential was NOT cleared or mutated!
      verifyNever(() => deviceStore.clearCredential());
      final storedDevice = await deviceStore.readCredential();
      expect(storedDevice, equals(deviceRecord));

      // Coordinator can still independently obtain/renew device sync token
      final token = await deviceCoordinator.getAccessToken();
      expect(token, 'mock.device.sync.jwt');
    });

    test('G: cashier switch leaves device credential untouched', () async {
      final cashier1 = UserEntity(
        id: 'cashier-1',
        email: 'c1@omnifood.ni',
        name: 'Cajero 1',
        role: 'cashier',
        pinHash: 'hashed-1111',
        isActive: true,
      );
      final cashier2 = UserEntity(
        id: 'cashier-2',
        email: 'c2@omnifood.ni',
        name: 'Cajero 2',
        role: 'cashier',
        pinHash: 'hashed-2222',
        isActive: true,
      );

      when(() => userDao.findUserById('cashier-1')).thenAnswer((_) async => cashier1);
      when(() => userDao.findUserById('cashier-2')).thenAnswer((_) async => cashier2);
      when(() => securityProfileDao.findByUserId('cashier-1')).thenAnswer(
        (_) async => SecurityProfileEntity(
          userId: 'cashier-1',
          pinHash: 'hashed-1111',
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      );
      when(() => securityProfileDao.findByUserId('cashier-2')).thenAnswer(
        (_) async => SecurityProfileEntity(
          userId: 'cashier-2',
          pinHash: 'hashed-2222',
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      );
      when(() => localAuthService.verifyPin('1111', 'hashed-1111')).thenReturn(true);
      when(() => localAuthService.verifyPin('2222', 'hashed-2222')).thenReturn(true);

      // Cashier 1 logs in
      final u1 = await authRepo.loginOffline('cashier-1', '1111');
      expect(u1?.id, 'cashier-1');

      // Cashier 2 logs in (cashier switch)
      final u2 = await authRepo.loginOffline('cashier-2', '2222');
      expect(u2?.id, 'cashier-2');

      // Device sync credential was NEVER modified during cashier switch
      verifyNever(() => deviceStore.clearCredential());
      verifyNever(() => deviceStore.writeCredential(any()));
      expect(await deviceStore.readCredential(), equals(deviceRecord));

      // Device sync token can still be fetched
      final token = await deviceCoordinator.getAccessToken();
      expect(token, 'mock.device.sync.jwt');
    });

    test('H: CloudCredentialCoordinator empty still device sync token works', () async {
      // CloudCredentialCoordinator is completely empty (no cloud session ever established)
      final cloudRecovery = await cloudCoordinator.recover();
      expect(cloudRecovery.record, isNull);
      expect(await authRepo.getAccessToken(), isNull);

      // DeviceSyncCredentialCoordinator works completely independently
      final token = await deviceCoordinator.getAccessToken();
      expect(token, 'mock.device.sync.jwt');
      expect(token, isNotEmpty);
    });

    test('C: store failure / DeviceSyncUnavailable does not affect local auth or loginOffline', () async {
      // Device sync store is broken / unavailable
      when(() => deviceStore.readCredential()).thenThrow(
        const DeviceSyncUnavailableException('Keystore completely dead'),
      );

      // Device coordinator throws DeviceSyncUnavailableException
      await expectLater(
        deviceCoordinator.getAccessToken(),
        throwsA(isA<DeviceSyncUnavailableException>()),
      );

      // BUT local auth remains 100% operational
      final offlineUser = UserEntity(
        id: 'local-u3',
        email: 'u3@local',
        name: 'Local User 3',
        role: 'cashier',
        pinHash: 'hashed-3333',
        isActive: true,
      );
      when(() => userDao.findUserById('local-u3')).thenAnswer((_) async => offlineUser);
      when(() => securityProfileDao.findByUserId('local-u3')).thenAnswer(
        (_) async => SecurityProfileEntity(
          userId: 'local-u3',
          pinHash: 'hashed-3333',
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      );
      when(() => localAuthService.verifyPin('3333', 'hashed-3333')).thenReturn(true);

      final loggedIn = await authRepo.loginOffline('local-u3', '3333');
      expect(loggedIn?.id, 'local-u3');
    });
  });
}
