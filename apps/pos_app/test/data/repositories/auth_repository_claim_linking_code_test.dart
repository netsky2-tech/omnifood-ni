import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockDio extends Mock implements Dio {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockTotpSeedKeyProvider extends Mock implements TotpSeedKeyProvider {}

/// Verifies the PRE-AUTH linking claim wire contract (issue #556):
/// POST /onboarding/activation/link with {code, deviceId} and NO
/// Authorization header, plus user-facing error mapping.
void main() {
  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockDio claimDio;
  late _MockLocalAuthService localAuthService;
  late _MockTotpSeedKeyProvider totpSeedKeyProvider;
  late BaseOptions claimBaseOptions;
  late AuthRepositoryImpl repository;

  final capturedPaths = <String>[];
  final capturedBodies = <Map<String, dynamic>>[];

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
    registerFallbackValue(Options());
  });

  setUp(() {
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    claimDio = _MockDio();
    localAuthService = _MockLocalAuthService();
    totpSeedKeyProvider = _MockTotpSeedKeyProvider();
    when(() => totpSeedKeyProvider.getKeyMaterial()).thenAnswer(
      (_) async => '0123456789abcdef0123456789abcdef',
    );
    when(() => userDao.deleteAllUsers()).thenAnswer((_) async {});
    when(() => userDao.insertUsers(any())).thenAnswer((_) async {});
    when(() => securityProfileDao.deleteAll()).thenAnswer((_) async {});
    when(() => securityProfileDao.insertProfiles(any()))
        .thenAnswer((_) async {});
    when(() => securityProfileDao.findLegacyPlaintextTotpSeeds())
        .thenAnswer((_) async => []);

    claimBaseOptions = BaseOptions()
      ..headers['Authorization'] = 'Bearer stale-token';
    when(() => claimDio.options).thenReturn(claimBaseOptions);

    capturedPaths.clear();
    capturedBodies.clear();
    when(() => claimDio.post(any(),
        data: any(named: 'data'), options: any(named: 'options')))
        .thenAnswer((inv) async {
      capturedPaths.add(inv.positionalArguments.first as String);
      capturedBodies.add(
        Map<String, dynamic>.from(inv.namedArguments[#data] as Map),
      );
      return Response(
        requestOptions: RequestOptions(path: '/onboarding/activation/link'),
        statusCode: 200,
        data: {
          'tenantId': 'tenant-uuid-1',
          'slug': 'soho',
          'deviceId': 'pos-local-abc',
          'linkedAt': '2026-02-14T10:00:00.000Z',
        },
      );
    });

    repository = AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      _MockDio(),
      totpSeedKeyProvider: totpSeedKeyProvider,
      claimDio: claimDio,
    );
  });

  test('claimLinkingCode posts raw trimmed code and deviceId to the pre-auth '
      'link endpoint', () async {
    final linking = await repository.claimLinkingCode('  ab12cd  ', 'pos-local-abc');

    expect(capturedPaths.single, '/onboarding/activation/link');
    expect(capturedBodies.single['code'], 'ab12cd');
    expect(capturedBodies.single['deviceId'], 'pos-local-abc');
    expect(capturedBodies.single.containsKey('tenantSlug'), isFalse);
    expect(linking.slug, 'soho');
    expect(linking.tenantId, 'tenant-uuid-1');
    expect(linking.deviceId, 'pos-local-abc');
    expect(linking.linkedAt, '2026-02-14T10:00:00.000Z');
  });

  test('claimLinkingCode never sends an Authorization header, even when a '
      'stale token sits on the claim client', () async {
    expect(claimBaseOptions.headers['Authorization'], isNotNull);

    await repository.claimLinkingCode('AB12CD', 'pos-local-abc');

    expect(claimBaseOptions.headers.containsKey('Authorization'), isFalse);
  });

  test('claimLinkingCode maps 401 to one generic non-enumerating failure',
      () async {
    when(() => claimDio.post(any(),
            data: any(named: 'data'), options: any(named: 'options')))
        .thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/onboarding/activation/link'),
        response: Response(
          requestOptions: RequestOptions(path: '/onboarding/activation/link'),
          statusCode: 401,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      repository.claimLinkingCode('XXXXXX', 'pos-local-abc'),
      throwsA(
        isA<LinkingClaimException>()
            .having((e) => e.statusCode, 'statusCode', 401)
            .having((e) => e.userMessage, 'userMessage',
                'Código de vinculación inválido o expirado. Solicite uno nuevo.'),
      ),
    );
  });

  test('claimLinkingCode maps 429 to the rate-limit failure', () async {
    when(() => claimDio.post(any(),
            data: any(named: 'data'), options: any(named: 'options')))
        .thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/onboarding/activation/link'),
        response: Response(
          requestOptions: RequestOptions(path: '/onboarding/activation/link'),
          statusCode: 429,
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      repository.claimLinkingCode('XXXXXX', 'pos-local-abc'),
      throwsA(
        isA<LinkingClaimException>()
            .having((e) => e.statusCode, 'statusCode', 429)
            .having(
                (e) => e.userMessage, 'userMessage',
                'Demasiados intentos, aguarde un momento.'),
      ),
    );
  });

  test('claimLinkingCode maps network errors to the connection failure',
      () async {
    when(() => claimDio.post(any(),
            data: any(named: 'data'), options: any(named: 'options')))
        .thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/onboarding/activation/link'),
        type: DioExceptionType.connectionError,
      ),
    );

    await expectLater(
      repository.claimLinkingCode('XXXXXX', 'pos-local-abc'),
      throwsA(
        isA<LinkingClaimException>().having((e) => e.userMessage,
            'userMessage', 'Error de conexión. Verifique su red e intente de nuevo.'),
      ),
    );
  });
}
