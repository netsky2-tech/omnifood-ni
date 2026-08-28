import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';

class _Dao extends Mock implements LocalConfigDao {}
class _Clock implements MonotonicClock {
  _Clock(this.value);
  Duration value;
  @override Duration elapsed() => value;
}

void main() {
  late _Dao dao; late _Clock clock; late TenantCapabilityCache cache; late DateTime now;
  const tenant = 'tenant-a';
  Map<String, Object?> response({String id = tenant}) => {
    'tenant_id': id, 'active_version': 'v3-jcs-rfc8785', 'contract_version': 1,
    'server_fetched_at': '2026-07-24T12:00:00Z', 'server_expires_at': '2026-07-25T12:00:00Z',
  };
  setUpAll(() => registerFallbackValue(LocalConfigEntity(key: 'x', value: 'x')));
  setUp(() {
    dao = _Dao(); clock = _Clock(const Duration(hours: 1)); now = DateTime.parse('2026-07-24T12:00:00Z');
    cache = TenantCapabilityCache(configDao: dao, clock: clock, bootSessionId: 'boot-a', nowUtc: () => now);
  });

  test('persists only diagnostics and authorizes a fresh same-tenant contract', () async {
    when(() => dao.saveConfig(any())).thenAnswer((_) async {});
    expect(await cache.refresh(tenantId: tenant, response: response()), isTrue);
    expect(cache.hasFreshAuthority(tenant), isTrue);
    expect(cache.hasFreshAuthority('tenant-b'), isFalse);
    expect(cache.isV3Eligible(tenant), isTrue);
    final saved = verify(() => dao.saveConfig(captureAny())).captured.single as LocalConfigEntity;
    expect(saved.key, 'audit_cap:tenant-a');
    expect(saved.value, allOf(contains('server_expires_at'), isNot(contains('boot-a'))));
  });

  test('accepts exactly 24 hours and rejects negative or expired elapsed time', () async {
    when(() => dao.saveConfig(any())).thenAnswer((_) async {});
    await cache.refresh(tenantId: tenant, response: response());
    clock.value = const Duration(hours: 25); expect(cache.hasFreshAuthority(tenant), isTrue);
    clock.value = const Duration(hours: 25, microseconds: 1); expect(cache.hasFreshAuthority(tenant), isFalse);
    clock.value = Duration.zero; expect(cache.hasFreshAuthority(tenant), isFalse);
  });

  test('fails closed for mismatch, restart, clear, malformed, revoked, and unsupported authority', () async {
    when(() => dao.saveConfig(any())).thenAnswer((_) async {});
    expect(await cache.refresh(tenantId: tenant, response: response(id: 'tenant-b')), isFalse);
    await cache.refresh(tenantId: tenant, response: response());
    expect(TenantCapabilityCache(configDao: dao, clock: clock, bootSessionId: 'boot-b').hasFreshAuthority(tenant), isFalse);
    cache.clear(); expect(cache.hasFreshAuthority(tenant), isFalse);
    for (final invalid in <Map<String, Object?>>[
      {'active_version': 'v3'}, {...response(), 'active_version': 'v2'}, {...response(), 'contract_version': 2},
      {...response(), 'server_expires_at': '2026-07-24T12:00:00Z'}, {...response(), 'server_fetched_at': '2026-07-24T13:00:00Z'},
      {...response(), 'server_fetched_at': '2026-07-24T12:06:00Z', 'server_expires_at': '2026-07-24T13:00:00Z'},
      {...response(), 'server_expires_at': '2026-07-25T12:01:00Z'},
    ]) { expect(await cache.refresh(tenantId: tenant, response: invalid), isFalse); }
    expect(cache.isV3Eligible(tenant), isFalse);
  });
}
