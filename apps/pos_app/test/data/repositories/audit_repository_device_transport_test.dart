import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mocktail/mocktail.dart' as mt;
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/daos/audit_log_dao.dart';
import 'package:pos_app/data/daos/inventory/forensic_alert_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart' as cfg;
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/network/device_sync_auth_interceptor.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/security/device_sync_credential_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/device_sync_exchange_port.dart';
import 'audit_repository_impl_test.mocks.dart';

class _MockExchangePort extends mt.Mock implements DeviceSyncExchangePort {}

class _MockDeviceSyncStore extends mt.Mock
    implements DeviceSyncCredentialStore {}

class _Configs extends mt.Mock implements cfg.LocalConfigDao {}

class _Clock implements MonotonicClock {
  @override
  Duration elapsed() => Duration.zero;
}

class _Alerts implements ForensicAlertDao {
  @override
  Future<int?> countActiveAuditTerminalAlerts(String sourceDocumentId) async =>
      0;

  @override
  Future<void> insertIfAbsentForensicAlert(
    String id,
    String alertType,
    String severity,
    String message,
    String createdAt,
    String status,
    String sourceDocumentType,
    String sourceDocumentId,
    String metadataJson,
    bool isSynced,
  ) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
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

/// D-18 part 2: the audit stream is pushed on the DEVICE client
/// (syncDio + DeviceSyncAuthInterceptor), not the human dio, because in an
/// offline-PIN kiosk session (CERRAR SESIÓN + PIN unlock) the cloud user
/// credential is cleared and CloudAuthInterceptor pre-send-rejects every
/// human-client request. Mirrors the transport-assertion pattern of
/// test/data/services/sync_service_device_transport_test.dart.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockAuditDao mockAuditDao;
  late MockAuthRepository mockAuthRepository;
  late _MockExchangePort exchangePort;
  late _MockDeviceSyncStore deviceStore;
  late DeviceSyncCredentialCoordinator deviceCoordinator;
  late Dio syncDio;
  late AuditRepositoryImpl repository;

  final activeDeviceCred = DeviceSyncCredentialRecord(
    credentialId: 'cred-sync-1',
    tenantId: 'tenant-100',
    deviceId: 'term-1',
    renewalSecret: 'sec_1234567890abcdef',
    credentialVersion: 1,
    expiresAt: DateTime.utc(2028, 1, 1),
    scopes: const ['sync:push', 'sync:pull'],
  );

  final unsyncedRow = AuditLogEntity(
    id: 1,
    userId: 'user_1',
    action: 'DRAWER_OPEN',
    timestamp: '2026-03-01T12:00:00.000Z',
    deviceId: 'term-1',
    metadata: '{}',
    isSynced: false,
    sequenceNo: 1,
    prevHash: 'GENESIS',
    entryHash: 'aaaa0000bbbb1111cccc2222dddd3333eeee4444ffff5555aaaa6666bbbb7777',
    remoteRefUuid: 'uuid-1',
    hashVersion: null,
    tenantId: 'tenant-100',
  );

  setUpAll(() {
    mt.registerFallbackValue(LocalConfigEntity(key: '', value: ''));
    mt.registerFallbackValue(activeDeviceCred);
  });

  setUp(() {
    mockAuditDao = MockAuditDao();
    mockAuthRepository = MockAuthRepository();
    exchangePort = _MockExchangePort();
    deviceStore = _MockDeviceSyncStore();

    // Local PIN session still resolves the authoring user (per-log user_id),
    // even though the cloud user credential is gone.
    when(mockAuthRepository.getCurrentUser()).thenAnswer(
      (_) async => User(
        id: 'user_1',
        name: 'Cajero',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-100',
      ),
    );
    when(mockAuditDao.findUnsyncedLogs())
        .thenAnswer((_) async => [unsyncedRow]);
    when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});

    DeviceSyncCredentialRecord? inMemoryCred = activeDeviceCred;
    mt.when(() => deviceStore.readCredential())
        .thenAnswer((_) async => inMemoryCred);
    mt.when(() => deviceStore.writeCredential(mt.any()))
        .thenAnswer((inv) async {
      inMemoryCred = inv.positionalArguments[0] as DeviceSyncCredentialRecord;
    });
    mt.when(() => deviceStore.stageCandidate(mt.any()))
        .thenAnswer((_) async {});
    mt.when(() => deviceStore.readCandidate()).thenAnswer((_) async => null);
    mt.when(() => deviceStore.commitCandidate()).thenAnswer((_) async {});
    mt.when(() => deviceStore.rollbackCandidate()).thenAnswer((_) async {});

    mt.when(() => exchangePort.renewToken(
          credentialId: mt.any(named: 'credentialId'),
          deviceId: mt.any(named: 'deviceId'),
          renewalSecret: mt.any(named: 'renewalSecret'),
          tenantId: mt.any(named: 'tenantId'),
          expectedCredentialVersion:
              mt.any(named: 'expectedCredentialVersion'),
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

    final configs = _Configs();
    mt.when(() => configs.saveConfig(mt.any())).thenAnswer((_) async {});

    repository = AuditRepositoryImpl(
      mockAuditDao,
      mockAuthRepository,
      syncDio,
      'term-1',
      capabilityCache: TenantCapabilityCache(
        configDao: configs,
        clock: _Clock(),
        bootSessionId: 'boot',
        nowUtc: () => DateTime.utc(2026),
      ),
      forensicAlertDao: _Alerts(),
    );
  });

  test(
    'audit push goes out on the device client with the device Bearer token',
    () async {
      late RequestOptions captured;
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        captured = options;
        return ResponseBody.fromString(
          '{"count": 1}',
          200,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await repository.syncLogs();

      expect(captured.path, contains('identity/audit'));
      expect(
        captured.headers['Authorization'],
        'Bearer valid.device.access.jwt',
      );
      expect(outcome.status, AuditSyncStatus.complete);
      verify(mockAuditDao.markAsSynced([1])).called(1);
    },
  );

  test(
    'rejected audit push (401) keeps rows unsynced for the next pass',
    () async {
      syncDio.httpClientAdapter = _MockHttpClientAdapter((options) {
        return ResponseBody.fromString(
          '{"statusCode": 401, "message": "Invalid device credentials"}',
          401,
          headers: {
            HttpHeaders.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      });

      final outcome = await repository.syncLogs();

      // Row stays is_synced = 0: no markAsSynced, retryable outcome, no
      // tight-loop terminal classification.
      verifyNever(mockAuditDao.markAsSynced(any));
      expect(outcome.status, AuditSyncStatus.retryable);
      expect(outcome.failedStreams, 1);
    },
  );
}
