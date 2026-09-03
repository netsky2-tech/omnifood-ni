import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/topology_persistence_entities.dart';

void main() {
  late AppDatabase database;

  setUp(
    () async => database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build(),
  );
  tearDown(() => database.close());

  test('persists immutable tenant snapshots and shift bindings', () async {
    final dao = database.fulfillmentTopologyDao;
    await dao.insertSnapshot(
      TopologySnapshotEntity(
        id: 't1-r3',
        tenantId: 't1',
        revision: 3,
        hash: 'h3',
        payload: '{}',
        receivedAt: '2026-08-31T00:00:00Z',
      ),
    );
    await dao.insertSnapshot(
      TopologySnapshotEntity(
        id: 't1-r4',
        tenantId: 't1',
        revision: 4,
        hash: 'h4',
        payload: '{}',
        receivedAt: '2026-08-31T01:00:00Z',
      ),
    );
    await dao.bindShift(
      ShiftTopologyBindingEntity(
        shiftId: 'shift-a',
        tenantId: 't1',
        snapshotId: 't1-r3',
        boundAt: '2026-08-31T00:00:00Z',
      ),
    );

    expect((await dao.findSnapshot('t1-r3', 't1'))!.hash, 'h3');
    expect((await dao.findBinding('shift-a', 't1'))!.snapshotId, 't1-r3');
    expect(await dao.findSnapshot('t1-r3', 't2'), isNull);
    await expectLater(
      database.database.rawUpdate(
        "UPDATE topology_snapshots SET hash = 'changed'",
      ),
      throwsA(isA<Exception>()),
    );
    await expectLater(
      database.database.rawDelete('DELETE FROM topology_snapshots'),
      throwsA(isA<Exception>()),
    );
  });

  test('appends tenant-scoped emergency activation audit evidence', () async {
    final dao = database.fulfillmentTopologyDao;
    await dao.insertEmergencyAudit(
      EmergencyTopologyAuditEntity(
        id: 'a1',
        tenantId: 't1',
        shiftId: 'shift-a',
        snapshotId: 't1-r4',
        actorId: 'supervisor-1',
        actorRole: 'supervisor',
        deviceId: 'pos-1',
        reason: 'Printer reroute',
        occurredAt: '2026-08-31T01:00:00Z',
      ),
    );
    await dao.insertEmergencyAudit(
      EmergencyTopologyAuditEntity(
        id: 'a2',
        tenantId: 't1',
        shiftId: 'shift-a',
        snapshotId: 't1-r4',
        actorId: 'supervisor-1',
        actorRole: 'supervisor',
        deviceId: 'pos-1',
        reason: 'Station failure',
        occurredAt: '2026-08-31T02:00:00Z',
      ),
    );
    await dao.insertEmergencyAudit(
      EmergencyTopologyAuditEntity(
        id: 'a3',
        tenantId: 't2',
        shiftId: 'shift-b',
        snapshotId: 't2-r1',
        actorId: 'supervisor-2',
        actorRole: 'supervisor',
        deviceId: 'pos-2',
        reason: 'Network outage',
        occurredAt: '2026-08-31T03:00:00Z',
      ),
    );

    final records = await dao.findEmergencyAudits('t1');
    expect(records.map((record) => record.id), ['a2', 'a1']);
    expect(records.every((record) => record.snapshotId == 't1-r4'), isTrue);
    await expectLater(
      database.database.rawUpdate(
        "UPDATE emergency_topology_audits SET reason = 'changed'",
      ),
      throwsA(isA<Exception>()),
    );
    await expectLater(
      database.database.rawDelete('DELETE FROM emergency_topology_audits'),
      throwsA(isA<Exception>()),
    );
  });
}
