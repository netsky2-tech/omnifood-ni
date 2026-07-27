import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/daos/audit_log_dao.dart';
import 'package:pos_app/data/daos/inventory/forensic_alert_dao.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart' as mt;
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/core/audit/v3/frame.dart';
import 'package:pos_app/core/audit/v3/sha256.dart';
import 'package:pos_app/core/audit/v3/types.dart';
import 'dart:typed_data';
import 'audit_repository_impl_test.mocks.dart';

class _Configs extends mt.Mock implements LocalConfigDao {}
class _Clock implements MonotonicClock { @override Duration elapsed() => Duration.zero; }
class _Capabilities extends mt.Mock implements TenantCapabilityCache {}
class _Alerts implements ForensicAlertDao {
  final calls = <List<Object>>[];
  bool throwsOnInsert = false;
  bool unresolvedTerminalAlert = false;

  @override
  Future<int?> countActiveAuditTerminalAlerts(String sourceDocumentId) async =>
      unresolvedTerminalAlert ? 1 : 0;

  @override
  Future<void> insertIfAbsentForensicAlert(String id, String alertType, String severity, String message, String createdAt, String status, String sourceDocumentType, String sourceDocumentId, String metadataJson, bool isSynced) async {
    if (throwsOnInsert) throw StateError('alert persistence unavailable');
    calls.add([id, alertType, severity, message, createdAt, status, sourceDocumentType, sourceDocumentId, metadataJson, isSynced]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

@GenerateNiceMocks([
  MockSpec<AuditDao>(),
  MockSpec<AuthRepository>(),
  MockSpec<Dio>(),
])

void main() {
  setUpAll(() => mt.registerFallbackValue(LocalConfigEntity(key: '', value: '')));
  late MockAuditDao mockAuditDao;
  late MockAuthRepository mockAuthRepository;
  late MockDio mockDio;
  late _Alerts alerts;
  late AuditRepositoryImpl repository;
  late TenantCapabilityCache cache;

  setUp(() {
    mockAuditDao = MockAuditDao();
    mockAuthRepository = MockAuthRepository();
    mockDio = MockDio();
    alerts = _Alerts();
    final configs = _Configs();
    mt.when(() => configs.saveConfig(mt.any())).thenAnswer((_) async {});
    cache = TenantCapabilityCache(configDao: configs, clock: _Clock(), bootSessionId: 'boot', nowUtc: () => DateTime.utc(2026));
    when(mockAuditDao.appendForensicLog(any, any, any, any)).thenAnswer((call) async {
      final tenantId = call.positionalArguments[0] as String;
      final deviceId = call.positionalArguments[1] as String;
      final userId = call.positionalArguments[2] as String;
      final createLog = call.positionalArguments[3] as AuditLogEntity Function(int, String);
      final sequence = await mockAuditDao.getLastSequenceNoByStream(tenantId, deviceId, userId);
      final previousHash = await mockAuditDao.getLastEntryHashByStream(tenantId, deviceId, userId);
      await mockAuditDao.insertLog(createLog((sequence ?? 0) + 1, previousHash ?? 'GENESIS'));
    });
    repository = AuditRepositoryImpl(
      mockAuditDao,
      mockAuthRepository,
      mockDio,
      'device_123',
      capabilityCache: cache,
      forensicAlertDao: alerts,
    );
  });

  group('logForensic', () {
    test('should generate forensic fields for a new log', () async {
      // Arrange
      final user = User(
        id: 'user_1',
        name: 'Test User',
        role: UserRole.manager,
        isActive: true,
        tenantId: 'tenant_a',
      );
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(
        mockAuditDao.getLastSequenceNoByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => null);
      when(
        mockAuditDao.getLastEntryHashByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => null);

      // Act
      await repository.logForensic(
        'DRAWER_OPEN',
        metodoAutorizacion: 'PIN',
        usuarioAutorizadorId: 'supervisor_1',
      );

      // Assert
      final captured = verify(mockAuditDao.insertLog(captureAny)).captured;
      expect(captured.length, 1);
      final entity = captured.first as AuditLogEntity;

      expect(entity.action, 'DRAWER_OPEN');
      expect(entity.sequenceNo, 1);
      expect(entity.prevHash, 'GENESIS');
      expect(entity.entryHash, isNotNull);
      expect(entity.metodoAutorizacion, 'PIN');
      expect(entity.usuarioAutorizadorId, 'supervisor_1');
      expect(entity.hashVersion, 'v2-canonical-json');
    });

    test('should chain sequence and hash from previous log', () async {
      // Arrange
      final user = User(
        id: 'user_1',
        name: 'Test User',
        role: UserRole.manager,
        isActive: true,
        tenantId: 'tenant_a',
      );
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(
        mockAuditDao.getLastSequenceNoByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => 5);
      when(
        mockAuditDao.getLastEntryHashByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => 'PREV_HASH_123');

      // Act
      await repository.logForensic('OTHER_ACTION');

      // Assert
      final captured = verify(mockAuditDao.insertLog(captureAny)).captured;
      final entity = captured.last as AuditLogEntity;

      expect(entity.action, 'OTHER_ACTION');
      expect(entity.sequenceNo, 6);
      expect(entity.prevHash, 'PREV_HASH_123');
      expect(entity.entryHash, isNotNull);
      expect(entity.metodoAutorizacion, isNull);
      expect(entity.usuarioAutorizadorId, isNull);
    });
  });

  group('creation provenance', () {
    User user(String? tenantId) => User(
      id: 'user_1',
      name: 'Test User',
      role: UserRole.manager,
      isActive: true,
      tenantId: tenantId,
    );

    void stubStream({int? sequence, String? hash}) {
      when(
        mockAuditDao.getLastSequenceNoByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => sequence);
      when(
        mockAuditDao.getLastEntryHashByStream(
          'tenant_a',
          'device_123',
          'user_1',
        ),
      ).thenAnswer((_) async => hash);
    }

    test('prepareLog snapshots a stream head without persisting an audit row', () async {
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user('tenant_a'));
      when(mockAuditDao.getLastAuditLogByStream('tenant_a', 'device_123', 'user_1')).thenAnswer((_) async => null);
      final prepared = await repository.prepareLog('OPEN');
      expect(prepared?.sequenceNo, 1);
      expect(prepared?.prevHash, 'GENESIS');
      verifyNever(mockAuditDao.appendForensicLog(any, any, any, any));
      verifyNever(mockAuditDao.insertLog(any));
    });

    test(
      'creates independent tenant streams and excludes legacy predecessors',
      () async {
        when(
          mockAuthRepository.getCurrentUser(),
        ).thenAnswer((_) async => user('tenant_a'));
        stubStream();
        await repository.logForensic('OPEN', metadata: '{"z":1,"a":"raw"}');
        when(
          mockAuthRepository.getCurrentUser(),
        ).thenAnswer((_) async => user('tenant_b'));
        when(
          mockAuditDao.getLastSequenceNoByStream(
            'tenant_b',
            'device_123',
            'user_1',
          ),
        ).thenAnswer((_) async => null);
        when(
          mockAuditDao.getLastEntryHashByStream(
            'tenant_b',
            'device_123',
            'user_1',
          ),
        ).thenAnswer((_) async => null);
        await repository.logForensic('OPEN');

        final rows = verify(
          mockAuditDao.insertLog(captureAny),
        ).captured.cast<AuditLogEntity>();
        expect(rows.map((row) => row.tenantId), ['tenant_a', 'tenant_b']);
        expect(rows.map((row) => row.sequenceNo), [1, 1]);
        expect(rows.first.prevHash, 'GENESIS');
        expect(rows.first.metadataRaw, '{"z":1,"a":"raw"}');
      },
    );

    test(
      'fails closed without a tenant and ignores forged event metadata',
      () async {
        when(
          mockAuthRepository.getCurrentUser(),
        ).thenAnswer((_) async => user(null));
        await repository.logForensic(
          'OPEN',
          metadata: '{"tenant_id":"forged"}',
        );
        verifyNever(mockAuditDao.insertLog(any));
        verifyNever(mockAuditDao.getLastSequenceNoByStream(any, any, any));
      },
    );

    test(
      'snapshots explicit v2 provenance on the dark production path',
      () async {
        when(
          mockAuthRepository.getCurrentUser(),
        ).thenAnswer((_) async => user('tenant_a'));
        stubStream(sequence: 4, hash: 'A4');
        await repository.logForensic('OPEN', metadata: 'exact raw input');
        final row =
            verify(mockAuditDao.insertLog(captureAny)).captured.single
                as AuditLogEntity;
        expect(row.hashVersion, 'v2-canonical-json');
        expect(row.metadataRaw, 'exact raw input');
        expect(row.sequenceNo, 5);
        expect(row.prevHash, 'A4');
      },
    );

    test('fresh same-tenant authority produces v3 after controlled activation', () async {
      await cache.refresh(tenantId: 'tenant_a', response: {'tenant_id': 'tenant_a', 'active_version': 'v3-jcs-rfc8785', 'contract_version': 1, 'server_fetched_at': '2026-01-01T00:00:00Z', 'server_expires_at': '2026-01-02T00:00:00Z'});
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user('tenant_a'));
      stubStream(); await repository.logForensic('OPEN');
      expect((verify(mockAuditDao.insertLog(captureAny)).captured.single as AuditLogEntity).hashVersion, 'v3-jcs-rfc8785');
    });

    test('preserves the authoritative v2 golden digest', () async {
      repository = AuditRepositoryImpl(mockAuditDao, mockAuthRepository, mockDio, 'pos-01', capabilityCache: cache, forensicAlertDao: alerts, now: () => DateTime.parse('2026-07-21T12:34:56.789Z'));
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => User(id: 'user-01', name: 'u', role: UserRole.manager, isActive: true, tenantId: 'tenant_a'));
      when(mockAuditDao.getLastSequenceNoByStream('tenant_a', 'pos-01', 'user-01')).thenAnswer((_) async => 6);
      when(mockAuditDao.getLastEntryHashByStream('tenant_a', 'pos-01', 'user-01')).thenAnswer((_) async => 'GENESIS');
      await repository.logForensic('LOGOUT', metadata: '{"reason":"manual"}', metodoAutorizacion: 'PIN', usuarioAutorizadorId: 'supervisor-01');
      expect((verify(mockAuditDao.insertLog(captureAny)).captured.single as AuditLogEntity).entryHash, 'e30059a1e2d4b99339be0515e107fbdaf737e339bbc0bc7617a5c5bf5cb34a2c');
    });

    test('preserves the authoritative v3 frame digest', () {
      final frame = buildAuditV3Frame(const AuditV3FrameFields(userId: 'u', resolvedAction: 'LOGOUT', deviceId: 'd', timestamp: '2026-07-21T00:00:00Z', sequenceNo: '0', prevHash: 'GENESIS', metodoAutorizacion: FieldState.absent(), usuarioAutorizadorId: FieldState.absent()), Uint8List.fromList([123, 125])) as AuditV3Success<Uint8List>;
      expect(sha256LowerHex(frame.value), '70d36fb4f831755febf5a75dc370f1c835d56feb5733a72f064560cb86509cab');
    });

    test('fails closed when authoritative v3 metadata is invalid', () async {
      final capabilities = _Capabilities();
      mt.when(() => capabilities.isV3Eligible('tenant_a')).thenReturn(true);
      repository = AuditRepositoryImpl(mockAuditDao, mockAuthRepository, mockDio, 'device_123', capabilityCache: capabilities, forensicAlertDao: alerts);
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user('tenant_a'));
      stubStream();
      await expectLater(repository.logForensic('OPEN', metadata: '{"number":1}'), throwsStateError);
      verifyNever(mockAuditDao.insertLog(any));
    });

    test('never rewrites a queued row during sync', () async {
      final queued = AuditLogEntity(
        id: 7,
        userId: 'user_1',
        action: 'OPEN',
        timestamp: '2026-01-01T00:00:00Z',
        deviceId: 'device_123',
        metadata: '{"a":1}',
        metadataRaw: 'exact raw input',
        tenantId: 'tenant_a',
        isSynced: false,
        sequenceNo: 1,
        prevHash: 'GENESIS',
        entryHash: 'unchanged',
        remoteRefUuid: 'row-7',
        hashVersion: 'v2-canonical-json',
      );
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [queued]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      when(
        mockDio.post(
          any,
          data: anyNamed('data'),
          options: anyNamed('options'),
          cancelToken: anyNamed('cancelToken'),
          onSendProgress: anyNamed('onSendProgress'),
          onReceiveProgress: anyNamed('onReceiveProgress'),
        ),
      ).thenAnswer((call) async {
        expect(((call.namedArguments[#data] as Map)['logs'] as List).single['metadata_raw'], 'exact raw input');
        return Response(requestOptions: RequestOptions(path: '/identity/audit'));
      });
      await repository.syncLogs();
      verifyNever(mockAuditDao.updateMetadataById(any, any));
      expect(queued.metadataRaw, 'exact raw input');
      expect(queued.entryHash, 'unchanged');
      expect(queued.hashVersion, 'v2-canonical-json');
    });
  });

  group('syncLogs metadata normalization', () {
    AuditLogEntity unsyncedAudit({required int id, String? hashVersion}) =>
        AuditLogEntity(
          id: id,
          userId: 'user_1',
          action: 'DRAWER_OPENED_MANUALLY',
          timestamp: '2023-01-01T00:00:00.000Z',
          deviceId: 'device_123',
          metadata: '{}',
          isSynced: false,
          sequenceNo: id,
          prevHash: 'PREV_HASH',
          entryHash: 'ENTRY_HASH',
          remoteRefUuid: '4a6b9508-d90d-47ca-9ff2-e595ce70f29$id',
          hashVersion: hashVersion,
        );

    void stubSuccessfulPost() {
      when(
        mockDio.post(
          any,
          data: anyNamed('data'),
          options: anyNamed('options'),
          cancelToken: anyNamed('cancelToken'),
          onSendProgress: anyNamed('onSendProgress'),
          onReceiveProgress: anyNamed('onReceiveProgress'),
        ),
      ).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: '/identity/audit'),
          data: {'ok': true},
        ),
      );
    }

    test('preserves v3 raw metadata and authorization provenance', () async {
      final historical = unsyncedAudit(id: 10);
      final v2 = unsyncedAudit(id: 11, hashVersion: 'v2-canonical-json');
      final dormantV3 = AuditLogEntity(
        id: 12,
        userId: 'user_1',
        action: 'DRAWER_OPENED_MANUALLY',
        timestamp: '2023-01-01T00:00:00.000Z',
        deviceId: 'device_123',
        metadata: 'null',
        isSynced: false,
        sequenceNo: 12,
        prevHash: 'PREV_HASH',
        entryHash: 'ENTRY_HASH',
        remoteRefUuid: '4a6b9508-d90d-47ca-9ff2-e595ce7012',
        hashVersion: 'v3-jcs-rfc8785',
        hasMetodoAutorizacion: true,
        hasUsuarioAutorizadorId: false,
      );
      final v3WithText = AuditLogEntity(
        id: 13,
        userId: 'user_1',
        action: 'DRAWER_OPENED_MANUALLY',
        timestamp: '2023-01-01T00:00:00.000Z',
        deviceId: 'device_123',
        metadata: '{"text":true}',
        isSynced: false,
        sequenceNo: 13,
        prevHash: 'PREV_HASH',
        entryHash: 'ENTRY_HASH',
        remoteRefUuid: '4a6b9508-d90d-47ca-9ff2-e595ce7013',
        hashVersion: 'v3-jcs-rfc8785',
        usuarioAutorizadorId: 'supervisor-1',
        hasUsuarioAutorizadorId: true,
      );
      when(
        mockAuditDao.findUnsyncedLogs(),
      ).thenAnswer((_) async => [historical, v2, dormantV3, v3WithText]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      stubSuccessfulPost();

      await repository.syncLogs();

      final payload =
          verify(
                mockDio.post(
                  '/identity/audit',
                  data: captureAnyNamed('data'),
                  options: anyNamed('options'),
                  cancelToken: anyNamed('cancelToken'),
                  onSendProgress: anyNamed('onSendProgress'),
                  onReceiveProgress: anyNamed('onReceiveProgress'),
                ),
              ).captured.single
              as Map<String, dynamic>;
      final logs = payload['logs'] as List<dynamic>;
      expect(logs[0], isNot(contains('hash_version')));
      expect(
        (logs[1] as Map<String, dynamic>)['hash_version'],
        'v2-canonical-json',
      );
      expect(
        (logs[2] as Map<String, dynamic>)['hash_version'],
        'v3-jcs-rfc8785',
      );
      expect((logs[2] as Map<String, dynamic>)['metadata'], isNull);
      expect((logs[2] as Map<String, dynamic>)['metadata_raw'], 'null');
      expect((logs[2] as Map<String, dynamic>)['metodo_autorizacion'], isNull);
      expect(logs[2], isNot(contains('usuario_autorizador_id')));
      expect(
        (logs[3] as Map<String, dynamic>)['metadata_raw'],
        '{"text":true}',
      );
      expect(
        (logs[3] as Map<String, dynamic>)['usuario_autorizador_id'],
        'supervisor-1',
      );
      verify(mockAuditDao.markAsSynced([10, 11, 12, 13]));
    });

    test(
      'keeps offline rows retryable after a failed sync and marks the same IDs after retry',
      () async {
        final row = unsyncedAudit(id: 10, hashVersion: 'v2-canonical-json');
        when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [row]);
        when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
        when(
          mockDio.post(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
            cancelToken: anyNamed('cancelToken'),
            onSendProgress: anyNamed('onSendProgress'),
            onReceiveProgress: anyNamed('onReceiveProgress'),
          ),
        ).thenThrow(
          DioException(requestOptions: RequestOptions(path: '/identity/audit')),
        );

        final timedOut = await repository.syncLogs();
        expect(timedOut.status, AuditSyncStatus.retryable);
        verifyNever(mockAuditDao.markAsSynced(any));

        stubSuccessfulPost();
        final retried = await repository.syncLogs();
        expect(retried.status, AuditSyncStatus.complete);
        verify(mockAuditDao.markAsSynced([10]));
      },
    );

    test('reports a partial outcome when a legacy transport timeout keeps rows queued', () async {
      final legacy = unsyncedAudit(id: 14, hashVersion: 'v2-canonical-json');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [legacy]);
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenThrow(DioException(requestOptions: RequestOptions(path: '/identity/audit'), type: DioExceptionType.receiveTimeout));

      final outcome = await repository.syncLogs();

      expect(outcome.status, AuditSyncStatus.retryable);
      expect(outcome.failedStreams, 1);
      verifyNever(mockAuditDao.markAsSynced(any));
    });

    test(
      'normalizes plain-text metadata to JSON object and syncs without silent skip',
      () async {
        final unsynced = AuditLogEntity(
          id: 10,
          userId: 'user_1',
          action: 'DRAWER_OPENED_MANUALLY',
          timestamp: DateTime.now().toIso8601String(),
          deviceId: 'device_123',
          metadata: 'drawer opened without structured payload',
          isSynced: false,
          sequenceNo: 7,
          prevHash: 'PREV_HASH',
          entryHash: 'ENTRY_HASH',
          remoteRefUuid: '4a6b9508-d90d-47ca-9ff2-e595ce70f291',
        );

        when(
          mockAuditDao.findUnsyncedLogs(),
        ).thenAnswer((_) async => [unsynced]);
        when(
          mockDio.post(
            any,
            data: anyNamed('data'),
            options: anyNamed('options'),
            cancelToken: anyNamed('cancelToken'),
            onSendProgress: anyNamed('onSendProgress'),
            onReceiveProgress: anyNamed('onReceiveProgress'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: '/identity/audit'),
            data: {'ok': true},
          ),
        );
        when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});

        await repository.syncLogs();

        final postCall =
            verify(
                  mockDio.post(
                    '/identity/audit',
                    data: captureAnyNamed('data'),
                    options: anyNamed('options'),
                    cancelToken: anyNamed('cancelToken'),
                    onSendProgress: anyNamed('onSendProgress'),
                    onReceiveProgress: anyNamed('onReceiveProgress'),
                  ),
                ).captured.single
                as Map<String, dynamic>;
        final logs = postCall['logs'] as List<dynamic>;
        final metadata = (logs.first as Map<String, dynamic>)['metadata'];

        expect(metadata, isA<Map<String, dynamic>>());
        expect(
          (metadata as Map<String, dynamic>)['raw_text'],
          'drawer opened without structured payload',
        );
        verify(mockAuditDao.markAsSynced([10]));
      },
    );
  });

  group('syncLogs stream isolation', () {
    AuditLogEntity row({
      required int id,
      required String remoteRef,
      required String tenantId,
      required String deviceId,
      required String userId,
      required int sequence,
      required String previousHash,
      required String entryHash,
      String? hashVersion,
      String? metadataRaw,
    }) => AuditLogEntity(
      id: id,
      userId: userId,
      action: 'OPEN',
      timestamp: '2026-07-24T00:00:00.000Z',
      deviceId: deviceId,
      metadata: metadataRaw ?? '{}',
      metadataRaw: metadataRaw,
      tenantId: tenantId,
      isSynced: false,
      sequenceNo: sequence,
      prevHash: previousHash,
      entryHash: entryHash,
      remoteRefUuid: remoteRef,
      hashVersion: hashVersion,
    );

    void acceptAllPosts() {
      when(
        mockDio.post(
          any,
          data: anyNamed('data'),
          options: anyNamed('options'),
          cancelToken: anyNamed('cancelToken'),
          onSendProgress: anyNamed('onSendProgress'),
          onReceiveProgress: anyNamed('onReceiveProgress'),
        ),
      ).thenAnswer(
        (call) async => Response(
          requestOptions: RequestOptions(path: '/identity/audit'),
          data: {'status': 'success', 'count': (call.namedArguments[#data] as Map)['logs'].length},
        ),
      );
    }

    void authenticateAs(String tenantId) {
      when(mockAuthRepository.getCurrentUser()).thenAnswer(
        (_) async => User(id: 'active-user', name: 'Active', role: UserRole.manager, isActive: true, tenantId: tenantId),
      );
    }

    test('isolates a 400 terminal rejection without exposing backend data', () async {
      final rejected = row(id: 1, remoteRef: 'rejected', tenantId: 'tenant-a', deviceId: 'blocked', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'r-1');
      final tail = row(id: 2, remoteRef: 'tail', tenantId: 'tenant-a', deviceId: 'blocked', userId: 'u', sequence: 2, previousHash: 'r-1', entryHash: 'r-2');
      final safe = row(id: 3, remoteRef: 'safe', tenantId: 'tenant-a', deviceId: 'safe', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 's-1');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [rejected, tail, safe]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      final outgoing = <List<String>>[];
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenAnswer((call) async {
        final ids = ((call.namedArguments[#data] as Map)['logs'] as List).map((log) => (log as Map)['id'] as String).toList();
        outgoing.add(ids);
        final id = ids.first;
        if (id == 'rejected') throw DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: 400, data: {'message': 'Bearer token jane@example.com'}));
        return Response(requestOptions: RequestOptions(path: '/identity/audit'), data: {'count': 1});
      });
      expect((await repository.syncLogs()).status, AuditSyncStatus.partial);
      expect(alerts.calls, hasLength(1));
      expect(alerts.calls.single[8], allOf(contains('"status_code":400'), contains('"sequence_no":1'), isNot(contains('token')), isNot(contains('jane@example.com'))));
      expect(outgoing, [['rejected'], ['safe']]);
      verify(mockAuditDao.markAsSynced([3]));
      verifyNever(mockAuditDao.markAsSynced([1, 2]));
    });

    test('does not send a tenant-stream tail after a 409 terminal rejection', () async {
      final rejected = row(id: 1, remoteRef: 'conflict', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'c-1');
      final tail = row(id: 2, remoteRef: 'tail', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 2, previousHash: 'c-1', entryHash: 'c-2');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [rejected, tail]);
      final outgoing = <List<String>>[];
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenAnswer((call) async {
        final ids = ((call.namedArguments[#data] as Map)['logs'] as List).map((log) => (log as Map)['id'] as String).toList();
        outgoing.add(ids);
        throw DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: 409));
      });
      expect((await repository.syncLogs()).status, AuditSyncStatus.terminal);
      expect(outgoing, [['conflict']]);
      expect(alerts.calls.single[8], contains('"status_code":409'));
      verifyNever(mockAuditDao.markAsSynced(any));
      await repository.syncLogs();
      expect(alerts.calls.map((call) => call.first).toSet(), hasLength(1));
    });

    test('blocks unresolved terminal alerts, then retries after resolution', () async {
      final rejected = row(id: 1, remoteRef: 'rejected', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'r-1');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [rejected]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      alerts.unresolvedTerminalAlert = true;
      expect((await repository.syncLogs()).status, AuditSyncStatus.terminal);
      verifyNever(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress')));
      alerts.unresolvedTerminalAlert = false;
      acceptAllPosts();
      expect((await repository.syncLogs()).status, AuditSyncStatus.complete);
      verify(mockAuditDao.markAsSynced([1]));
    });

    test('keeps 500, timeouts, and legacy 409 isolated without tenant reassignment', () async {
      final retryable = row(id: 1, remoteRef: 'retryable', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'r-1');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [retryable]);
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenThrow(DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: 500)));
      expect((await repository.syncLogs()).status, AuditSyncStatus.retryable);
      for (final status in [408, 429]) {
        when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenThrow(DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: status)));
        expect((await repository.syncLogs()).status, AuditSyncStatus.retryable);
      }
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenThrow(DioException(requestOptions: RequestOptions(path: '/identity/audit'), type: DioExceptionType.receiveTimeout));
      expect((await repository.syncLogs()).status, AuditSyncStatus.retryable);
      expect(alerts.calls, isEmpty);
      final legacy = AuditLogEntity(id: 9, userId: 'u', action: 'OPEN', timestamp: '2026-07-24T00:00:00.000Z', deviceId: 'd', metadata: '{}', isSynced: false, sequenceNo: 1, prevHash: 'GENESIS', entryHash: 'legacy', remoteRefUuid: 'legacy');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [legacy]);
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenThrow(DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: 409)));
      expect((await repository.syncLogs()).status, AuditSyncStatus.terminal);
      expect(legacy.tenantId, isNull);
      expect(alerts.calls.single[7], 'legacy');
    });

    test('continues an unrelated stream when terminal alert persistence fails', () async {
      final rejected = row(id: 1, remoteRef: 'rejected', tenantId: 'tenant-a', deviceId: 'blocked', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'r-1');
      final safe = row(id: 2, remoteRef: 'safe', tenantId: 'tenant-a', deviceId: 'safe', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 's-1');
      authenticateAs('tenant-a');
      alerts.throwsOnInsert = true;
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [rejected, safe]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenAnswer((call) async {
        final id = (((call.namedArguments[#data] as Map)['logs'] as List).single as Map)['id'];
        if (id == 'rejected') throw DioException(requestOptions: RequestOptions(path: '/identity/audit'), response: Response(requestOptions: RequestOptions(path: '/identity/audit'), statusCode: 400));
        return Response(requestOptions: RequestOptions(path: '/identity/audit'), data: {'count': 1});
      });
      expect((await repository.syncLogs()).status, AuditSyncStatus.partial);
      verify(mockAuditDao.markAsSynced([2]));
      verifyNever(mockAuditDao.markAsSynced([1]));
    });

    test('blocks a poison stream tail while independently syncing another stream', () async {
      final rows = [
        row(id: 3, remoteRef: 'a-3', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 3, previousHash: 'a-2', entryHash: 'a-3'),
        row(id: 4, remoteRef: 'b-1', tenantId: 'tenant-a', deviceId: 'other-device', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'b-1'),
        row(id: 2, remoteRef: 'a-poison', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 2, previousHash: 'a-1', entryHash: 'a-2', hashVersion: 'v3-jcs-rfc8785', metadataRaw: '{invalid'),
        row(id: 1, remoteRef: 'a-1', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'a-1'),
      ];
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => rows);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      acceptAllPosts();

      await repository.syncLogs();

      final payloads = verify(mockDio.post('/identity/audit', data: captureAnyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).captured.cast<Map>();
      expect(payloads.map((payload) => (payload['logs'] as List).single['id']), ['a-1', 'b-1']);
      verify(mockAuditDao.markAsSynced([1]));
      verify(mockAuditDao.markAsSynced([4]));
      verifyNever(mockAuditDao.markAsSynced([2, 3]));
      final alert = alerts.calls.single;
      expect(alert[6], 'audit_log');
      expect(alert[7], 'a-poison');
      expect(alert[8], contains('"sequence_no":2'));
    });

    test('sends the second row only after the first row is explicitly accepted', () async {
      final first = row(id: 1, remoteRef: 'c-1', tenantId: 'tenant-c', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'c-1');
      final second = row(id: 2, remoteRef: 'c-2', tenantId: 'tenant-c', deviceId: 'd', userId: 'u', sequence: 2, previousHash: 'c-1', entryHash: 'c-2');
      authenticateAs('tenant-c');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [second, first]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenAnswer((call) async {
        final id = (((call.namedArguments[#data] as Map)['logs'] as List).single as Map)['id'];
        return Response(requestOptions: RequestOptions(path: '/identity/audit'), data: {'accepted_ids': [id]});
      });

      await repository.syncLogs();

      final payloads = verify(mockDio.post('/identity/audit', data: captureAnyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).captured.cast<Map>();
      expect(payloads.map((payload) => (payload['logs'] as List).single['id']), ['c-1', 'c-2']);
      verify(mockAuditDao.markAsSynced([1]));
      verify(mockAuditDao.markAsSynced([2]));
    });

    test('keeps legacy null-tenant rows on their existing payload path without rewriting them', () async {
      final legacy = AuditLogEntity(id: 9, userId: 'u', action: 'OPEN', timestamp: '2026-07-24T00:00:00.000Z', deviceId: 'd', metadata: 'legacy text', isSynced: false, sequenceNo: 9, prevHash: 'old', entryHash: 'legacy-hash', remoteRefUuid: 'legacy-9');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [legacy]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      acceptAllPosts();

      await repository.syncLogs();

      verify(mockAuditDao.markAsSynced([9]));
      verifyNever(mockAuditDao.updateMetadataById(any, any));
      expect(legacy.tenantId, isNull);
      expect(legacy.metadata, 'legacy text');
    });

    test('leaves another tenant backlog queued while the active tenant stream continues', () async {
      final active = row(id: 1, remoteRef: 'a-1', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'a-1');
      final other = row(id: 2, remoteRef: 'b-1', tenantId: 'tenant-b', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'b-1');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [other, active]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      acceptAllPosts();

      await repository.syncLogs();

      final payload = verify(mockDio.post('/identity/audit', data: captureAnyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).captured.single as Map;
      expect((payload['logs'] as List).single['id'], 'a-1');
      verify(mockAuditDao.markAsSynced([1]));
      verifyNever(mockAuditDao.markAsSynced([2]));
    });

    test('continues a safe same-tenant stream when poison alert persistence fails', () async {
      final poison = row(id: 1, remoteRef: 'poison', tenantId: 'tenant-a', deviceId: 'blocked-device', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'p-1', hashVersion: 'v3-jcs-rfc8785', metadataRaw: '{bad');
      final tail = row(id: 2, remoteRef: 'tail', tenantId: 'tenant-a', deviceId: 'blocked-device', userId: 'u', sequence: 2, previousHash: 'p-1', entryHash: 'p-2');
      final safe = row(id: 3, remoteRef: 'safe', tenantId: 'tenant-a', deviceId: 'other-device', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 's-1');
      authenticateAs('tenant-a');
      alerts.throwsOnInsert = true;
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [poison, tail, safe]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      acceptAllPosts();

      await repository.syncLogs();

      final payload = verify(mockDio.post('/identity/audit', data: captureAnyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).captured.single as Map;
      expect((payload['logs'] as List).single['id'], 'safe');
      verify(mockAuditDao.markAsSynced([3]));
      verifyNever(mockAuditDao.markAsSynced([1, 2]));
    });

    test('continues an unrelated stream after a retryable transport failure', () async {
      final failed = row(id: 1, remoteRef: 'failed-1', tenantId: 'tenant-a', deviceId: 'a-device', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'a-1');
      final safe = row(id: 2, remoteRef: 'safe-1', tenantId: 'tenant-a', deviceId: 'b-device', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'b-1');
      authenticateAs('tenant-a');
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [failed, safe]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      when(mockDio.post(any, data: anyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).thenAnswer((call) async {
        final id = (((call.namedArguments[#data] as Map)['logs'] as List).single as Map)['id'];
        if (id == 'failed-1') {
          throw DioException(requestOptions: RequestOptions(path: '/identity/audit'), type: DioExceptionType.connectionTimeout);
        }
        return Response(requestOptions: RequestOptions(path: '/identity/audit'), data: {'count': 1});
      });

      final outcome = await repository.syncLogs();

      expect(outcome.status, AuditSyncStatus.partial);
      expect(outcome.failedStreams, 1);
      verify(mockAuditDao.markAsSynced([2]));
      verifyNever(mockAuditDao.markAsSynced([1]));
    });

    test('blocks duplicate sequence and tail deterministically regardless of input order', () async {
      final prefix = row(id: 1, remoteRef: 'prefix', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 1, previousHash: 'GENESIS', entryHash: 'h-1');
      final duplicateA = row(id: 2, remoteRef: 'duplicate-a', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 2, previousHash: 'h-1', entryHash: 'h-2a');
      final duplicateB = row(id: 3, remoteRef: 'duplicate-b', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 2, previousHash: 'h-1', entryHash: 'h-2b');
      final tail = row(id: 4, remoteRef: 'tail', tenantId: 'tenant-a', deviceId: 'd', userId: 'u', sequence: 3, previousHash: 'h-2a', entryHash: 'h-3');
      authenticateAs('tenant-a');
      var attempt = 0;
      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => ++attempt == 1 ? [tail, duplicateB, prefix, duplicateA] : [duplicateA, prefix, tail, duplicateB]);
      when(mockAuditDao.markAsSynced(any)).thenAnswer((_) async {});
      acceptAllPosts();

      await repository.syncLogs();
      await repository.syncLogs();

      final payloads = verify(mockDio.post('/identity/audit', data: captureAnyNamed('data'), options: anyNamed('options'), cancelToken: anyNamed('cancelToken'), onSendProgress: anyNamed('onSendProgress'), onReceiveProgress: anyNamed('onReceiveProgress'))).captured.cast<Map>();
      expect(payloads.map((payload) => (payload['logs'] as List).single['id']), ['prefix', 'prefix']);
      verify(mockAuditDao.markAsSynced([1])).called(2);
      verifyNever(mockAuditDao.markAsSynced([2, 3, 4]));
      expect(alerts.calls.map((call) => call[8]), everyElement(contains('duplicate_sequence')));
    });
  });
}
