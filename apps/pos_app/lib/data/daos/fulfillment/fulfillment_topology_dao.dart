import 'package:floor/floor.dart';
import '../../models/fulfillment/topology_persistence_entities.dart';

@dao
abstract class FulfillmentTopologyDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertSnapshot(TopologySnapshotEntity snapshot);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> bindShift(ShiftTopologyBindingEntity binding);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEmergencyAudit(EmergencyTopologyAuditEntity audit);
  @Query(
    'SELECT * FROM topology_snapshots WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<TopologySnapshotEntity?> findSnapshot(String id, String tenantId);
  @Query(
    'SELECT * FROM shift_topology_bindings WHERE shift_id = :shiftId AND tenant_id = :tenantId',
  )
  Future<ShiftTopologyBindingEntity?> findBinding(
    String shiftId,
    String tenantId,
  );
  @Query(
    'SELECT * FROM emergency_topology_audits WHERE tenant_id = :tenantId ORDER BY occurred_at DESC',
  )
  Future<List<EmergencyTopologyAuditEntity>> findEmergencyAudits(
    String tenantId,
  );
}
