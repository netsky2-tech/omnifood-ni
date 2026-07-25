import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';

void main() {
  late AppDatabase database;

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  AuditLogEntity draft(
    String tenantId,
    String deviceId,
    String userId,
    int sequenceNo,
    String prevHash,
    String action,
  ) => AuditLogEntity(
    userId: userId,
    action: action,
    timestamp: '2026-07-24T00:00:00.000Z',
    deviceId: deviceId,
    isSynced: false,
    sequenceNo: sequenceNo,
    prevHash: prevHash,
    entryHash: '$action-$sequenceNo-$prevHash',
    remoteRefUuid: '$tenantId-$deviceId-$userId-$action',
    tenantId: tenantId,
  );

  test(
    'serializes simultaneous appenders for one tenant-bound stream',
    () async {
      final dao = database.auditDao;

      await Future.wait([
        dao.appendForensicLog(
          'tenant-a',
          'device-a',
          'user-a',
          (sequenceNo, prevHash) => draft(
            'tenant-a',
            'device-a',
            'user-a',
            sequenceNo,
            prevHash,
            'A',
          ),
        ),
        dao.appendForensicLog(
          'tenant-a',
          'device-a',
          'user-a',
          (sequenceNo, prevHash) => draft(
            'tenant-a',
            'device-a',
            'user-a',
            sequenceNo,
            prevHash,
            'B',
          ),
        ),
      ]);

      final rows = await dao.findAllLogs();
      rows.sort((left, right) => left.sequenceNo.compareTo(right.sequenceNo));
      expect(rows.map((row) => row.sequenceNo), [1, 2]);
      expect(rows.first.prevHash, 'GENESIS');
      expect(rows.last.prevHash, rows.first.entryHash);
    },
  );

  test('keeps independent tenant/device/user streams independent', () async {
    final dao = database.auditDao;

    await Future.wait([
      dao.appendForensicLog(
        'tenant-a',
        'device-a',
        'user-a',
        (sequenceNo, prevHash) =>
            draft('tenant-a', 'device-a', 'user-a', sequenceNo, prevHash, 'A'),
      ),
      dao.appendForensicLog(
        'tenant-b',
        'device-b',
        'user-b',
        (sequenceNo, prevHash) =>
            draft('tenant-b', 'device-b', 'user-b', sequenceNo, prevHash, 'B'),
      ),
    ]);

    final rows = await dao.findAllLogs();
    expect(rows, hasLength(2));
    expect(rows.map((row) => row.sequenceNo), everyElement(1));
    expect(rows.map((row) => row.prevHash), everyElement('GENESIS'));
  });

  test('rolls back a conflicting transactional append on a fresh schema', () async {
    final dao = database.auditDao;
    final head = draft('tenant-a', 'device-a', 'user-a', 1, 'GENESIS', 'HEAD');
    await dao.insertLog(head);

    await expectLater(
      dao.appendForensicLog(
        'tenant-a',
        'device-a',
        'user-a',
        (sequenceNo, prevHash) => draft('tenant-a', 'device-a', 'user-a', 1, 'GENESIS', 'CONFLICT'),
      ),
      throwsA(isA<Exception>()),
    );

    final rows = await dao.findAllLogs();
    expect(rows, hasLength(1));
    expect(rows.single.remoteRefUuid, head.remoteRefUuid);
    expect(rows.single.entryHash, head.entryHash);
  });
}
