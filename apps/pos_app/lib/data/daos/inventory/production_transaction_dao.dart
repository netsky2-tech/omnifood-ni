import 'package:floor/floor.dart';

import '../../models/inventory/movement_entity.dart';
import '../../models/inventory/production_order_document_entity.dart';

@dao
abstract class ProductionTransactionDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertMovement(MovementEntity movement);

  @Query('UPDATE insumos SET stock = :newStock WHERE id = :id')
  Future<void> updateStock(String id, double newStock);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertDocument(ProductionOrderDocumentEntity document);

  @Query(
    'SELECT COALESCE(MAX(source_sequence), 0) FROM production_order_documents WHERE terminal_id = :terminalId',
  )
  Future<int?> findMaxSourceSequence(String terminalId);

  /// Atomically persists a production close document and its append-only
  /// inventory movements.
  ///
  /// Positional arguments are mandatory for Floor `@transaction` methods in
  /// this project; named arguments break generated `.g.dart` code.
  @transaction
  Future<void> executeProductionCloseTransaction(
    List<MovementEntity> movements,
    ProductionOrderDocumentEntity document,
    bool shouldFail,
  ) async {
    for (final movement in movements) {
      await updateStock(movement.insumoId, movement.newStock);
      await insertMovement(movement);
    }

    final assignedDocument = ProductionOrderDocumentEntity(
      id: document.id,
      recipeVersionId: document.recipeVersionId,
      recipeProductId: document.recipeProductId,
      recipeProductName: document.recipeProductName,
      producedInsumoId: document.producedInsumoId,
      producedInsumoName: document.producedInsumoName,
      plannedQuantity: document.plannedQuantity,
      actualQuantity: document.actualQuantity,
      producedBatchNumber: document.producedBatchNumber,
      producedExpirationDate: document.producedExpirationDate,
      operationDate: document.operationDate,
      status: document.status,
      outcome: document.outcome,
      failureReason: document.failureReason,
      terminalId: document.terminalId,
      sourceSequence:
          (await findMaxSourceSequence(document.terminalId) ?? 0) + 1,
      idempotencyKey: document.idempotencyKey,
      payloadHash: document.payloadHash,
      totalConsumedCostNio: document.totalConsumedCostNio,
      producedUnitCostNio: document.producedUnitCostNio,
      movementReferencesJson: document.movementReferencesJson,
      varianceReason: document.varianceReason,
      closedAt: document.closedAt,
      isSynced: document.isSynced,
    );

    await upsertDocument(assignedDocument);

    if (shouldFail) {
      throw Exception('Forced production close transaction failure');
    }
  }
}
