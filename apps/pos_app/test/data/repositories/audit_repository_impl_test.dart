import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/daos/audit_log_dao.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:dio/dio.dart';

@GenerateNiceMocks([
  MockSpec<AuditDao>(),
  MockSpec<AuthRepository>(),
  MockSpec<Dio>(),
])
import 'audit_repository_impl_test.mocks.dart';

void main() {
  late MockAuditDao mockAuditDao;
  late MockAuthRepository mockAuthRepository;
  late MockDio mockDio;
  late AuditRepositoryImpl repository;

  setUp(() {
    mockAuditDao = MockAuditDao();
    mockAuthRepository = MockAuthRepository();
    mockDio = MockDio();
    repository = AuditRepositoryImpl(
      mockAuditDao,
      mockAuthRepository,
      mockDio,
      'device_123',
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
      );
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(mockAuditDao.getLastSequenceNo()).thenAnswer((_) async => null);
      when(mockAuditDao.getLastEntryHash()).thenAnswer((_) async => null);

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
      );
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(mockAuditDao.getLastSequenceNo()).thenAnswer((_) async => 5);
      when(
        mockAuditDao.getLastEntryHash(),
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
