import 'package:floor/floor.dart';
import '../../models/activation/activation_outbox_envelope_entity.dart';

@dao
abstract class ActivationOutboxDao {
  @Query('SELECT * FROM activation_outbox_envelopes WHERE id = :id')
  Future<ActivationOutboxEnvelopeEntity?> getEnvelopeById(String id);

  @Query('SELECT * FROM activation_outbox_envelopes WHERE tenant_id = :tenantId AND idempotency_key = :idempotencyKey')
  Future<ActivationOutboxEnvelopeEntity?> getEnvelopeByIdempotencyKey(
    String tenantId,
    String idempotencyKey,
  );

  @Query('SELECT * FROM activation_outbox_envelopes WHERE tenant_id = :tenantId AND activation_attempt_id = :attemptId')
  Future<List<ActivationOutboxEnvelopeEntity>> getEnvelopesByAttempt(
    String tenantId,
    String attemptId,
  );

  @Query("SELECT * FROM activation_outbox_envelopes WHERE tenant_id = :tenantId AND sync_status = 'PENDING' ORDER BY created_at ASC")
  Future<List<ActivationOutboxEnvelopeEntity>> getPendingEnvelopes(
    String tenantId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEnvelope(ActivationOutboxEnvelopeEntity envelope);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEnvelopes(List<ActivationOutboxEnvelopeEntity> envelopes);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateEnvelope(ActivationOutboxEnvelopeEntity envelope);

  @Query('DELETE FROM activation_outbox_envelopes WHERE tenant_id = :tenantId AND activation_attempt_id = :attemptId')
  Future<void> deleteByAttempt(
    String tenantId,
    String attemptId,
  );

  @Query('SELECT * FROM activation_outbox_envelopes')
  Future<List<ActivationOutboxEnvelopeEntity>> getAll();

  @transaction
  Future<void> persistOutboxBatch(
    List<ActivationOutboxEnvelopeEntity> envelopes,
  ) async {
    await insertEnvelopes(envelopes);
  }
}
