import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/local_totp_seed_cipher.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockDio extends Mock implements Dio {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

void main() {
  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockDio dio;
  late AuthRepositoryImpl repository;
  late _MockLocalAuthService localAuthService;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;

  setUp(() {
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    dio = _MockDio();
    localAuthService = _MockLocalAuthService();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();
    when(
      () => totpSeedKeyProvider.getKeyMaterial(),
    ).thenAnswer((_) async => '0123456789abcdef0123456789abcdef');

    when(() => userDao.deleteAllUsers()).thenAnswer((_) async {});
    when(() => userDao.insertUsers(any())).thenAnswer((_) async {});
    when(() => securityProfileDao.deleteAll()).thenAnswer((_) async {});
    when(
      () => securityProfileDao.insertProfiles(any()),
    ).thenAnswer((_) async {});
    when(
      () => securityProfileDao.findLegacyPlaintextTotpSeeds(),
    ).thenAnswer((_) async => <SecurityProfileEntity>[]);
    when(
      () => securityProfileDao.updateTotpSecretSeed(any(), any()),
    ).thenAnswer((_) async {});

    repository = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: totpSeedKeyProvider,
    );
  });

  group('authorizeOverride offline validation', () {
    const supervisorId = 'sup-1';
    final profile = SecurityProfileEntity(
      userId: supervisorId,
      pinHash: 'hashed-1234',
      totpSecretSeed: LocalTotpSeedCipher(
        keyMaterial: '0123456789abcdef0123456789abcdef',
      ).encryptNullable('secret-seed'),
      isTotpEnabled: true,
      isPinEnabled: true,
    );

    test('validates PIN override successfully', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => profile);
      when(
        () => localAuthService.verifyPin('1234', 'hashed-1234'),
      ).thenReturn(true);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        pin: '1234',
      );

      expect(result, isTrue);
    });

    test('fails PIN override if PIN is wrong', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => profile);
      when(
        () => localAuthService.verifyPin('4321', 'hashed-1234'),
      ).thenReturn(false);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        pin: '4321',
      );

      expect(result, isFalse);
    });

    test(
      'locks PIN path for 5 minutes after 3 failures in 60 seconds and still allows TOTP fallback',
      () async {
        when(
          () => securityProfileDao.findByUserId(supervisorId),
        ).thenAnswer((_) async => profile);
        when(() => localAuthService.verifyPin(any(), any())).thenReturn(false);
        when(
          () => localAuthService.verifyTotp('123456', 'secret-seed'),
        ).thenReturn(true);

        await repository.authorizeOverride(
          supervisorId: supervisorId,
          pin: '0000',
        );
        await repository.authorizeOverride(
          supervisorId: supervisorId,
          pin: '0000',
        );
        await repository.authorizeOverride(
          supervisorId: supervisorId,
          pin: '0000',
        );

        final lockedPinResult = await repository.authorizeOverride(
          supervisorId: supervisorId,
          pin: '1234',
        );
        final totpFallbackResult = await repository.authorizeOverride(
          supervisorId: supervisorId,
          totpCode: '123456',
        );

        expect(lockedPinResult, isFalse);
        expect(totpFallbackResult, isTrue);
        verifyNever(() => localAuthService.verifyPin('1234', 'hashed-1234'));
      },
    );

    test('validates TOTP override successfully', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => profile);
      when(
        () => localAuthService.verifyTotp('123456', 'secret-seed'),
      ).thenReturn(true);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        totpCode: '123456',
      );

      expect(result, isTrue);
    });

    test('fails TOTP override if code is wrong', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => profile);
      when(
        () => localAuthService.verifyTotp('654321', 'secret-seed'),
      ).thenReturn(false);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        totpCode: '654321',
      );

      expect(result, isFalse);
    });

    test('fails if neither pin nor totp is provided', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => profile);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
      );

      expect(result, isFalse);
    });

    test('fails if security profile not found', () async {
      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => null);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        pin: '1234',
      );

      expect(result, isFalse);
    });
  });

  group('loginOffline uses SecurityProfile isolation', () {
    test('rejects legacy setup-admin static PIN backdoor', () async {
      when(
        () => userDao.findUserById('setup-admin'),
      ).thenAnswer((_) async => null);

      final user = await repository.loginOffline('setup-admin', '123456');

      expect(user, isNull);
      verifyNever(() => localAuthService.verifyPin(any(), any()));
    });

    test(
      'rejects login when profile is missing even if legacy user pin_hash exists',
      () async {
        const userId = 'legacy-u1';
        final legacyHash =
            r'$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

        when(() => userDao.findUserById(userId)).thenAnswer(
          (_) async => UserEntity(
            id: userId,
            name: 'Legacy User',
            role: 'CASHIER',
            pinHash: legacyHash,
            isActive: true,
            email: 'legacy@omnifood.ni',
            tenantId: 'tenant-1',
          ),
        );
        when(
          () => securityProfileDao.findByUserId(userId),
        ).thenAnswer((_) async => null);

        final user = await repository.loginOffline(userId, '123456');

        expect(user, isNull);
        verifyNever(() => localAuthService.verifyPin(any(), any()));
      },
    );
  });

  test(
    'loginOnline does not allow hardcoded credentials when backend auth fails',
    () async {
      when(
        () => dio.post('/identity/login', data: any(named: 'data')),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/identity/login'),
          message: 'Unauthorized',
        ),
      );

      final result = await repository.loginOnline(
        'admin@omnifood.ni',
        'admin123',
      );

      expect(result, isNull);
      verify(
        () => dio.post('/identity/login', data: any(named: 'data')),
      ).called(1);
    },
  );

  test(
    'loginOnline falls back to offline auth and marks pending sync on network timeout',
    () async {
      const email = 'cashier@omnifood.ni';
      const pin = '1234';
      final localUser = UserEntity(
        id: 'u-1',
        name: 'Cashier One',
        role: 'CASHIER',
        pinHash: '',
        isActive: true,
        email: email,
        tenantId: 'tenant-1',
      );
      final localProfile = SecurityProfileEntity(
        userId: 'u-1',
        pinHash: r'$2b$10$pin-hash',
        isPinEnabled: true,
        isTotpEnabled: false,
      );

      when(
        () => dio.post('/identity/login', data: any(named: 'data')),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/identity/login'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      when(() => userDao.findUserByEmail(email)).thenAnswer((_) async => localUser);
      when(() => securityProfileDao.findByUserId('u-1')).thenAnswer((_) async => localProfile);
      when(() => localAuthService.verifyPin(pin, r'$2b$10$pin-hash')).thenReturn(true);

      final result = await repository.loginOnline(email, pin);

      expect(result, isNotNull);
      expect(result?.id, equals('u-1'));
      expect(repository.isPendingSync, isTrue);
      expect(repository.lastSyncTimestamp, isNull);
    },
  );

  test('loginOnline falls back to offline auth on 5xx backend error', () async {
    const email = 'cashier@omnifood.ni';
    const pin = '1234';
    final localUser = UserEntity(
      id: 'u-1',
      name: 'Cashier One',
      role: 'CASHIER',
      pinHash: '',
      isActive: true,
      email: email,
      tenantId: 'tenant-1',
    );
    final localProfile = SecurityProfileEntity(
      userId: 'u-1',
      pinHash: r'$2b$10$pin-hash',
      isPinEnabled: true,
      isTotpEnabled: false,
    );

    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        response: Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 503,
        ),
        type: DioExceptionType.badResponse,
      ),
    );
    when(() => userDao.findUserByEmail(email)).thenAnswer((_) async => localUser);
    when(() => securityProfileDao.findByUserId('u-1')).thenAnswer((_) async => localProfile);
    when(() => localAuthService.verifyPin(pin, r'$2b$10$pin-hash')).thenReturn(true);

    final result = await repository.loginOnline(email, pin);

    expect(result, isNotNull);
    expect(result?.id, equals('u-1'));
    expect(repository.isPendingSync, isTrue);
  });

  test('loginOnline does not fallback for 401 unauthorized responses', () async {
    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        response: Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 401,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    final result = await repository.loginOnline('cashier@omnifood.ni', 'bad-pin');

    expect(result, isNull);
    verifyNever(() => userDao.findUserByEmail(any()));
  });

  test('loginOnline does not fallback for 403 forbidden responses', () async {
    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        response: Response(
          requestOptions: RequestOptions(path: '/identity/login'),
          statusCode: 403,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    final result = await repository.loginOnline('cashier@omnifood.ni', 'bad-pin');

    expect(result, isNull);
    verifyNever(() => userDao.findUserByEmail(any()));
    verifyNever(() => userDao.findAllUsers());
  });

  test('loginOnline returns null when fallback local credentials are invalid', () async {
    const email = 'cashier@omnifood.ni';
    final localUser = UserEntity(
      id: 'u-1',
      name: 'Cashier One',
      role: 'CASHIER',
      pinHash: '',
      isActive: true,
      email: email,
      tenantId: 'tenant-1',
    );
    final localProfile = SecurityProfileEntity(
      userId: 'u-1',
      pinHash: r'$2b$10$pin-hash',
      isPinEnabled: true,
      isTotpEnabled: false,
    );

    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        type: DioExceptionType.connectionError,
      ),
    );
    when(() => userDao.findUserByEmail(email)).thenAnswer((_) async => localUser);
    when(() => securityProfileDao.findByUserId('u-1')).thenAnswer((_) async => localProfile);
    when(() => localAuthService.verifyPin('wrong', r'$2b$10$pin-hash')).thenReturn(false);

    final result = await repository.loginOnline(email, 'wrong');

    expect(result, isNull);
    expect(repository.isPendingSync, isFalse);
  });

  test('loginOnline returns null when fallback local user is unknown', () async {
    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        type: DioExceptionType.connectionError,
      ),
    );
    when(() => userDao.findUserByEmail('unknown-user')).thenAnswer((_) async => null);
    when(() => userDao.findAllUsers()).thenAnswer((_) async => <UserEntity>[]);

    final result = await repository.loginOnline('unknown-user', '1234');

    expect(result, isNull);
    expect(repository.isPendingSync, isFalse);
    verifyNever(() => localAuthService.verifyPin(any(), any()));
  });

  test('loginOnline matches offline local user by username fallback', () async {
    const username = 'cashier';
    const pin = '1234';
    final localUser = UserEntity(
      id: 'u-1',
      name: 'Cashier One',
      role: 'CASHIER',
      pinHash: '',
      isActive: true,
      email: 'cashier@omnifood.ni',
      tenantId: 'tenant-1',
    );
    final localProfile = SecurityProfileEntity(
      userId: 'u-1',
      pinHash: r'$2b$10$pin-hash',
      isPinEnabled: true,
      isTotpEnabled: false,
    );

    when(
      () => dio.post('/identity/login', data: any(named: 'data')),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        type: DioExceptionType.connectionTimeout,
      ),
    );
    when(() => userDao.findUserByEmail(username)).thenAnswer((_) async => null);
    when(() => userDao.findAllUsers()).thenAnswer((_) async => <UserEntity>[localUser]);
    when(() => securityProfileDao.findByUserId('u-1')).thenAnswer((_) async => localProfile);
    when(() => localAuthService.verifyPin(pin, r'$2b$10$pin-hash')).thenReturn(true);

    final result = await repository.loginOnline(username, pin);

    expect(result, isNotNull);
    expect(result?.id, equals('u-1'));
    expect(repository.isPendingSync, isTrue);
  });

  test('syncStaff captures continuity snapshot timestamp when wrapper response is used', () async {
    when(
      () => dio.get('/identity/staff', options: any(named: 'options')),
    ).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/identity/staff'),
        data: {
          'staff': [
            {
              'id': 'u-1',
              'name': 'Cashier One',
              'role': 'CASHIER',
              'is_active': true,
              'email': 'cashier@omnifood.ni',
              'tenant_id': 't-1',
            },
          ],
          'metadata': {
            'snapshot_timestamp': '2026-05-26T12:00:00Z',
          },
        },
      ),
    );

    await repository.syncStaff();

    expect(repository.lastSyncTimestamp, equals(DateTime.parse('2026-05-26T12:00:00Z')));
    expect(repository.isPendingSync, isFalse);
  });

  test('syncStaff stores user data and security profile separately', () async {
    when(
      () => dio.get('/identity/staff', options: any(named: 'options')),
    ).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/identity/staff'),
        data: [
          {
            'id': 'u-1',
            'name': 'Cashier One',
            'role': 'CASHIER',
            'is_active': true,
            'email': 'cashier@omnifood.ni',
            'tenant_id': 't-1',
            'security_profile': {
              'user_id': 'u-1',
              'pin_hash': r'$2a$12$abcdefghijklmnopqrstuv',
              'totp_secret_seed': 'seed-123',
              'is_totp_enabled': true,
              'is_pin_enabled': true,
            },
          },
        ],
      ),
    );

    await repository.syncStaff();

    final insertedUsers =
        verify(() => userDao.insertUsers(captureAny())).captured.single
            as List<UserEntity>;
    final insertedProfiles =
        verify(
              () => securityProfileDao.insertProfiles(captureAny()),
            ).captured.single
            as List<SecurityProfileEntity>;

    expect(insertedUsers, hasLength(1));
    expect(insertedProfiles, hasLength(1));
    expect(insertedUsers.first.pinHash, isEmpty);
    expect(insertedProfiles.first.userId, equals('u-1'));
    expect(insertedProfiles.first.pinHash, isNotEmpty);
    expect(insertedProfiles.first.totpSecretSeed, startsWith('enc:v2:'));
  });

  test(
    'syncStaff encrypts totp_secret_seed with non-deterministic IV/nonce per row',
    () async {
      when(
        () => dio.get('/identity/staff', options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          data: [
            {
              'id': 'u-1',
              'name': 'Cashier One',
              'role': 'CASHIER',
              'is_active': true,
              'tenant_id': 't-1',
              'security_profile': {
                'user_id': 'u-1',
                'pin_hash': r'$2a$12$abcdefghijklmnopqrstuv',
                'totp_secret_seed': 'seed-123',
                'is_totp_enabled': true,
                'is_pin_enabled': true,
              },
            },
          ],
        ),
      );

      await repository.syncStaff();
      final firstProfiles =
          verify(
                () => securityProfileDao.insertProfiles(captureAny()),
              ).captured.first
              as List<SecurityProfileEntity>;
      final firstCiphertext = firstProfiles.first.totpSecretSeed!;

      await repository.syncStaff();
      final secondProfiles =
          verify(
                () => securityProfileDao.insertProfiles(captureAny()),
              ).captured.last
              as List<SecurityProfileEntity>;
      final secondCiphertext = secondProfiles.first.totpSecretSeed!;

      expect(firstCiphertext, startsWith('enc:v2:'));
      expect(secondCiphertext, startsWith('enc:v2:'));
      expect(firstCiphertext, isNot(equals(secondCiphertext)));
    },
  );

  test(
    'normalizes legacy plaintext totp seeds to encrypted format before auth/sync runtime',
    () async {
      final legacyProfile = SecurityProfileEntity(
        userId: 'u-legacy',
        pinHash: 'hash',
        totpSecretSeed: 'legacy-plain-seed',
        isTotpEnabled: true,
        isPinEnabled: true,
      );
      when(
        () => securityProfileDao.findLegacyPlaintextTotpSeeds(),
      ).thenAnswer((_) async => [legacyProfile]);

      await repository.normalizeLegacyPlaintextTotpSeeds();

      final captured = verify(
        () => securityProfileDao.updateTotpSecretSeed('u-legacy', captureAny()),
      ).captured.single as String;
      expect(captured, startsWith('enc:v2:'));
      expect(captured, isNot(equals('legacy-plain-seed')));
    },
  );

  test(
    'syncStaff fails-closed when secure key material is unavailable',
    () async {
      when(
        () => totpSeedKeyProvider.getKeyMaterial(),
      ).thenThrow(StateError('missing device bound key'));
      when(
        () => dio.get('/identity/staff', options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          data: [
            {
              'id': 'u-1',
              'name': 'Cashier One',
              'role': 'CASHIER',
              'is_active': true,
              'tenant_id': 't-1',
              'security_profile': {
                'user_id': 'u-1',
                'totp_secret_seed': 'seed-123',
              },
            },
          ],
        ),
      );

      expect(repository.syncStaff(), throwsA(isA<StateError>()));
      verifyNever(() => securityProfileDao.insertProfiles(any()));
    },
  );

  test(
    'syncStaff creates default profile when payload omits security_profile',
    () async {
      when(
        () => dio.get('/identity/staff', options: any(named: 'options')),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/staff'),
          data: [
            {
              'id': 'u-2',
              'name': 'Waiter Two',
              'role': 'WAITER',
              'is_active': true,
              'tenant_id': 't-1',
            },
          ],
        ),
      );

      await repository.syncStaff();

      final insertedUsers =
          verify(() => userDao.insertUsers(captureAny())).captured.last
              as List<UserEntity>;
      final insertedProfiles =
          verify(
                () => securityProfileDao.insertProfiles(captureAny()),
              ).captured.last
              as List<SecurityProfileEntity>;

      expect(insertedUsers.first.pinHash, isEmpty);
      expect(insertedProfiles.first.userId, equals('u-2'));
      expect(insertedProfiles.first.pinHash, isNull);
      expect(insertedProfiles.first.isPinEnabled, isTrue);
      expect(insertedProfiles.first.isTotpEnabled, isFalse);
    },
  );

  test(
    'authorizeOverride requires encrypted seed at runtime and rejects plaintext row',
    () async {
      const supervisorId = 'sup-legacy';
      final legacyPlaintextProfile = SecurityProfileEntity(
        userId: supervisorId,
        pinHash: 'hashed-1234',
        totpSecretSeed: 'legacy-seed-plaintext',
        isTotpEnabled: true,
        isPinEnabled: true,
      );

      when(
        () => securityProfileDao.findByUserId(supervisorId),
      ).thenAnswer((_) async => legacyPlaintextProfile);

      final result = await repository.authorizeOverride(
        supervisorId: supervisorId,
        totpCode: '123456',
      );

      expect(result, isFalse);
      verifyNever(() => localAuthService.verifyTotp(any(), any()));
    },
  );
}
