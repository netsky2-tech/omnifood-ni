import 'package:uuid/uuid.dart';
import '../../../data/database/app_database.dart';
import '../../../data/models/inventory/kardex_correction_entity.dart';
import '../../../data/models/inventory/kardex_recalculate_queue_entity.dart';
import '../../../data/models/inventory/movement_entity.dart';
import 'kardex_recalculation_engine.dart';

class NegativeStockRegularizationService {
  final AppDatabase database;
  final KardexRecalculationEngine engine;
  final Uuid _uuid;

  NegativeStockRegularizationService({
    required this.database,
    required this.engine,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid();

  Future<void> enqueueProvisionalMovement(MovementEntity movement) async {
    final now = DateTime.now().toIso8601String();
    final queueItem = KardexRecalculateQueueEntity(
      id: _uuid.v4(),
      insumoId: movement.insumoId,
      originMovementId: movement.id,
      triggerMovementId: '', // Populated upon replenishment trigger
      status: 'PENDING',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    );

    await database.kardexRecalculateQueueDao.insertQueueItem(queueItem);
  }

  Future<List<KardexRecalculateQueueEntity>> processPendingQueueForInsumo({
    required String insumoId,
    required MovementEntity triggerMovement,
    bool isClosedPeriod = false,
  }) async {
    final queueItems = await database.kardexRecalculateQueueDao.findQueueByInsumoId(insumoId);
    final pendingItems = queueItems.where((i) => i.status == 'PENDING').toList();
    final processed = <KardexRecalculateQueueEntity>[];

    for (final item in pendingItems) {
      final originMovements = await database.movementDao.findAllMovements();
      final origin = originMovements.where((m) => m.id == item.originMovementId).firstOrNull;

      if (origin == null) continue;

      final calculation = engine.calculateRegularization(
        provisionalMovement: origin,
        triggerMovement: triggerMovement,
        isClosedPeriod: isClosedPeriod,
      );

      final now = DateTime.now().toIso8601String();

      if (calculation.isAutoApproved) {
        // Record immutable correction
        final correction = KardexCorrectionEntity(
          id: _uuid.v4(),
          insumoId: insumoId,
          originMovementId: origin.id,
          triggerMovementId: triggerMovement.id,
          previousUnitCostNio: calculation.previousUnitCostNio,
          recalculatedUnitCostNio: calculation.recalculatedUnitCostNio,
          deltaUnitCostNio: calculation.deltaUnitCostNio,
          totalDeltaCostNio: calculation.totalDeltaCostNio,
          affectedQuantity: calculation.affectedQuantity,
          lineageHash: calculation.lineageHash,
          createdAt: now,
        );

        await database.kardexCorrectionDao.recordCorrectionWithLineage(correction);

        final updatedQueue = KardexRecalculateQueueEntity(
          id: item.id,
          insumoId: item.insumoId,
          originMovementId: item.originMovementId,
          triggerMovementId: triggerMovement.id,
          status: 'COMPLETED',
          attempts: item.attempts + 1,
          createdAt: item.createdAt,
          updatedAt: now,
        );
        await database.kardexRecalculateQueueDao.updateQueueItem(updatedQueue);
        processed.add(updatedQueue);
      } else {
        // Blocked for intervention
        final blockedQueue = KardexRecalculateQueueEntity(
          id: item.id,
          insumoId: item.insumoId,
          originMovementId: item.originMovementId,
          triggerMovementId: triggerMovement.id,
          status: 'BLOCKED',
          attempts: item.attempts + 1,
          lastError: calculation.bloqueoMotivo,
          createdAt: item.createdAt,
          updatedAt: now,
        );
        await database.kardexRecalculateQueueDao.updateQueueItem(blockedQueue);
        processed.add(blockedQueue);
      }
    }

    return processed;
  }

  Future<bool> approveBlockedRegularization({
    required String queueId,
    required String supervisorId,
    required String role,
    required String authMethod,
  }) async {
    final item = await database.kardexRecalculateQueueDao.findQueueById(queueId);
    if (item == null || item.status != 'BLOCKED') return false;

    final movements = await database.movementDao.findAllMovements();
    final origin = movements.where((m) => m.id == item.originMovementId).firstOrNull;
    final trigger = movements.where((m) => m.id == item.triggerMovementId).firstOrNull;

    if (origin == null || trigger == null) return false;

    final calculation = engine.calculateRegularization(
      provisionalMovement: origin,
      triggerMovement: trigger,
    );

    final now = DateTime.now().toIso8601String();

    final correction = KardexCorrectionEntity(
      id: _uuid.v4(),
      insumoId: item.insumoId,
      originMovementId: origin.id,
      triggerMovementId: trigger.id,
      previousUnitCostNio: calculation.previousUnitCostNio,
      recalculatedUnitCostNio: calculation.recalculatedUnitCostNio,
      deltaUnitCostNio: calculation.deltaUnitCostNio,
      totalDeltaCostNio: calculation.totalDeltaCostNio,
      affectedQuantity: calculation.affectedQuantity,
      lineageHash: calculation.lineageHash,
      authorizedByUserId: supervisorId,
      authorizedByRole: role,
      authorizationMethod: authMethod,
      createdAt: now,
    );

    await database.kardexCorrectionDao.recordCorrectionWithLineage(correction);

    await database.kardexRecalculateQueueDao.updateQueueItem(KardexRecalculateQueueEntity(
      id: item.id,
      insumoId: item.insumoId,
      originMovementId: item.originMovementId,
      triggerMovementId: item.triggerMovementId,
      status: 'COMPLETED',
      attempts: item.attempts + 1,
      createdAt: item.createdAt,
      updatedAt: now,
    ));

    return true;
  }
}
