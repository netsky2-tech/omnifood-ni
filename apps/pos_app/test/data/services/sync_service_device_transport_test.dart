import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/network/device_sync_auth_interceptor.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';
import '../security/support/fake_cloud_credential_store.dart';

class _MockAuditRepo extends Mock implements AuditRepository {}
class _MockSalesRepo extends Mock implements SalesRepository {}
class _MockInventoryRepo extends Mock implements InventoryRepository {}
class _MockExchangePort extends Mock implements DeviceSyncExchangePort {}
class _MockDeviceSyncStore extends Mock implements DeviceSyncCredentialStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _MockAuditRepo auditRepo;
  late _MockSalesRepo salesRepo;
  late _MockInventoryRepo inventoryRepo;
  late _MockExchangePort exchangePort;
  late _MockDeviceSyncStore deviceStore;
  late DeviceSyncCredentialCoordinator deviceCoordinator;
  late CloudCredentialCoordinator emptyCloudCoordinator;

  late Dio syncDio;
  late SyncService syncService;

  final pendingSaleAggregate = {
    'id': 'inv-101',
    'idempotencyKey': 'sale:term-1:inv-101',
    'sourceDeviceId': 'term-1',
    'sourceSequence': 42,
    'flowType': 'sales',
    'documentType': 'SALE',
    'invoiceId': 'inv-101',
    'terminalId': 'term-1',
    'invoice': {
      'id': 'inv-101',
      'number': '001-001-01-00000042',
      'createdAt': '2026-03-01T12:00:00.000Z',
      'userId': 'cashier-device-owner',
      'subtotal': 100.0,
      'totalTax': 15.0,
      'total': 115.0,
      'paymentStatus': 'PAID',
      'items': <dynamic>[],
      'payments': <dynamic>[],
    },
  };

  final activeDeviceCred = DeviceSyncCredentialRecord(
    credentialId: 'cred-sync-1',
    tenantId: 'tenant-100',
    deviceId: 'term-1',
    renewalSecret: 'sec_1234567890abcdef',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2028, 1, 1),
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUpAll(() {
    registerFallbackValue(activeDeviceCred);
  });

  setUp(() {
    auditRepo = _MockAuditRepo();
    salesRepo = _MockSalesRepo();
    inventoryRepo = _MockInventoryRepo();
    exchangePort = _MockExchangePort();
    deviceStore = _MockDeviceSyncStore();

    when(() => auditRepo.deviceId).thenReturn('term-1');

    // Audit logs sync clean outcome
    when(() => auditRepo.syncLogs()).thenAnswer(
      (_) async => const AuditSyncOutcome.complete(completedStreams: 1),
    );

    // Empty inventory collections
    when(() => inventoryRepo.getUnsyncedRecipeVersionDocuments())
        .thenAnswer((_) async => <RecipeVersionDocument>[]);
    when(() => inventoryRepo.getUnsyncedPurchases())
        .thenAnswer((_) async => <Purchase>[]);
    when(() => inventoryRepo.getUnsyncedProductionOrders())
        .thenAnswer((_) async => <ProductionOrderDocument>[]);
    when(() => inventoryRepo.getUnsyncedCountSessionDocuments())
        .thenAnswer((_) async => <CountSessionDocument>[]);
    when(() => inventoryRepo.getKardexCorrections())
        .thenAnswer((_) async => []);
    when(() => inventoryRepo.getUnsyncedForensicAlerts())
        .thenAnswer((_) async => <ForensicAlert>[]);
    when(() => inventoryRepo.getUnsyncedMovements())
        .thenAnswer((_) async => []);

    // Empty cloud coordinator (user is completely logged out)
    emptyCloudCoordinator = CloudCredentialCoordinator(
      FakeCloudCredentialStore(),
      commitId: () => 'cloud-empty',
    );

    // Device sync store and coordinator
    DeviceSyncCredentialRecord? inMemoryCred = activeDeviceCred;
    DeviceSyncCredentialRecord? candidateCred;
    when(() => deviceStore.readCredential()).thenAnswer((_) async => inMemoryCred);
    when(() => deviceStore.writeCredential(any())).thenAnswer((inv) async {
      inMemoryCred = inv.positionalArguments[0] as DeviceSyncCredentialRecord;
    });
    when(() => deviceStore.stageCandidate(any())).thenAnswer((inv) async {
      candidateCred = inv.positionalArguments[0] as DeviceSyncCredentialRecord;
    });
    when(() => deviceStore.readCandidate()).thenAnswer((_) async => candidateCred);
    when(() => deviceStore.commitCandidate()).thenAnswer((_) async {
      inMemoryCred = candidateCred;
      candidateCred = null;
    });
    when(() => deviceStore.rollbackCandidate()).thenAnswer((_) async {
      candidateCred = null;
    });

    when(() => exchangePort.renewToken(
          credentialId: any(named: 'credentialId'),
          deviceId: any(named: 'deviceId'),
          renewalSecret: any(named: 'renewalSecret'),
          tenantId: any(named: 'tenantId'),
          expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
        )).thenAnswer(
      (_) async => DeviceSyncTokenResponse(
        accessToken: 'valid.device.access.jwt',
        tokenType: 'Bearer',
        expiresIn: 900,
        expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 900)),
      ),
    );

    deviceCoordinator = DeviceSyncCredentialCoordinator(
      store: deviceStore,
      exchangePort: exchangePort,
      resolveDeviceId: () async => 'term-1',
    );

    syncDio = Dio(BaseOptions(baseUrl: 'https://sync.omnifood.test/'));
    syncDio.interceptors.add(
      DeviceSyncAuthInterceptor(
        coordinator: deviceCoordinator,
        clientDio: syncDio,
      ),
    );

    syncService = SyncService(
      auditRepo,
      salesRepo,
      inventoryRepo,
      syncDio,
    );
  });

  test(
    'SyncService operates when CloudCredentialCoordinator is empty/logged out, sending device Bearer token',
    () async {
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );
      when(() => salesRepo.markAsSynced(any())).thenAnswer((_) async {});

      // Intercept adapter call on syncDio
      late RequestOptions capturedOptions;
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('batch')) {
          capturedOptions = options;
          return ResponseBody.fromString(
            '{"processed": 1, "results": [{"idempotencyKey": "sale:term-1:inv-101", "status": "ACCEPTED"}]}',
            200,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
        if (options.path.contains('alerts')) {
          return ResponseBody.fromString(
            '{"alerts": []}',
            200,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
        return ResponseBody.fromString(
          '{}',
          200,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.complete);
      expect(capturedOptions.headers['Authorization'], 'Bearer valid.device.access.jwt');
      expect(capturedOptions.path, contains('v1/sync/batch'));

      // Verified salesRepo marked as synced
      verify(() => salesRepo.markAsSynced(['inv-101'])).called(1);
    },
  );

  test(
    'when device sync auth fails (401 / unavailable), Outbox remains pending and status surfaces AUTH_BLOCKED',
    () async {
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );

      // Server returns 401 Unauthorized for device token
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "Invalid device credentials"}',
          401,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(syncService.status, CloudSyncStatus.error);
      expect(syncService.isAuthBlocked, isTrue);
      expect(syncService.syncBlockedReason, 'AUTH_BLOCKED');

      // Crucial: sales were NOT marked as synced
      verifyNever(() => salesRepo.markAsSynced(any()));
    },
  );

  test(
    'recipe 401 does not suppress the later sales batch; failed recipe stays pending and the error names the domain',
    () async {
      final pendingRecipe = RecipeVersionDocument(
        id: 'recipe-doc-1',
        productId: 'prod-1',
        productName: 'Nacatamal',
        versionNumber: 3,
        yieldQuantity: 10,
        technicalShrinkPct: 2.0,
        createdAt: DateTime.utc(2026, 3, 1),
        components: [],
      );
      when(() => inventoryRepo.getUnsyncedRecipeVersionDocuments())
          .thenAnswer((_) async => [pendingRecipe]);
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );
      when(() => salesRepo.markAsSynced(any())).thenAnswer((_) async {});

      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('recipes/versions')) {
          return ResponseBody.fromString(
            '{"statusCode": 401, "message": "Invalid device credentials"}',
            401,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
        return ResponseBody.fromString(
          '{"processed": 1, "results": [{"idempotencyKey": "sale:term-1:inv-101", "status": "ACCEPTED"}]}',
          200,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await syncService.triggerManualSync();

      // Auth failure stays observable for the whole pass.
      expect(outcome.status, SyncRunStatus.partial);
      expect(syncService.status, CloudSyncStatus.error);
      expect(syncService.isAuthBlocked, isTrue);
      expect(syncService.syncBlockedReason, 'AUTH_BLOCKED');

      // Final error names both the reauthentication requirement and the
      // failed domain instead of discarding the per-domain details.
      expect(syncService.lastSyncError, contains('Reautenticación requerida'));
      expect(syncService.lastSyncError, contains('Recetas'));

      // Auth-failed recipe outbox remains pending (not synced, not failed).
      verifyNever(() => inventoryRepo.markRecipeVersionDocumentAsSynced(any()));

      // The independent later sales domain still ran and completed.
      verify(() => salesRepo.markAsSynced(['inv-101'])).called(1);
    },
  );

  test(
    'when device credential is revoked, Outbox remains pending and status surfaces DEVICE_REVOKED',
    () async {
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );

      // Exchange port throws DeviceSyncRevokedException
      when(() => exchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenThrow(
        const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'),
      );

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(syncService.status, CloudSyncStatus.error);
      expect(syncService.isAuthBlocked, isTrue);
      expect(syncService.syncBlockedReason, 'DEVICE_REVOKED');

      // Preserves outbox pending
      verifyNever(() => salesRepo.markAsSynced(any()));
    },
  );

  test(
    'successful reprovision after auth failure drains the exact same pending Outbox records',
    () async {
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );
      when(() => salesRepo.markAsSynced(any())).thenAnswer((_) async {});

      var batchAttempts = 0;
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('alerts')) {
          return ResponseBody.fromString(
            '{"alerts": []}',
            200,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
        batchAttempts++;
        if (batchAttempts <= 2) {
          // Both initial attempt and interceptor retry return 401
          return ResponseBody.fromString(
            '{"statusCode": 401, "message": "Token expired"}',
            401,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        } else {
          // Reprovisioned attempt: success
          return ResponseBody.fromString(
            '{"processed": 1, "results": [{"idempotencyKey": "sale:term-1:inv-101", "status": "ACCEPTED"}]}',
            200,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
      });

      // Pass 1: fails with auth blocked
      final outcome1 = await syncService.triggerManualSync();
      expect(outcome1.status, SyncRunStatus.partial);
      expect(syncService.isAuthBlocked, isTrue);
      verifyNever(() => salesRepo.markAsSynced(any()));

      // Reprovision new credential version
      await deviceCoordinator.provision(
        DeviceSyncCredentialRecord(
          credentialId: 'cred-sync-2',
          tenantId: 'tenant-100',
          deviceId: 'term-1',
          renewalSecret: 'sec_new_version_secret',
          credentialVersion: 2,
          expiresAt: DateTime.utc(2028, 1, 1),
          scopes: const ['sync:push', 'sync:pull'],
        ),
      );

      // Pass 2: succeeds and drains pending outbox
      final outcome2 = await syncService.triggerManualSync();
      expect(outcome2.status, SyncRunStatus.complete);
      expect(syncService.status, CloudSyncStatus.idle);
      verify(() => salesRepo.markAsSynced(['inv-101'])).called(1);
    },
  );

  test(
    'when device credential is revoked on /v1/sync/batch, all outbox items across sales and inventory are preserved',
    () async {
      when(() => salesRepo.getUnsyncedAggregates()).thenAnswer(
        (_) async => [pendingSaleAggregate],
      );
      final testMovement = InventoryMovement(
        id: 'mov-1',
        insumoId: 'ins-1',
        type: MovementType.adjustment,
        quantity: -1,
        previousStock: 10,
        newStock: 9,
        timestamp: DateTime.utc(2026, 1, 1),
        deliveryOwner: 'GENERIC_INVENTORY',
        deliveryState: 'LOCAL_APPLIED',
      );
      when(() => inventoryRepo.getUnsyncedMovements()).thenAnswer((_) async => [testMovement]);

      // Server returns 401 on /v1/sync/batch
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "Token expired"}',
          401,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      // When interceptor tries to renew token on 401, exchangePort reports revoked
      when(() => exchangePort.renewToken(
            credentialId: any(named: 'credentialId'),
            deviceId: any(named: 'deviceId'),
            renewalSecret: any(named: 'renewalSecret'),
            tenantId: any(named: 'tenantId'),
            expectedCredentialVersion: any(named: 'expectedCredentialVersion'),
          )).thenThrow(const DeviceSyncRevokedException(reason: 'DEVICE_REVOKED'));

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(syncService.isAuthBlocked, isTrue);
      expect(syncService.syncBlockedReason, 'DEVICE_REVOKED');

      // Outbox preservation: sales neither marked synced nor modified
      verifyNever(() => salesRepo.markAsSynced(any()));
      // Outbox preservation: movements neither marked synced nor marked failed
      verifyNever(() => inventoryRepo.markMovementAsFailed(any(), error: any(named: 'error')));
      verifyNever(() => inventoryRepo.markMovementAsSynced(any()));
    },
  );

  test(
    'when non-auth server error (500) occurs during inventory outbox sync, normal retry semantics are preserved',
    () async {
      final testMovement = InventoryMovement(
        id: 'mov-1',
        insumoId: 'ins-1',
        type: MovementType.adjustment,
        quantity: -1,
        previousStock: 10,
        newStock: 9,
        timestamp: DateTime.utc(2026, 1, 1),
        deliveryOwner: 'GENERIC_INVENTORY',
        deliveryState: 'LOCAL_APPLIED',
      );
      when(() => inventoryRepo.getUnsyncedMovements()).thenAnswer((_) async => [testMovement]);
      when(() => inventoryRepo.markMovementAsFailed('mov-1', error: any(named: 'error')))
          .thenAnswer((_) async {});

      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        if (options.path.contains('alerts')) {
          return ResponseBody.fromString(
            '{"alerts": []}',
            200,
            headers: {
              HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        }
        return ResponseBody.fromString(
          '{"statusCode": 500, "message": "Internal Server Error"}',
          500,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await syncService.triggerManualSync();

      expect(outcome.status, SyncRunStatus.partial);
      expect(syncService.isAuthBlocked, isFalse);
      verify(() => inventoryRepo.markMovementAsFailed('mov-1', error: any(named: 'error'))).called(1);
    },
  );
}

class _MockHttpClientAdapter implements HttpClientAdapter {
  _MockHttpClientAdapter(this._handler);
  final ResponseBody Function(RequestOptions options) _handler;

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
