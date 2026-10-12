import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/network/unconfigured_backend_interceptor.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

class _MockUserDao extends Mock implements UserDao {}
class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}
class _MockDio extends Mock implements Dio {}
class _MockLocalAuthService extends Mock implements LocalAuthService {}
class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

/// An unconfigured transport must surface its own honest operator condition
/// on online login (never a network failure); real failures keep network copy.
void main() {
  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockLocalAuthService localAuthService;
  late _MockDio dio;
  late AuthRepositoryImpl repository;

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  setUp(() {
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    localAuthService = _MockLocalAuthService();
    dio = _MockDio();
    when(() => dio.options).thenReturn(BaseOptions());
    repository = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: _MockTotpSeedKeyProvider(),
    );
  });

  test('loginOnline surfaces the no-server-configured condition on an '
      'unconfigured transport', () async {
    when(() => dio.post(any(), data: any(named: 'data'))).thenThrow(
      UnconfiguredBackendException(
        RequestOptions(path: '/identity/login'),
        ApiBaseUrlSource.unconfigured,
      ),
    );
    when(() => userDao.findAllUsers()).thenAnswer((_) async => []);
    when(() => userDao.findUserByEmail(any())).thenAnswer((_) async => null);

    final user = await repository.loginOnline('cajero@omnifood.ni', 'secret');

    expect(user, isNull);
    expect(repository.lastAuthError,
        'Sin conexión al servidor y usuario no encontrado localmente.');
  });

  test('loginOnline keeps network/offline-fallback copy for a genuine '
      'timeout', () async {
    when(() => userDao.findAllUsers()).thenAnswer((_) async => []);
    when(() => userDao.findUserByEmail(any())).thenAnswer((_) async => null);
    when(() => dio.post(any(), data: any(named: 'data'))).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/identity/login'),
        type: DioExceptionType.connectionTimeout,
      ),
    );

    final user = await repository.loginOnline('cajero@omnifood.ni', 'secret');

    expect(user, isNull);
    expect(repository.lastAuthError,
        'Sin conexión al servidor y usuario no encontrado localmente.');
  });

  test('loginOnline on an unconfigured transport still authenticates a '
      'locally cached user with a valid PIN (offline-first)', () async {
    when(() => userDao.findUserByEmail(any())).thenAnswer(
      (_) async => UserEntity(
        id: 'local-cashier-1',
        name: 'Cajero Local',
        role: 'cashier',
        pinHash: '',
        isActive: true,
      ),
    );
    when(() => securityProfileDao.findByUserId('local-cashier-1')).thenAnswer(
      (_) async => SecurityProfileEntity(
        userId: 'local-cashier-1',
        pinHash: 'h',
        isPinEnabled: true,
        isTotpEnabled: false,
      ),
    );
    when(() => localAuthService.verifyPin('1234', 'h')).thenReturn(true);
    when(() => dio.post(any(), data: any(named: 'data'))).thenThrow(
      UnconfiguredBackendException(
        RequestOptions(path: '/identity/login'),
        ApiBaseUrlSource.unconfigured,
      ),
    );

    final user = await repository.loginOnline('cajero@omnifood.ni', '1234');

    expect(user?.id, 'local-cashier-1');
    expect(repository.lastAuthError,
        'Esta terminal no tiene un servidor configurado. '
        'El inicio de sesión en línea no está disponible.');
  });
}
