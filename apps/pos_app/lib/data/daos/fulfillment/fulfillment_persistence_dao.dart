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
    'SELECT * FROM fulfillment_records WHERE sale_id = :saleId AND tenant_id = :tenantId',
  )
  Future<FulfillmentRecordEntity?> findFulfillmentBySaleId(
    String saleId,
    String tenantId,
  );

  @Query(
    'SELECT * FROM fulfillment_records WHERE tenant_id = :tenantId',
  )
  Future<List<FulfillmentRecordEntity>> findAllFulfillments(String tenantId);

  @Query(
    "SELECT * FROM print_jobs WHERE tenant_id = :tenantId AND state IN ('PENDING', 'FAILED') ORDER BY sequence",
  )
  Future<List<PrintJobEntity>> findRetryablePrintJobs(String tenantId);

  @Query(
    'SELECT * FROM print_jobs WHERE fulfillment_id = :fulfillmentId AND tenant_id = :tenantId ORDER BY sequence',
  )
  Future<List<PrintJobEntity>> findPrintJobsByFulfillment(
    String fulfillmentId,
    String tenantId,
  );

  @Query(
    'SELECT * FROM print_jobs WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<PrintJobEntity?> findPrintJob(String id, String tenantId);

  @Query(
    "SELECT * FROM fulfillment_outbox_events WHERE tenant_id = :tenantId AND state = 'PENDING' ORDER BY source_sequence",
  )
  Future<List<OutboxEventEntity>> findPendingOutboxEvents(String tenantId);

  @Query(
    'UPDATE fulfillment_records SET route_state = :routeState WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<void> updateRouteState(String id, String tenantId, String routeState);

  @Query(
    'UPDATE fulfillment_records SET delivery_state = :deliveryState WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<void> updateDeliveryState(
    String id,
    String tenantId,
    String deliveryState,
  );

  @Query(
    'UPDATE print_jobs SET state = :state, retry_count = :retryCount WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<void> updatePrintJobState(
    String id,
    String tenantId,
    String state,
    int retryCount,
  );

  @Query(
    'UPDATE fulfillment_outbox_events SET state = :state WHERE event_id = :eventId AND tenant_id = :tenantId',
  )
  Future<void> updateOutboxEventState(
    String eventId,
    String tenantId,
    String state,
  );

  @Query(
    'DELETE FROM fulfillment_records WHERE id = :id AND tenant_id = :tenantId',
  )
  Future<void> deleteFulfillment(String id, String tenantId);

  @Query(
    'DELETE FROM print_jobs WHERE fulfillment_id = :fulfillmentId AND tenant_id = :tenantId',
  )
  Future<void> deletePrintJobsByFulfillment(
    String fulfillmentId,
    String tenantId,
  );

  @Query(
    'DELETE FROM fulfillment_outbox_events WHERE aggregate_id = :fulfillmentId AND tenant_id = :tenantId',
  )
  Future<void> deleteOutboxEventsByFulfillment(
    String fulfillmentId,
    String tenantId,
  );
}
