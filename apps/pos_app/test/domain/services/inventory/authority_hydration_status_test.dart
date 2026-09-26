import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/inventory/authority_hydration_status.dart';

/// #519 U5: the three-state guard. Row presence is the PRIMARY evidence of
/// whether this terminal holds recipe authority: `notHydrated` ("this
/// terminal never received its recipe authority") must never be raised for a
/// terminal whose authority tables are full just because its most recent
/// pull was refused — the last-attempt verdict describes the pull, not
/// whether the terminal holds authority.
void main() {
  group('AuthorityHydrationStatus', () {
    late Map<String, String> configs;
    late Map<String, int> insumoCounts;
    late AuthorityHydrationStatus status;

    void setUpFixture({
      Map<String, String> configsOverride = const {},
      Map<String, int> insumoCountsOverride = const {},
    }) {
      configs = {
        AuthorityHydrationStatus.tenantIdKey: 'tenant-alpha',
        ...configsOverride,
      };
      insumoCounts = insumoCountsOverride;
      status = AuthorityHydrationStatus(
        readConfig: (key) async => configs[key],
        countAuthorityInsumos: (tenantId) async => insumoCounts[tenantId],
      );
    }

    test('rows == 0 + no applied-ever key = notHydrated (#519 signature)',
        () async {
      setUpFixture();

      final state = await status.classify();

      expect(state, AuthorityHydrationState.notHydrated);
    });

    test('rows == 0 + applied-ever key present = hydratedEmpty', () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydratedEmpty);
    });

    test(
        'rows > 0 + LAST verdict refused = hydrated (rows are primary; '
        "yesterday's good hydration plus today's bad pull must NOT raise "
        'the never-hydrated alarm)', () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.resultKey: 'refused',
          AuthorityHydrationStatus.reasonKey: 'mixed_tenant_delta',
          AuthorityHydrationStatus.lastAtKey: '2026-09-25T12:00:00Z',
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
        insumoCountsOverride: {'tenant-alpha': 7},
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydrated);
    });

    test('rows > 0 + failed last verdict = hydrated', () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.resultKey: 'failed',
          AuthorityHydrationStatus.reasonKey: 'authority_hydration_threw',
        },
        insumoCountsOverride: {'tenant-alpha': 3},
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydrated);
    });

    test('rows > 0 + no last verdict at all + applied-ever = hydrated',
        () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
        insumoCountsOverride: {'tenant-alpha': 3},
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydrated);
    });

    test(
        'foreign-tenant rows never satisfy hydrated: rows 0 for the bound '
        'tenant + applied-ever = hydratedEmpty', () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
        insumoCountsOverride: {'tenant-beta': 7},
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydratedEmpty);
    });

    test('refused last verdict + rows 0 + applied-ever = hydratedEmpty',
        () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.resultKey: 'refused',
          AuthorityHydrationStatus.reasonKey: 'mixed_tenant_delta',
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.hydratedEmpty);
    });

    test(
        'unbound/absent tenant never yields hydratedEmpty (even with '
        'applied-ever present)', () async {
      setUpFixture(
        configsOverride: {
          AuthorityHydrationStatus.tenantIdKey: '',
          AuthorityHydrationStatus.appliedAtKey: '2026-09-24T12:00:00Z',
        },
        insumoCountsOverride: {'tenant-beta': 7},
      );

      final state = await status.classify();

      expect(state, AuthorityHydrationState.notHydrated);
    });

    test('the three states are exhaustive and mutually exclusive', () {
      expect(AuthorityHydrationState.values, hasLength(3));
      expect(
        AuthorityHydrationState.values.toSet(),
        {
          AuthorityHydrationState.notHydrated,
          AuthorityHydrationState.hydratedEmpty,
          AuthorityHydrationState.hydrated,
        },
      );
    });
  });
}
