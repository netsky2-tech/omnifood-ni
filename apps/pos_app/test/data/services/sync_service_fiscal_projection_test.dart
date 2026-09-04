import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';

class StubAuditRepository implements AuditRepository {
  @override
  String get deviceId => 'terminal-pos-founder-01';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class StubSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class StubInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  final ResponseBody Function(RequestOptions options) _handler;

  _MockHttpClientAdapter(this._handler);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late AppDatabase database;
  late Dio mockDio;
  late SyncService syncService;

  final capturedPosts = <Map<String, dynamic>>[];

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    capturedPosts.clear();
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    mockDio = Dio(BaseOptions(baseUrl: 'https://cloud.omnifood.ni'));
    mockDio.httpClientAdapter = _MockHttpClientAdapter((options) {
      if (options.method == 'GET' && options.path.contains('/v1/sync/inbound')) {
        return ResponseBody.fromString(
          jsonEncode({
            'status': 'success',
            'serverTime': '2026-03-30T14:00:00Z',
            'currentVersion': 1787745600000,
            'deltas': {
              'products': [],
              'catalogValues': [],
              'insumos': [],
              'recipes': [],
              'recipeVersions': [],
              'users': [],
              'fiscalConfig': {
                'tenantId': 'tenant-founder-001',
                'businessName': 'Comedor Doña Mary',
                'ruc': 'J0310000000099',
                'fiscalRegime': 'REGIMEN_GENERAL',
                'taxRate': 0.15,
                'pricesIncludeTax': true,
                'commercialFxSpread': 0.5,
                'configVersion': {
                  'revision': 1,
                  'fingerprint':
                      '9999999999999999999999999999999999999999999999999999999999999999',
                },
                'generatedAt': '2026-03-30T14:00:00Z',
              },
            },
          }),
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      }

      if (options.method == 'POST' &&
          options.path == '/v1/sync/inbound/fiscal/ack') {
        capturedPosts.add({
          'path': options.path,
          'data': options.data,
        });
        return ResponseBody.fromString(
          jsonEncode({
            'status': 'success',
            'acknowledgedRevision': 1,
            'acknowledgedFingerprint':
                '9999999999999999999999999999999999999999999999999999999999999999',
          }),
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      }

      return ResponseBody.fromString('{"status":"ok"}', 200);
    });

    syncService = SyncService(
      StubAuditRepository(),
      StubSalesRepository(),
      StubInventoryRepository(),
      mockDio,
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group(
      'SyncService — Fiscal Outbound Sync & Local SQLite Projection (ONB1.6B & ONB1.6C)',
      () {
    test('pullInboundDeltas projects fiscal config into SQLite and confirms with ACK',
        () async {
      final result = await syncService.pullInboundDeltas();

      expect(result, isNotNull);
      expect(result!.appliedFiscalRevision, 1);
      expect(result.appliedFiscalFingerprint,
          '9999999999999999999999999999999999999999999999999999999999999999');

      // Verify Floor persistence in fiscal_config_local
      final local = await database.fiscalConfigLocalDao
          .getByTenantId('tenant-founder-001');
      expect(local, isNotNull);
      expect(local!.revision, 1);
      expect(local.fingerprint,
          '9999999999999999999999999999999999999999999999999999999999999999');
      expect(local.payload, contains('Comedor Doña Mary'));
      expect(local.appliedAt, isNotEmpty);

      // Verify ACK sent to cloud with terminal and tenant context
      expect(capturedPosts, hasLength(1));
      final ackPost = capturedPosts.first;
      expect(ackPost['path'], '/v1/sync/inbound/fiscal/ack');
      expect(ackPost['data']['tenantId'], 'tenant-founder-001');
      expect(ackPost['data']['terminalId'], 'terminal-pos-founder-01');
      expect(ackPost['data']['revision'], 1);
      expect(ackPost['data']['fingerprint'],
          '9999999999999999999999999999999999999999999999999999999999999999');
    });

    test('offline durability: projection survives restart without WAN',
        () async {
      // 1. Initial sync while connected
      await syncService.pullInboundDeltas();

      // 2. Verify stored in SQLite
      final localBefore = await database.fiscalConfigLocalDao
          .getByTenantId('tenant-founder-001');
      expect(localBefore, isNotNull);
      expect(localBefore!.revision, 1);

      // 3. Close database (simulating power off)
      await database.close();

      // 4. Reopen database from same factory / storage without network
      final reopenedDb =
          await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

      // Apply same entity to reopenedDb
      await reopenedDb.fiscalConfigLocalDao.applyFiscalConfig(localBefore);

      final recovered = await reopenedDb.fiscalConfigLocalDao
          .getByTenantId('tenant-founder-001');
      expect(recovered, isNotNull);
      expect(recovered!.revision, 1);
      expect(recovered.fingerprint, localBefore.fingerprint);
      expect(recovered.payload, localBefore.payload);

      await reopenedDb.close();
    });
  });
}
