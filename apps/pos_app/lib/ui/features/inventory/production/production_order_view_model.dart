import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../../../../domain/models/inventory/insumo.dart';
import '../../../../../domain/models/inventory/production_order_document.dart';
import '../../../../../domain/models/inventory/recipe_version_document.dart';
import '../../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../../domain/services/inventory/movement_engine.dart';

typedef ProductionOrderIdFactory = String Function();
typedef ProductionOrderClock = DateTime Function();

class ProductionOrderViewModel extends ChangeNotifier {
  ProductionOrderViewModel(
    this._repository,
    this._movementEngine, {
    ProductionOrderIdFactory? createId,
    ProductionOrderClock? clock,
    Uuid? uuid,
  }) : _createId = createId ?? _defaultCreateId,
       _clock = clock ?? DateTime.now,
       _uuid = uuid ?? const Uuid();

  final InventoryRepository _repository;
  final MovementEngine _movementEngine;
  final ProductionOrderIdFactory _createId;
  final ProductionOrderClock _clock;
  final Uuid _uuid;

  List<ProductionOrderDocument> _orders = <ProductionOrderDocument>[];
  List<Insumo> _availableInsumos = <Insumo>[];
  List<RecipeVersionDocument> _availableRecipeVersions =
      <RecipeVersionDocument>[];
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  List<ProductionOrderDocument> get orders =>
      List<ProductionOrderDocument>.unmodifiable(_orders);
  List<Insumo> get availableInsumos =>
      List<Insumo>.unmodifiable(_availableInsumos);
  List<RecipeVersionDocument> get availableRecipeVersions =>
      List<RecipeVersionDocument>.unmodifiable(_availableRecipeVersions);
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get statusMessage => _statusMessage;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _availableInsumos = await _repository.getActiveInsumos();
      final products = await _repository.getActiveProducts();
      final versionSets = await Future.wait(
        products.map(
          (product) => _repository.getRecipeVersionDocuments(product.id),
        ),
      );
      _availableRecipeVersions =
          versionSets.expand((versions) => versions).toList(growable: false)
            ..sort((left, right) => right.createdAt.compareTo(left.createdAt));
      _orders = await _repository.getProductionOrderDocuments();
      _statusMessage = _orders.isEmpty
          ? 'Cerrá producción localmente con plan vs real y sync posterior.'
          : 'Las órdenes cerradas quedan persistidas y listas para replay BOH.';
    } catch (error) {
      _errorMessage = 'Error al cargar producción: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> closeOrderLocally({
    required RecipeVersionDocument recipeVersion,
    required String producedInsumoId,
    required double plannedQuantity,
    required double actualQuantity,
    required String producedBatchNumber,
    required DateTime producedExpirationDate,
    String outcome = 'COMPLETED',
    String? varianceReason,
  }) async {
    final normalizedOutcome = outcome.trim().toUpperCase();
    final isCompleted = normalizedOutcome == 'COMPLETED';
    if (plannedQuantity <= 0 || (isCompleted && actualQuantity <= 0)) {
      throw ArgumentError(
        'Planned quantity and completed actual quantity must be greater than zero',
      );
    }
    if (!isCompleted &&
        normalizedOutcome != 'FAILED' &&
        normalizedOutcome != 'INTERRUPTED') {
      throw ArgumentError(
        'Production outcome must be COMPLETED, FAILED, or INTERRUPTED',
      );
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final producedInsumo = _availableInsumos.firstWhere(
        (insumo) => insumo.id == producedInsumoId,
      );
      final documentId = _createId();
      const terminalId = 'POS_LOCAL';
      final idempotencyKey = 'production:$terminalId:$documentId';
      final payloadHash =
          '$documentId:$normalizedOutcome:$plannedQuantity:$actualQuantity';
      final movementReason =
          'PRODUCTION_CLOSE:${recipeVersion.id}:${_uuid.v4()}';
      final closeResult = await _movementEngine.buildProductionClose(
        recipeProductId: recipeVersion.productId,
        producedInsumoId: producedInsumoId,
        productionDocumentId: documentId,
        recipeVersionId: recipeVersion.id,
        plannedQuantity: plannedQuantity,
        actualQuantity: actualQuantity,
        outcome: normalizedOutcome,
        reason: movementReason,
      );
      final now = _clock();
      final document = ProductionOrderDocument(
        id: documentId,
        recipeVersionId: recipeVersion.id,
        recipeProductId: recipeVersion.productId,
        recipeProductName: recipeVersion.productName,
        producedInsumoId: producedInsumoId,
        producedInsumoName: producedInsumo.name,
        plannedQuantity: plannedQuantity,
        actualQuantity: actualQuantity,
        producedBatchNumber: producedBatchNumber,
        producedExpirationDate: producedExpirationDate,
        operationDate: now,
        status: 'CLOSED_PENDING_SYNC',
        outcome: normalizedOutcome,
        failureReason: isCompleted ? null : 'DESECHO_COCINA',
        terminalId: terminalId,
        sourceSequence: 0,
        idempotencyKey: idempotencyKey,
        payloadHash: payloadHash,
        totalConsumedCostNio: closeResult.totalConsumedCostNio,
        producedUnitCostNio: closeResult.producedUnitCostNio,
        varianceReason: varianceReason,
        closedAt: now,
        movementReferences: closeResult.movements
            .map((movement) => movement.id)
            .toList(growable: false),
      );

      await _repository.saveProductionCloseTransaction(
        document,
        closeResult.movements,
      );
      _orders = await _repository.getProductionOrderDocuments();
      _statusMessage =
          'Orden cerrada localmente. Movimientos y recibo pendientes de sync.';
    } catch (error) {
      _errorMessage = 'No se pudo cerrar la orden: $error';
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  String resolveInsumoName(String insumoId) {
    for (final insumo in _availableInsumos) {
      if (insumo.id == insumoId) {
        return insumo.name;
      }
    }
    return insumoId;
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  static String _defaultCreateId() => const Uuid().v4();
}
