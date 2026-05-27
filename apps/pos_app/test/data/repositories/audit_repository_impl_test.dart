import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/daos/audit_log_dao.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:dio/dio.dart';

@GenerateNiceMocks([MockSpec<AuditDao>(), MockSpec<AuthRepository>(), MockSpec<Dio>()])
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
    repository = AuditRepositoryImpl(mockAuditDao, mockAuthRepository, mockDio, 'device_123');
  });

  group('logForensic', () {
    test('should generate forensic fields for a new log', () async {
      // Arrange
      final user = User(id: 'user_1', name: 'Test User', role: UserRole.manager, isActive: true);
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(mockAuditDao.getLastSequenceNo()).thenAnswer((_) async => null);
      when(mockAuditDao.getLastEntryHash()).thenAnswer((_) async => null);

      // Act
      await repository.logForensic('DRAWER_OPEN', metodoAutorizacion: 'PIN', usuarioAutorizadorId: 'supervisor_1');

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
    });

    test('should chain sequence and hash from previous log', () async {
      // Arrange
      final user = User(id: 'user_1', name: 'Test User', role: UserRole.manager, isActive: true);
      when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => user);
      when(mockAuditDao.getLastSequenceNo()).thenAnswer((_) async => 5);
      when(mockAuditDao.getLastEntryHash()).thenAnswer((_) async => 'PREV_HASH_123');

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
    test('normalizes plain-text metadata to JSON object and syncs without silent skip', () async {
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

      when(mockAuditDao.findUnsyncedLogs()).thenAnswer((_) async => [unsynced]);
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

      final postCall = verify(
        mockDio.post(
          '/identity/audit',
          data: captureAnyNamed('data'),
          options: anyNamed('options'),
          cancelToken: anyNamed('cancelToken'),
          onSendProgress: anyNamed('onSendProgress'),
          onReceiveProgress: anyNamed('onReceiveProgress'),
        ),
      ).captured.single as Map<String, dynamic>;
      final logs = postCall['logs'] as List<dynamic>;
      final metadata = (logs.first as Map<String, dynamic>)['metadata'];

      expect(metadata, isA<Map<String, dynamic>>());
      expect((metadata as Map<String, dynamic>)['raw_text'], 'drawer opened without structured payload');
      verify(mockAuditDao.markAsSynced([10]));
    });
  });
}
