import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/entitlements/entitlement_snapshot.dart';
import 'package:pos_app/domain/services/entitlements/entitlement_snapshot_service.dart';

/// In-memory stand-in for the Floor [LocalConfigDao]: same three-method
/// surface the service uses, no SQLite needed.
class FakeLocalConfigDao implements LocalConfigDao {
  final Map<String, String> store = {};

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final value = store[key];
    return value == null ? null : LocalConfigEntity(key: key, value: value);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    store[config.key] = config.value;
  }

  @override
  Future<void> deleteConfig(String key) async {
    store.remove(key);
  }
}

/// Mockito-backed Dio that ALSO records every `get` path so tests can assert
/// "no request was made" without compile-fragile matcher typing.
class StubDio extends Mock implements Dio {
  final List<String> getCalls = [];

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) {
    getCalls.add(path);
    return super.noSuchMethod(
      Invocation.method(#get, [path], {
        #data: data,
        #queryParameters: queryParameters,
        #options: options,
        #cancelToken: cancelToken,
        #onReceiveProgress: onReceiveProgress,
      }),
      returnValue: Future.value(Response<T>(
        requestOptions: RequestOptions(path: path),
        statusCode: 200,
      )),
      returnValueForMissingStub: Future.value(Response<T>(
        requestOptions: RequestOptions(path: path),
        statusCode: 200,
      )),
    );
  }
}

Response<T> _ok<T>(String path, Object? data) => Response<T>(
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
      data: data as T?,
    );

EntitlementSnapshot _parse(Object? json) =>
    EntitlementSnapshot.fromJson(Map<String, Object?>.from(json as Map));

Map<String, Object?> snapshotJson({
  DateTime? expiresAt,
  List<String> capabilities = const ['core.sales', 'inventory.retail'],
}) =>
    {
      'version': 1,
      'planCode': 'OPERACION',
      'status': 'active',
      'supportTier': 'standard',
      'capabilities': capabilities,
      'limits': {'limits.terminals': 1},
      'addOns': const <String>[],
      'issuedAt': DateTime.utc(2026, 1, 1).toIso8601String(),
      'expiresAt':
          (expiresAt ?? DateTime.utc(2026, 1, 2)).toIso8601String(),
    };

void main() {
  late FakeLocalConfigDao configDao;
  late StubDio dio;
  late String? tenantId;

  EntitlementSnapshotService buildService({DateTime Function()? nowUtc}) =>
      EntitlementSnapshotService(
        configDao: configDao,
        dio: dio,
        resolveTenantId: () async => tenantId,
        nowUtc: nowUtc ??
            () => DateTime.utc(2026, 1, 1, 12), // halfway through the TTL
      );

  setUp(() {
    configDao = FakeLocalConfigDao();
    dio = StubDio();
    tenantId = 'tenant-1';
  });

  group('load()', () {
    test('returns the stored snapshot when it is fresh', () async {
      configDao.store['entitlements:tenant-1'] =
          jsonEncode(snapshotJson());

      final service = buildService();
      final snapshot = await service.load();

      expect(snapshot.planCode, 'OPERACION');
      expect(snapshot.capabilities, contains('inventory.retail'));
      expect(service.snapshot, same(snapshot));
    });

    test('missing row resolves to empty', () async {
      final service = buildService();
      final snapshot = await service.load();

      expect(snapshot.capabilities, isEmpty);
      expect(snapshot.planCode, isNull);
    });

    test('expired snapshot resolves to empty (§6.6)', () async {
      configDao.store['entitlements:tenant-1'] = jsonEncode(
        snapshotJson(expiresAt: DateTime.utc(2026, 1, 1, 6)),
      );

      final service = buildService();
      final snapshot = await service.load();

      expect(snapshot.capabilities, isEmpty);
      expect(snapshot, EntitlementSnapshot.empty());
    });

    test('corrupt JSON resolves to empty (§6.6)', () async {
      configDao.store['entitlements:tenant-1'] = '{not valid json';

      final service = buildService();
      final snapshot = await service.load();

      expect(snapshot.capabilities, isEmpty);
    });

    test('JSON that is not an object resolves to empty', () async {
      configDao.store['entitlements:tenant-1'] = '[1, 2, 3]';

      final service = buildService();
      expect((await service.load()).capabilities, isEmpty);
    });

    test('unknown tenant resolves to empty without reading storage',
        () async {
      tenantId = null;

      final service = buildService();
      expect((await service.load()).capabilities, isEmpty);
      expect(configDao.store, isEmpty);
    });
  });

  group('refresh()', () {
    test('fetches, stores the raw JSON and returns the snapshot',
        () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', snapshotJson()),
      );

      final service = buildService();
      final snapshot = await service.refresh();

      expect(snapshot.planCode, 'OPERACION');
      expect(configDao.store['entitlements:tenant-1'],
          jsonEncode(snapshotJson()));
      expect(service.has('inventory.retail'), isTrue);
    });

    test('a failed refresh keeps the previous snapshot and never throws',
        () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', snapshotJson()),
      );
      final service = buildService();
      final first = await service.refresh();

      when(dio.get<dynamic>('/tenant/entitlements')).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/tenant/entitlements'),
          response: Response(
            requestOptions: RequestOptions(path: '/tenant/entitlements'),
            statusCode: 500,
          ),
        ),
      );

      final second = await service.refresh();
      expect(second, same(first));
      expect(service.has('inventory.retail'), isTrue);
    });

    test('an unparseable payload keeps the previous snapshot', () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', snapshotJson()),
      );
      final service = buildService();
      final first = await service.refresh();

      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', 'garbage'),
      );

      expect(await service.refresh(), same(first));
    });

    test('a network exception keeps the previous snapshot', () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/tenant/entitlements'),
          type: DioExceptionType.connectionError,
        ),
      );

      final service = buildService();
      final result = await service.refresh();

      expect(result.capabilities, isEmpty);
      expect(configDao.store, isEmpty);
    });

    test('without a tenant id no request is made', () async {
      tenantId = null;

      final service = buildService();
      await service.refresh();

      expect(dio.getCalls, isEmpty);
    });

    test('a TTL-only renewal keeps the instance; a changed plan replaces it',
        () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', snapshotJson()),
      );

      final service = buildService();
      final first = await service.refresh();
      // A refresh that only renews the TTL must keep the SAME instance: the
      // sync service uses identity as the cheap "plan changed" signal that
      // releases a plan-blocked domain, and a spurious release would flood
      // the server with operations the plan still refuses (§6.3 point 3).
      final renewed = await service.refresh();
      expect(identical(first, renewed), isTrue);
      expect(service.snapshot.capabilities, first.capabilities);

      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>(
          '/tenant/entitlements',
          snapshotJson(
            capabilities: const [
              'core.sales',
              'inventory.retail',
              'reports.margins',
            ],
          ),
        ),
      );
      final changed = await service.refresh();

      expect(identical(changed, first), isFalse);
      expect(changed.capabilities, contains('reports.margins'));
    });
  });

  group('has() / limit() semantics', () {
    test('empty snapshot grants nothing premium', () async {
      final service = buildService();
      await service.load();

      expect(service.has('inventory.retail'), isFalse);
      expect(service.has('core.sales'), isFalse);
    });

    test('has() answers only keys present in the snapshot', () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>('/tenant/entitlements', snapshotJson()),
      );
      final service = buildService();
      await service.refresh();

      expect(service.has('inventory.retail'), isTrue);
      expect(service.has('reports.margins'), isFalse);
    });

    test('limit() returns the value, and null for absent = unlimited',
        () async {
      when(dio.get<dynamic>('/tenant/entitlements')).thenAnswer(
        (_) async => _ok<dynamic>(
          '/tenant/entitlements',
          snapshotJson()
            ..['limits'] = {
              'limits.terminals': 1,
              'limits.owner_accounts': null,
            },
        ),
      );
      final service = buildService();
      await service.refresh();

      expect(service.limit('limits.terminals'), 1);
      // Stored null means unlimited…
      expect(service.limit('limits.owner_accounts'), isNull);
      // …and so does an absent key.
      expect(service.limit('limits.some_future_quota'), isNull);
    });
  });
}
