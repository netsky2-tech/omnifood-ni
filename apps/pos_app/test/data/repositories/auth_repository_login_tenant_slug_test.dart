import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockDio extends Mock implements Dio {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

/// Verifies the POST /identity/login wire contract for the optional
/// `tenantSlug` field: it is sent only when a non-empty slug is provided,
/// and omitted entirely for legacy/unprovisioned installs (issue #556).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockDio dio;
  late _MockLocalAuthService localAuthService;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;
  late AuthRepositoryImpl repository;
  final capturedLoginBodies = <Map<String, dynamic>>[];

  final loginResponse = Response(
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
    },
  );

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    capturedLoginBodies.clear();
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    dio = _MockDio();
    localAuthService = _MockLocalAuthService();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();
    when(() => totpSeedKeyProvider.getKeyMaterial()).thenAnswer(
      (_) async => '0123456789abcdef0123456789abcdef',
    );

    when(() => dio.options).thenReturn(BaseOptions());
    when(() => securityProfileDao.findLegacyPlaintextTotpSeeds())
        .thenAnswer((_) async => []);
    when(() => userDao.deleteAllUsers()).thenAnswer((_) async {});
    when(() => userDao.insertUsers(any())).thenAnswer((_) async {});
    when(() => securityProfileDao.deleteAll()).thenAnswer((_) async {});
    when(() => securityProfileDao.insertProfiles(any()))
        .thenAnswer((_) async {});

    when(() => dio.post(any(), data: any(named: 'data'))).thenAnswer((inv) async {
      capturedLoginBodies.add(
        Map<String, dynamic>.from(inv.namedArguments[#data] as Map),
      );
      return loginResponse;
    });
    // syncStaff GET /identity/staff: empty staff list.
    when(() => dio.get(any())).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/identity/staff'),
        statusCode: 200,
        data: {'staff': <dynamic>[]},
      ),
    );

    repository = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      totpSeedKeyProvider: totpSeedKeyProvider,
    );
  });

  test('loginOnline sends tenantSlug when a non-empty slug is provided', () async {
    await repository.loginOnline(
      'cajero@omnifood.ni',
      'secret',
      tenantSlug: 'omnifood-managua',
    );

    expect(capturedLoginBodies, hasLength(1));
    expect(capturedLoginBodies.single['tenantSlug'], 'omnifood-managua');
    expect(capturedLoginBodies.single['email'], 'cajero@omnifood.ni');
    expect(capturedLoginBodies.single['pass'], 'secret');
  });

  test('loginOnline omits the tenantSlug key entirely when no slug is provided', () async {
    await repository.loginOnline('cajero@omnifood.ni', 'secret');

    expect(capturedLoginBodies, hasLength(1));
    expect(capturedLoginBodies.single.containsKey('tenantSlug'), isFalse);
  });

  test('loginOnline omits the tenantSlug key when the slug is blank', () async {
    await repository.loginOnline(
      'cajero@omnifood.ni',
      'secret',
      tenantSlug: '   ',
    );

    expect(capturedLoginBodies, hasLength(1));
    expect(capturedLoginBodies.single.containsKey('tenantSlug'), isFalse);
  });

  test('loginOnline trims surrounding whitespace from the provided slug', () async {
    await repository.loginOnline(
      'cajero@omnifood.ni',
      'secret',
      tenantSlug: '  omnifood-managua  ',
    );

    expect(capturedLoginBodies.single['tenantSlug'], 'omnifood-managua');
  });
}
