import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

class _MockDio extends Mock implements Dio {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

/// Issue #944 — the operational question this file answers:
///
/// "The owner changes a cashier's PIN from the dashboard. Can that cashier
/// still enter the terminal with the NEW PIN?"
///
/// The terminal has TWO channels that write the same `security_profiles`
/// rows:
///
/// - the DEVICE channel (sync transport, `sync:pull`) ships the REAL hash of
///   every member of the tenant staff;
/// - the USER channel (`GET /identity/staff` with the `pos-auth-continuity`
///   scope) MASKS the hash of every user the requester may not read.
///
/// Before the fix the USER channel overwrote the DEVICE channel's rows with
/// the masked null, so the cashier was left with no hash at all and
/// `loginOffline` rejected the new PIN.
void main() {
  late _MockDio dio;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;
  late AppDatabase database;
  late AuthRepositoryImpl repository;
  late LocalAuthService localAuthService;

  const tenantId = 'tenant-1';

  Future<void> seedDeviceChannelDelivery({
    required String userId,
    required String name,
    required String email,
    required String pin,
  }) async {
    // This is what the DEVICE channel writes: the real bcrypt hash of the
    // PIN, for every member of the tenant staff.
    await database.userDao.insertUsers([
      UserEntity(
        id: userId,
        name: name,
        role: 'CASHIER',
        pinHash: '',
        isActive: true,
        email: email,
        tenantId: tenantId,
      ),
    ]);
    await database.securityProfileDao.insertProfiles([
      SecurityProfileEntity(
        userId: userId,
        pinHash: localAuthService.hashPin(pin),
        totpSecretSeed: null,
        isTotpEnabled: false,
        isPinEnabled: true,
      ),
    ]);
  }

  void stubStaffPayload(List<Map<String, dynamic>> staff) {
    when(
      () => dio.get('/identity/staff', options: any(named: 'options')),
    ).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/identity/staff'),
        data: staff,
      ),
    );
  }

  /// The USER channel payload: the requester's own hash travels, everyone
  /// else's travels masked (`pin_hash: null`, `scope: 'masked'`).
  Map<String, dynamic> staffEntry({
    required String id,
    required String name,
    required String email,
    String? pinHash,
  }) {
    return {
      'id': id,
      'name': name,
      'role': 'CASHIER',
      'is_active': true,
      'email': email,
      'tenant_id': tenantId,
      'security_profile': {
        'user_id': id,
        'pin_hash': pinHash,
        'totp_secret_seed': null,
        'is_totp_enabled': false,
        'is_pin_enabled': true,
        'scope': pinHash == null ? 'masked' : 'self',
      },
    };
  }

  setUp(() async {
    dio = _MockDio();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();
    localAuthService = LocalAuthService();
    when(
      () => totpSeedKeyProvider.getKeyMaterial(),
    ).thenAnswer((_) async => '0123456789abcdef0123456789abcdef');
    when(() => dio.options).thenReturn(BaseOptions());

    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    repository = AuthRepositoryImpl(
      database.userDao,
      database.securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: totpSeedKeyProvider,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test(
    'the cashier enters with the NEW PIN after the dashboard changed it',
    () async {
      // 1. The terminal already knows the cashier (device channel).
      await seedDeviceChannelDelivery(
        userId: 'cashier-1',
        name: 'Mateo',
        email: 'mateo@soho.com',
        pin: '1111',
      );

      // 2. The owner rotates the PIN from the dashboard: the backend now
      //    holds a new hash and the device channel ships it.
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: 'cashier-1',
          pinHash: localAuthService.hashPin('2222'),
          totpSecretSeed: null,
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
      ]);

      // 3. A staff sync lands on the USER channel: the requester is another
      //    user, so this cashier's hash arrives MASKED.
      stubStaffPayload([
        staffEntry(
          id: 'owner-1',
          name: 'Maxwell',
          email: 'admin@soho.com',
          pinHash: r'$2b$10$ownerhash',
        ),
        staffEntry(
          id: 'cashier-1',
          name: 'Mateo',
          email: 'mateo@soho.com',
        ),
      ]);
      await repository.syncStaff();

      // 4. The cashier enters with the NEW PIN.
      final user = await repository.loginOffline('cashier-1', '2222');
      expect(user, isNotNull);
      expect(user!.id, 'cashier-1');

      // 5. And the OLD PIN no longer works.
      final stale = await repository.loginOffline('cashier-1', '1111');
      expect(stale, isNull);
    },
  );

  test(
    'N staff syncs never delete the local PIN of any of N cashiers',
    () async {
      const cashiers = 5;
      for (var i = 1; i <= cashiers; i++) {
        await seedDeviceChannelDelivery(
          userId: 'cashier-$i',
          name: 'Cajero $i',
          email: 'cajero$i@soho.com',
          pin: '100$i',
        );
      }

      // The requester is cashier-1: its own hash travels (the backend sends
      // the REAL hash of the requester), the other four are masked by the
      // continuity scope.
      final requesterProfile = await database.securityProfileDao.findByUserId(
        'cashier-1',
      );
      stubStaffPayload([
        staffEntry(
          id: 'cashier-1',
          name: 'Cajero 1',
          email: 'cajero1@soho.com',
          pinHash: requesterProfile!.pinHash,
        ),
        for (var i = 2; i <= cashiers; i++)
          staffEntry(
            id: 'cashier-$i',
            name: 'Cajero $i',
            email: 'cajero$i@soho.com',
          ),
      ]);

      // The property: syncing as many times as there are cashiers keeps
      // every local PIN intact.
      for (var round = 0; round < cashiers; round++) {
        await repository.syncStaff();
      }

      for (var i = 1; i <= cashiers; i++) {
        final stored = await database.securityProfileDao.findByUserId(
          'cashier-$i',
        );
        expect(stored, isNotNull, reason: 'cashier-$i lost its profile');
        expect(
          stored!.pinHash,
          isNotNull,
          reason: 'cashier-$i lost its local PIN after $cashiers syncs',
        );
        expect(
          localAuthService.verifyPin('100$i', stored.pinHash!),
          isTrue,
          reason: 'cashier-$i can no longer enter with its PIN',
        );
      }
    },
  );
}
