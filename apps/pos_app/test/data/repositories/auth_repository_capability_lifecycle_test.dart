import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/security/totp_seed_key_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Dio extends Mock implements Dio {} class _Dao extends Mock implements LocalConfigDao {}
class _Users extends Mock implements UserDao {} class _Profiles extends Mock implements SecurityProfileDao {}
class _Auth extends Mock implements LocalAuthService {}
class _KeyProvider extends Mock implements TotpSeedKeyProvider {}
class _Clock implements MonotonicClock { @override Duration elapsed() => Duration.zero; }

Map<String, Object?> capability(String tenant) => {
  'tenant_id': tenant, 'active_version': 'v3-jcs-rfc8785', 'contract_version': 1,
  'server_fetched_at': '2026-07-24T12:00:00Z', 'server_expires_at': '2026-07-25T12:00:00Z',
};

class _Fixture {
  _Fixture() {
    when(() => dio.options).thenReturn(BaseOptions());
    when(() => dao.saveConfig(any())).thenAnswer((_) async {});
    when(() => profiles.findLegacyPlaintextTotpSeeds()).thenAnswer((_) async => []);
    when(() => users.deleteAllUsers()).thenAnswer((_) async {});
    when(() => users.insertUsers(any())).thenAnswer((_) async {});
    when(() => profiles.deleteAll()).thenAnswer((_) async {});
    when(() => profiles.insertProfiles(any())).thenAnswer((_) async {});
    when(() => keyProvider.getKeyMaterial()).thenAnswer((_) async => '0123456789abcdef0123456789abcdef');
    repository = AuthRepositoryImpl(users, profiles, auth, dio, capabilityCache: cache, totpSeedKeyProvider: keyProvider);
  }
  final dio = _Dio(); final dao = _Dao(); final users = _Users(); final profiles = _Profiles(); final auth = _Auth();
  final keyProvider = _KeyProvider();
  late final cache = TenantCapabilityCache(configDao: dao, clock: _Clock(), bootSessionId: 'boot', nowUtc: () => DateTime.parse('2026-07-24T12:00:00Z'));
  late final AuthRepositoryImpl repository;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(LocalConfigEntity(key: 'x', value: 'x')));
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  test('online login sets bearer before capability GET and accepts only its tenant', () async {
    final f = _Fixture(); var login = 0;
    when(() => f.dio.post('/identity/login', data: any(named: 'data'))).thenAnswer((_) async {
      final tenant = login++ == 0 ? 'tenant-a' : 'tenant-b';
      return Response(requestOptions: RequestOptions(path: '/identity/login'), data: {'access_token': tenant, 'user': {'id': tenant, 'name': tenant, 'role': 'CASHIER', 'is_active': true, 'tenant_id': tenant}});
    });
    when(() => f.dio.get(any())).thenAnswer((call) async {
      final path = call.positionalArguments.single as String;
      if (path == '/identity/capabilities/audit') {
        final token = f.dio.options.headers['Authorization'];
        expect(token, startsWith('Bearer tenant-'));
        return Response(requestOptions: RequestOptions(path: path), data: capability(token == 'Bearer tenant-a' ? 'tenant-a' : 'tenant-b'));
      }
      return Response(requestOptions: RequestOptions(path: path), data: []);
    });
    when(() => f.dio.get('/identity/staff', options: any(named: 'options')))
        .thenAnswer((_) async => Response(requestOptions: RequestOptions(path: '/identity/staff'), data: []));

    final first = await f.repository.loginOnline('a@example.com', 'pin');
    expect(first?.tenantId, 'tenant-a');
    expect(f.cache.hasFreshAuthority('tenant-a'), isTrue);
    final second = await f.repository.loginOnline('b@example.com', 'pin');
    expect(second?.tenantId, 'tenant-b');
    expect(f.cache.hasFreshAuthority('tenant-a'), isFalse);
    expect(f.cache.hasFreshAuthority('tenant-b'), isTrue);
  });

  test('offline login clears previously active authority', () async {
    final f = _Fixture(); await f.cache.refresh(tenantId: 'tenant-a', response: capability('tenant-a'));
    when(() => f.users.findUserById('u')).thenAnswer((_) async => UserEntity(id: 'u', name: 'U', role: 'CASHIER', pinHash: '', isActive: true, tenantId: 'tenant-a'));
    when(() => f.profiles.findByUserId('u')).thenAnswer((_) async => SecurityProfileEntity(userId: 'u', pinHash: 'hash', isPinEnabled: true, isTotpEnabled: false));
    when(() => f.auth.verifyPin('1234', 'hash')).thenReturn(true);

    await f.repository.loginOffline('u', '1234');
    expect(f.cache.hasFreshAuthority('tenant-a'), isFalse);
  });

  test('logout clears previously active authority', () async {
    final f = _Fixture(); await f.cache.refresh(tenantId: 'tenant-a', response: capability('tenant-a'));
    await f.repository.logout();
    expect(f.cache.hasFreshAuthority('tenant-a'), isFalse);
  });
}
