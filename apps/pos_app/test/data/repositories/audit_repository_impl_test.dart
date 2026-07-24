import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/daos/audit_log_dao.dart';
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
  late AuditRepositoryImpl repository;
  late TenantCapabilityCache cache;

  setUp(() {
    mockAuditDao = MockAuditDao();
    mockAuthRepository = MockAuthRepository();
    mockDio = MockDio();
    final configs = _Configs();
    mt.when(() => configs.saveConfig(mt.any())).thenAnswer((_) async {});
    cache = TenantCapabilityCache(configDao: configs, clock: _Clock(), bootSessionId: 'boot', nowUtc: () => DateTime.utc(2026));
    repository = AuditRepositoryImpl(
      mockAuditDao,
      mockAuthRepository,
      mockDio,
      'device_123',
      capabilityCache: cache,
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

    test('fresh same-tenant authority remains v2 while the production gate is false', () async {
      await cache.refresh(tenantId: 'tenant_a', response: {'tenant_id': 'tenant_a', 'active_version': 'v3-jcs-rfc8785', 'contract_version': 1, 'server_fetched_at': '2026-01-01T00:00:00Z', 'server_expires_at': '2026-01-02T00:00:00Z'});
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user('tenant_a'));
      stubStream(); await repository.logForensic('OPEN');
      expect((verify(mockAuditDao.insertLog(captureAny)).captured.single as AuditLogEntity).hashVersion, 'v2-canonical-json');
    });

    test('preserves the authoritative v2 golden digest', () async {
      repository = AuditRepositoryImpl(mockAuditDao, mockAuthRepository, mockDio, 'pos-01', capabilityCache: cache, now: () => DateTime.parse('2026-07-21T12:34:56.789Z'));
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
      repository = AuditRepositoryImpl(mockAuditDao, mockAuthRepository, mockDio, 'device_123', capabilityCache: capabilities);
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

        await repository.syncLogs();
        verifyNever(mockAuditDao.markAsSynced(any));

        stubSuccessfulPost();
        await repository.syncLogs();
        verify(mockAuditDao.markAsSynced([10]));
      },
    );

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
}
