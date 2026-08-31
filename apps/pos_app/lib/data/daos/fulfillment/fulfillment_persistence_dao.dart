import 'package:floor/floor.dart';
import '../../models/fulfillment/fulfillment_persistence_entities.dart';

@dao
abstract class FulfillmentPersistenceDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertFulfillment(FulfillmentRecordEntity fulfillment);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertPrintJob(PrintJobEntity job);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertOutboxEvent(OutboxEventEntity event);
  @Query(
    'SELECT * FROM fulfillment_records WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<FulfillmentRecordEntity?> findFulfillment(String id, String tenantId);
  @Query(
    "SELECT * FROM print_jobs WHERE tenant_id = :tenantId AND state IN ('PENDING', 'FAILED') ORDER BY sequence",
  )
  Future<List<PrintJobEntity>> findRetryablePrintJobs(String tenantId);
  @Query(
    "SELECT * FROM fulfillment_outbox_events WHERE tenant_id = :tenantId AND state = 'PENDING' ORDER BY source_sequence",
  )
  Future<List<OutboxEventEntity>> findPendingOutboxEvents(String tenantId);
}
