import 'dart:convert';

import '../../../domain/models/inventory/insumo.dart';
import '../../../domain/models/inventory/inventory_movement.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/models/inventory/supplier.dart';
import '../../../domain/models/inventory/warehouse.dart';
import '../../../domain/models/inventory/uom_conversion.dart';
import '../../../domain/models/inventory/batch.dart';
import '../../../domain/models/inventory/recipe.dart';
import '../../../domain/models/inventory/recipe_version_document.dart';
import '../../../domain/models/inventory/count_session_document.dart';
import '../../../domain/models/inventory/forensic_alert.dart';
import '../../../domain/models/inventory/purchase.dart';
import '../../../domain/models/inventory/production_order_document.dart';
import '../../../domain/models/catalog/catalog_value.dart';
import '../../../domain/models/catalog/catalog_type.dart';
import '../../models/inventory/insumo_entity.dart';
import '../../models/inventory/uom_conversion_entity.dart';
import '../../models/inventory/batch_entity.dart';
import '../../models/catalog/catalog_value_entity.dart';
import '../../mappers/inventory_mapper.dart';
import '../../mappers/purchase_mapper.dart';
import '../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../data/database/app_database.dart';
import '../../daos/inventory/insumo_dao.dart';
import '../../daos/inventory/movement_dao.dart';
import '../../daos/inventory/recipe_dao.dart';
import '../../daos/inventory/supplier_dao.dart';
import '../../daos/inventory/warehouse_dao.dart';
import '../../daos/inventory/count_line_dao.dart';
import '../../daos/inventory/count_session_dao.dart';
import '../../daos/inventory/forensic_alert_dao.dart';
import '../../daos/inventory/uom_conversion_dao.dart';
import '../../daos/inventory/batch_dao.dart';
import '../../daos/inventory/purchase_dao.dart';
import '../../daos/inventory/movement_sync_state_dao.dart';
import '../../daos/inventory/recipe_version_document_dao.dart';
import '../../daos/inventory/production_order_document_dao.dart';
import '../../models/inventory/recipe_version_document_entity.dart';
import '../../models/inventory/count_line_entity.dart';
import '../../models/inventory/count_session_document_entity.dart';
import '../../models/inventory/forensic_alert_entity.dart';
import '../../models/inventory/movement_sync_state_entity.dart';
import '../../models/inventory/production_order_document_entity.dart';
import 'package:dio/dio.dart';

class InventoryRepositoryImpl
    implements InventoryRepository, InventorySyncMetadataRepository {
  final InsumoDao insumoDao;
  final RecipeDao recipeDao;
  final MovementDao movementDao;
  final MovementSyncStateDao movementSyncStateDao;
  final SupplierDao supplierDao;
  final WarehouseDao warehouseDao;
  final CountSessionDao? countSessionDao;
  final CountLineDao? countLineDao;
  final ForensicAlertDao forensicAlertDao;
  final UomConversionDao uomConversionDao;
  final BatchDao batchDao;
  final PurchaseDao purchaseDao;
  final RecipeVersionDocumentDao recipeVersionDocumentDao;
  final ProductionOrderDocumentDao productionOrderDocumentDao;
  final Dio dio;
  final AppDatabase _database;

  InventoryRepositoryImpl({
    required this.insumoDao,
    required this.recipeDao,
    required this.movementDao,
    required this.movementSyncStateDao,
    required this.supplierDao,
    required this.warehouseDao,
    this.countSessionDao,
    this.countLineDao,
    required this.forensicAlertDao,
    required this.uomConversionDao,
    required this.batchDao,
    required this.purchaseDao,
    required this.recipeVersionDocumentDao,
    required this.productionOrderDocumentDao,
    required this.dio,
    required AppDatabase database,
  }) : _database = database;

  @override
  AppDatabase get database => _database;

  @override
  Future<List<Insumo>> getActiveInsumos() async {
    final entities = await insumoDao.findAllActiveInsumos();
    return entities.map(InventoryMapper.toInsumoDomain).toList();
  }

  @override
  Future<Insumo?> getInsumoById(String id) async {
    final entity = await insumoDao.findInsumoById(id);
    return entity != null ? InventoryMapper.toInsumoDomain(entity) : null;
  }

  @override
  Future<List<Insumo>> getInsumosByIds(List<String> ids) async {
    final entities = await insumoDao.findInsumosByIds(ids);
    return entities.map(InventoryMapper.toInsumoDomain).toList();
  }

  @override
  Future<void> updateInsumoStock(String id, double newStock) {
    return insumoDao.updateStock(id, newStock);
  }

  @override
  Future<void> updateInsumoCost(String id, double newCost) async {
    final entity = await insumoDao.findInsumoById(id);
    if (entity != null) {
      final updated = InsumoEntity(
        id: entity.id,
        name: entity.name,
        consumptionUom: entity.consumptionUom,
        warehouseId: entity.warehouseId,
        isPerishable: entity.isPerishable,
        stock: entity.stock,
        averageCost: newCost,
        parLevel: entity.parLevel,
        isActive: entity.isActive,
      );
      await insumoDao.updateInsumo(updated);
    }
  }

  @override
  Future<void> saveInsumo(Insumo insumo) {
    return insumoDao.insertInsumos([InventoryMapper.toInsumoEntity(insumo)]);
  }

  @override
  Future<List<Product>> getActiveProducts() async {
    final entities = await _database.productDao.findAllActiveProducts();
    return entities.map(InventoryMapper.toProductDomain).toList();
  }

  @override
  Future<Product?> getProductById(String id) async {
    final entity = await _database.productDao.findProductById(id);
    return entity != null ? InventoryMapper.toProductDomain(entity) : null;
  }

  @override
  Future<void> saveProduct(Product product) {
    return _database.productDao.insertProducts([
      InventoryMapper.toProductEntity(product),
    ]);
  }

  @override
  Future<void> saveProductOptions({
    required String productId,
    required List<ProductVariant> variants,
    required List<Modifier> modifiers,
  }) async {
    await _database.productDao.deleteVariantsByProductId(productId);
    await _database.productDao.deleteModifiersByProductId(productId);

    if (variants.isNotEmpty) {
      await _database.productDao.insertVariants(
        variants
            .map((v) => InventoryMapper.toVariantEntity(productId, v))
            .toList(),
      );
    }

    if (modifiers.isNotEmpty) {
      await _database.productDao.insertModifiers(
        modifiers
            .map((m) => InventoryMapper.toModifierEntity(productId, m))
            .toList(),
      );
    }
  }

  @override
  Future<List<Recipe>> getRecipeByProductId(String productId) async {
    final entities = await recipeDao.findRecipeByProductId(productId);
    return entities.map(InventoryMapper.toRecipeDomain).toList();
  }

  @override
  Future<void> saveRecipe(Recipe recipe) {
    return recipeDao.insertRecipes([InventoryMapper.toRecipeEntity(recipe)]);
  }

  @override
  Future<void> deleteRecipe(String id) {
    return recipeDao.deleteRecipeById(id);
  }

  @override
  Future<void> replaceRecipesForProduct(
    String productId,
    List<Recipe> recipes,
  ) async {
    await recipeDao.deleteRecipesByProductId(productId);
    if (recipes.isEmpty) {
      return;
    }
    await recipeDao.insertRecipes(
      recipes.map(InventoryMapper.toRecipeEntity).toList(growable: false),
    );
  }

  @override
  Future<List<RecipeVersionDocument>> getRecipeVersionDocuments(
    String productId,
  ) async {
    final entities = await recipeVersionDocumentDao.findByProductId(productId);
    return entities.map(_toRecipeVersionDocument).toList(growable: false);
  }

  @override
  Future<String?> getActiveRecipeVersionId(String productId) async {
    final entities = await recipeVersionDocumentDao.findByProductId(productId);
    if (entities.isEmpty) return null;
    final published = entities
        .where((e) => e.publishedAt != null)
        .toList(growable: false);
    if (published.isEmpty) return null;
    published.sort((a, b) => b.versionNumber.compareTo(a.versionNumber));
    return published.first.id;
  }

  @override
  Future<RecipeVersionDocument?> getRecipeVersionDocumentById(String id) async {
    final entity = await recipeVersionDocumentDao.findById(id);
    return entity == null ? null : _toRecipeVersionDocument(entity);
  }

  @override
  Future<void> saveRecipeVersionDocument(RecipeVersionDocument document) {
    return recipeVersionDocumentDao.upsertDocument(
      RecipeVersionDocumentEntity(
        id: document.id,
        productId: document.productId,
        productName: document.productName,
        versionNumber: document.versionNumber,
        yieldQuantity: document.yieldQuantity,
        technicalShrinkPct: document.technicalShrinkPct,
        createdAt: document.createdAt.toIso8601String(),
        versionNote: document.versionNote,
        publishedAt: document.publishedAt?.toIso8601String(),
        componentsJson: document.encodeComponents(),
        isSynced: document.isSynced,
      ),
    );
  }

  @override
  Future<List<RecipeVersionDocument>>
  getUnsyncedRecipeVersionDocuments() async {
    final entities = await recipeVersionDocumentDao.findUnsynced();
    return entities.map(_toRecipeVersionDocument).toList(growable: false);
  }

  @override
  Future<void> markRecipeVersionDocumentAsSynced(String id) {
    return recipeVersionDocumentDao.markAsSynced(id);
  }

  @override
  Future<List<CountSessionDocument>> getCountSessionDocuments() async {
    final sessionDao = _requireCountSessionDao();
    final lineDao = _requireCountLineDao();
    final sessions = await sessionDao.findAllDocuments();
    final documents = <CountSessionDocument>[];

    for (final session in sessions) {
      final lines = await lineDao.findBySessionId(session.id);
      documents.add(_toCountSessionDocument(session, lines));
    }

    return documents;
  }

  @override
  Future<void> saveCountSessionDocument(CountSessionDocument session) async {
    final sessionDao = _requireCountSessionDao();
    final lineDao = _requireCountLineDao();

    await sessionDao.upsertDocument(
      CountSessionDocumentEntity(
        id: session.id,
        warehouseId: session.warehouseId,
        warehouseName: session.warehouseName,
        cutoffAt: session.cutoffAt.toIso8601String(),
        status: session.status,
        createdAt: session.createdAt.toIso8601String(),
        updatedAt: session.updatedAt.toIso8601String(),
        notes: session.notes,
        postedAt: session.postedAt?.toIso8601String(),
        movementReferencesJson: session.encodeMovementReferences(),
        isSynced: session.isSynced,
      ),
    );

    await lineDao.deleteBySessionId(session.id);
    if (session.lines.isNotEmpty) {
      await lineDao.insertLines(
        session.lines
            .map(
              (line) => CountLineEntity(
                id: line.id,
                sessionId: session.id,
                insumoId: line.insumoId,
                insumoName: line.insumoName,
                uom: line.uom,
                theoreticalQuantity: line.theoreticalQuantity,
                approvedEntryIndex: line.approvedEntryIndex,
                entriesJson: jsonEncode(
                  line.entries
                      .map((entry) => entry.toJson())
                      .toList(growable: false),
                ),
              ),
            )
            .toList(growable: false),
      );
    }
  }

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async {
    final sessionDao = _requireCountSessionDao();
    final lineDao = _requireCountLineDao();
    final sessions = await sessionDao.findUnsynced();
    final documents = <CountSessionDocument>[];

    for (final session in sessions) {
      final lines = await lineDao.findBySessionId(session.id);
      documents.add(_toCountSessionDocument(session, lines));
    }

    return documents;
  }

  @override
  Future<void> markCountSessionDocumentAsSynced(String id) {
    return _requireCountSessionDao().markAsSynced(id);
  }

  @override
  Future<void> saveMovement(InventoryMovement movement) {
    return movementDao.insertMovement(
      InventoryMapper.toMovementEntity(movement),
    );
  }

  @override
  Future<List<InventoryMovement>> getAllMovements() async {
    final entities = await movementDao.findAllMovements();
    return entities
        .map(InventoryMapper.toMovementDomain)
        .toList(growable: false);
  }

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async {
    final entities = await movementDao.findUnsyncedMovements();
    return entities.map(InventoryMapper.toMovementDomain).toList();
  }

  @override
  Future<List<MovementSyncMetadata>> reserveMovementSyncMetadata(
    List<String> movementIds, {
    required String terminalId,
    required String flowType,
  }) async {
    if (movementIds.isEmpty) return const <MovementSyncMetadata>[];

    final existingRows = await movementSyncStateDao.findByMovementIds(
      movementIds,
    );
    final existingById = {for (final row in existingRows) row.movementId: row};
    var nextSequence =
        (await movementSyncStateDao.findMaxLocalSequence(
              terminalId,
              flowType,
            ) ??
            0) +
        1;

    final reserved = <MovementSyncMetadata>[];
    for (final movementId in movementIds) {
      final existing = existingById[movementId];
      if (existing != null &&
          existing.terminalId != null &&
          existing.flowType != null &&
          existing.localSequence != null &&
          existing.idempotencyKey != null) {
        reserved.add(_toMovementSyncMetadata(existing));
        continue;
      }

      final state = MovementSyncStateEntity(
        movementId: movementId,
        syncStatus: existing?.syncStatus ?? MovementSyncStateStatus.pending,
        lastAttemptedAt: existing?.lastAttemptedAt,
        syncedAt: existing?.syncedAt,
        lastError: existing?.lastError,
        terminalId: terminalId,
        flowType: flowType,
        localSequence: nextSequence,
        idempotencyKey: '$flowType:$terminalId:$movementId',
        lastResultCode: existing?.lastResultCode,
      );
      nextSequence += 1;
      await movementSyncStateDao.upsertSyncState(state);
      reserved.add(_toMovementSyncMetadata(state));
    }
    return reserved;
  }

  @override
  Future<void> recordMovementRetryState(
    String movementId, {
    required String resultCode,
    String? error,
  }) async {
    final existing = await movementSyncStateDao.findByMovementId(movementId);
    await movementSyncStateDao.upsertSyncState(
      MovementSyncStateEntity(
        movementId: movementId,
        syncStatus: MovementSyncStateStatus.failed,
        lastAttemptedAt: DateTime.now().toUtc().toIso8601String(),
        lastError: error,
        terminalId: existing?.terminalId,
        flowType: existing?.flowType,
        localSequence: existing?.localSequence,
        idempotencyKey: existing?.idempotencyKey,
        lastResultCode: resultCode,
      ),
    );
  }

  @override
  Future<void> markMovementAsSynced(String id) {
    final now = DateTime.now().toUtc().toIso8601String();
    return movementSyncStateDao.findByMovementId(id).then((existing) {
      return movementSyncStateDao.upsertSyncState(
        MovementSyncStateEntity(
          movementId: id,
          syncStatus: MovementSyncStateStatus.synced,
          lastAttemptedAt: now,
          syncedAt: now,
          terminalId: existing?.terminalId,
          flowType: existing?.flowType,
          localSequence: existing?.localSequence,
          idempotencyKey: existing?.idempotencyKey,
          lastResultCode: existing?.lastResultCode,
        ),
      );
    });
  }

  @override
  Future<void> markMovementAsFailed(String id, {String? error}) {
    return movementSyncStateDao.findByMovementId(id).then((existing) {
      return movementSyncStateDao.upsertSyncState(
        MovementSyncStateEntity(
          movementId: id,
          syncStatus: MovementSyncStateStatus.failed,
          lastAttemptedAt: DateTime.now().toUtc().toIso8601String(),
          lastError: error,
          terminalId: existing?.terminalId,
          flowType: existing?.flowType,
          localSequence: existing?.localSequence,
          idempotencyKey: existing?.idempotencyKey,
          lastResultCode: existing?.lastResultCode,
        ),
      );
    });
  }

  MovementSyncMetadata _toMovementSyncMetadata(MovementSyncStateEntity state) {
    return MovementSyncMetadata(
      movementId: state.movementId,
      terminalId: state.terminalId ?? 'pos-standalone',
      flowType: state.flowType ?? 'inventory',
      localSequence: state.localSequence ?? 0,
      idempotencyKey:
          state.idempotencyKey ??
          'inventory:pos-standalone:${state.movementId}',
      syncStatus: state.syncStatus,
      lastResultCode: state.lastResultCode,
      lastError: state.lastError,
    );
  }

  @override
  Future<List<Supplier>> getActiveSuppliers() async {
    final entities = await supplierDao.findAllActiveSuppliers();
    return entities.map(InventoryMapper.toSupplierDomain).toList();
  }

  @override
  Future<void> saveSupplier(Supplier supplier) {
    return supplierDao.insertSuppliers([
      InventoryMapper.toSupplierEntity(supplier),
    ]);
  }

  @override
  Future<List<Warehouse>> getActiveWarehouses() async {
    final entities = await warehouseDao.findAllActiveWarehouses();
    return entities.map(InventoryMapper.toWarehouseDomain).toList();
  }

  @override
  Future<void> saveWarehouse(Warehouse warehouse) {
    return warehouseDao.insertWarehouses([
      InventoryMapper.toWarehouseEntity(warehouse),
    ]);
  }

  @override
  Future<List<Batch>> getBatchesByInsumoId(String insumoId) async {
    final entities = await batchDao.findActiveBatchesByInsumoId(insumoId);
    return entities
        .map(
          (e) => Batch(
            id: e.id,
            insumoId: e.insumoId,
            batchNumber: e.batchNumber,
            receivedDate: e.receivedDate == null
                ? null
                : DateTime.parse(e.receivedDate!),
            expirationDate: DateTime.parse(e.expirationDate),
            remainingStock: e.remainingStock,
            cost: e.cost,
          ),
        )
        .toList();
  }

  @override
  Future<void> saveBatch(Batch batch) {
    return batchDao.insertBatch(
      BatchEntity(
        id: batch.id,
        insumoId: batch.insumoId,
        batchNumber: batch.batchNumber,
        receivedDate: batch.receivedDate?.toIso8601String(),
        expirationDate: batch.expirationDate.toIso8601String(),
        remainingStock: batch.remainingStock,
        cost: batch.cost,
      ),
    );
  }

  @override
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async {
    final entities = await uomConversionDao.findConversionsByInsumoId(insumoId);
    return entities
        .map(
          (e) => UomConversion(
            id: e.id,
            insumoId: e.insumoId,
            unitName: e.unitName,
            factor: e.factor,
            isDefault: e.isDefault,
          ),
        )
        .toList();
  }

  @override
  Future<void> saveConversion(UomConversion conversion) {
    return uomConversionDao.insertConversions([
      UomConversionEntity(
        id: conversion.id,
        insumoId: conversion.insumoId,
        unitName: conversion.unitName,
        factor: conversion.factor,
        isDefault: conversion.isDefault,
      ),
    ]);
  }

  @override
  Future<void> deleteConversion(String id) {
    return uomConversionDao.deleteConversionById(id);
  }

  // --- Administrable master catalogs (offline mirror) ---

  @override
  Future<List<CatalogValue>> getActiveCatalog(CatalogType type) async {
    final entities = await _database.catalogValueDao.findActiveByType(
      type.value,
    );
    return entities.map(_toCatalogDomain).toList();
  }

  @override
  Future<List<CatalogValue>> getAllCatalog(CatalogType type) async {
    final entities = await _database.catalogValueDao.findAllByType(type.value);
    return entities.map(_toCatalogDomain).toList();
  }

  @override
  Future<CatalogValue?> findCatalogByCode(CatalogType type, String code) async {
    final entity = await _database.catalogValueDao.findByTypeAndCode(
      type.value,
      code,
    );
    return entity == null ? null : _toCatalogDomain(entity);
  }

  @override
  Future<void> upsertCatalogValues(List<CatalogValue> values) {
    return _database.catalogValueDao.insertCatalogValues(
      values.map(_toCatalogEntity).toList(growable: false),
    );
  }

  @override
  Future<void> setCatalogActive(String id, bool isActive) {
    return _database.catalogValueDao.setActive(id, isActive);
  }

  @override
  Future<int> countCatalogValues() async {
    final count = await _database.catalogValueDao.countAll();
    return count ?? 0;
  }

  CatalogValue _toCatalogDomain(CatalogValueEntity entity) {
    final type = CatalogType.fromString(entity.catalogType);
    if (type == null) {
      throw StateError(
        'Unknown catalog_type "${entity.catalogType}" for catalog value '
        '${entity.id}; local DB contains a value for an unsupported protocol type.',
      );
    }
    return CatalogValue(
      id: entity.id,
      catalogType: type,
      code: entity.code,
      name: entity.name,
      isActive: entity.isActive,
      sortOrder: entity.sortOrder,
    );
  }

  CatalogValueEntity _toCatalogEntity(CatalogValue domain) {
    return CatalogValueEntity(
      id: domain.id,
      catalogType: domain.catalogType.value,
      code: domain.code,
      name: domain.name,
      isActive: domain.isActive,
      sortOrder: domain.sortOrder,
    );
  }

  @override
  Future<void> savePurchase(Purchase purchase) async {
    await purchaseDao.insertPurchase(PurchaseMapper.toEntity(purchase));
  }

  @override
  Future<void> queuePurchaseSync(Purchase purchase) async {
    await savePurchase(purchase);
  }

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async {
    final entities = await purchaseDao.findUnsyncedPurchases();
    return entities.map(PurchaseMapper.toDomain).toList(growable: false);
  }

  @override
  Future<List<Purchase>> getPurchaseHistory() async {
    final entities = await purchaseDao.findAllPurchases();
    return entities.map(PurchaseMapper.toDomain).toList(growable: false);
  }

  @override
  Future<void> markPurchaseAsSynced(String id) {
    return purchaseDao.markAsSynced(id);
  }

  @override
  Future<double> fetchOfficialBcnRateByInvoiceDate(DateTime invoiceDate) async {
    final formattedInvoiceDate = _formatInvoiceDate(invoiceDate);

    try {
      final response = await dio.get<Map<String, dynamic>>(
        '/inventory/fx/bcn',
        queryParameters: {'invoiceDate': formattedInvoiceDate},
      );

      final payload = response.data;
      final rawRate = payload?['rateNio'];
      if (rawRate is num) {
        return rawRate.toDouble();
      }

      if (rawRate is String) {
        final parsedRate = double.tryParse(rawRate);
        if (parsedRate != null) {
          return parsedRate;
        }
      }

      throw OfficialBcnRateLookupException(
        'Official BCN lookup returned an invalid rate. Enter the BCN rate manually to continue.',
      );
    } on DioException catch (error) {
      throw OfficialBcnRateLookupException(
        _mapOfficialBcnRateLookupMessage(error, formattedInvoiceDate),
      );
    } on OfficialBcnRateLookupException {
      rethrow;
    } catch (_) {
      throw const OfficialBcnRateLookupException(
        'Could not load the official BCN rate. Enter the BCN rate manually to continue.',
      );
    }
  }

  @override
  Future<List<ForensicAlert>> getForensicAlerts() async {
    final entities = await forensicAlertDao.findAllAlerts();
    return entities.map(_toForensicAlert).toList(growable: false);
  }

  @override
  Future<void> saveForensicAlert(ForensicAlert alert) {
    return forensicAlertDao.upsertAlert(
      ForensicAlertEntity(
        id: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
        message: alert.message,
        createdAt: alert.createdAt.toIso8601String(),
        status: alert.status,
        note: alert.note,
        actorLabel: alert.actorLabel,
        actedAt: alert.actedAt?.toIso8601String(),
        sourceMovementId: alert.sourceMovementId,
        sourceDocumentId: alert.sourceDocumentId,
        sourceDocumentType: alert.sourceDocumentType,
        metadataJson: alert.metadata == null
            ? null
            : jsonEncode(alert.metadata),
        isSynced: alert.isSynced,
      ),
    );
  }

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async {
    final entities = await forensicAlertDao.findUnsyncedLifecycleAlerts();
    return entities.map(_toForensicAlert).toList(growable: false);
  }

  @override
  Future<void> markForensicAlertAsSynced(String id) {
    return forensicAlertDao.markAsSynced(id);
  }

  @override
  Future<List<ProductionOrderDocument>> getProductionOrderDocuments() async {
    final entities = await productionOrderDocumentDao.findAllDocuments();
    return entities.map(_toProductionOrderDocument).toList(growable: false);
  }

  @override
  Future<void> saveProductionOrderDocument(ProductionOrderDocument document) {
    return productionOrderDocumentDao.upsertDocument(
      ProductionOrderDocumentEntity(
        id: document.id,
        recipeVersionId: document.recipeVersionId,
        recipeProductId: document.recipeProductId,
        recipeProductName: document.recipeProductName,
        producedInsumoId: document.producedInsumoId,
        producedInsumoName: document.producedInsumoName,
        plannedQuantity: document.plannedQuantity,
        actualQuantity: document.actualQuantity,
        producedBatchNumber: document.producedBatchNumber,
        producedExpirationDate: document.producedExpirationDate
            .toIso8601String(),
        operationDate: document.operationDate.toIso8601String(),
        status: document.status,
        varianceReason: document.varianceReason,
        closedAt: document.closedAt?.toIso8601String(),
        movementReferencesJson: document.encodeMovementReferences(),
        isSynced: document.isSynced,
      ),
    );
  }

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async {
    final entities = await productionOrderDocumentDao.findUnsynced();
    return entities.map(_toProductionOrderDocument).toList(growable: false);
  }

  @override
  Future<void> markProductionOrderDocumentAsSynced(String id) {
    return productionOrderDocumentDao.markAsSynced(id);
  }

  CountSessionDao _requireCountSessionDao() {
    final dao = countSessionDao;
    if (dao == null) {
      throw StateError('CountSessionDao is not configured');
    }
    return dao;
  }

  CountLineDao _requireCountLineDao() {
    final dao = countLineDao;
    if (dao == null) {
      throw StateError('CountLineDao is not configured');
    }
    return dao;
  }

  CountSessionDocument _toCountSessionDocument(
    CountSessionDocumentEntity session,
    List<CountLineEntity> lines,
  ) {
    return CountSessionDocument(
      id: session.id,
      warehouseId: session.warehouseId,
      warehouseName: session.warehouseName,
      cutoffAt: DateTime.parse(session.cutoffAt),
      status: session.status,
      createdAt: DateTime.parse(session.createdAt),
      updatedAt: DateTime.parse(session.updatedAt),
      notes: session.notes,
      postedAt: session.postedAt == null
          ? null
          : DateTime.parse(session.postedAt!),
      movementReferences: CountSessionDocument.decodeMovementReferences(
        session.movementReferencesJson,
      ),
      lines: lines
          .map(
            (line) => CountSessionLineDocument(
              id: line.id,
              insumoId: line.insumoId,
              insumoName: line.insumoName,
              uom: line.uom,
              theoreticalQuantity: line.theoreticalQuantity,
              approvedEntryIndex: line.approvedEntryIndex,
              entries: (jsonDecode(line.entriesJson) as List<dynamic>)
                  .map(
                    (entry) => CountLineEntryDocument.fromJson(
                      Map<String, dynamic>.from(entry as Map),
                    ),
                  )
                  .toList(growable: false),
            ),
          )
          .toList(growable: false),
      isSynced: session.isSynced,
    );
  }

  RecipeVersionDocument _toRecipeVersionDocument(
    RecipeVersionDocumentEntity entity,
  ) {
    return RecipeVersionDocument(
      id: entity.id,
      productId: entity.productId,
      productName: entity.productName,
      versionNumber: entity.versionNumber,
      yieldQuantity: entity.yieldQuantity,
      technicalShrinkPct: entity.technicalShrinkPct,
      createdAt: DateTime.parse(entity.createdAt),
      versionNote: entity.versionNote,
      publishedAt: entity.publishedAt == null
          ? null
          : DateTime.parse(entity.publishedAt!),
      isSynced: entity.isSynced,
      components: RecipeVersionDocument.decodeComponents(entity.componentsJson),
    );
  }

  ProductionOrderDocument _toProductionOrderDocument(
    ProductionOrderDocumentEntity entity,
  ) {
    return ProductionOrderDocument(
      id: entity.id,
      recipeVersionId: entity.recipeVersionId,
      recipeProductId: entity.recipeProductId,
      recipeProductName: entity.recipeProductName,
      producedInsumoId: entity.producedInsumoId,
      producedInsumoName: entity.producedInsumoName,
      plannedQuantity: entity.plannedQuantity,
      actualQuantity: entity.actualQuantity,
      producedBatchNumber: entity.producedBatchNumber,
      producedExpirationDate: DateTime.parse(entity.producedExpirationDate),
      operationDate: DateTime.parse(entity.operationDate),
      status: entity.status,
      varianceReason: entity.varianceReason,
      closedAt: entity.closedAt == null
          ? null
          : DateTime.parse(entity.closedAt!),
      movementReferences: ProductionOrderDocument.decodeMovementReferences(
        entity.movementReferencesJson,
      ),
      isSynced: entity.isSynced,
    );
  }

  ForensicAlert _toForensicAlert(ForensicAlertEntity entity) {
    return ForensicAlert(
      id: entity.id,
      alertType: entity.alertType,
      severity: entity.severity,
      message: entity.message,
      createdAt: DateTime.parse(entity.createdAt),
      status: entity.status,
      note: entity.note,
      actorLabel: entity.actorLabel,
      actedAt: entity.actedAt == null ? null : DateTime.parse(entity.actedAt!),
      sourceMovementId: entity.sourceMovementId,
      sourceDocumentId: entity.sourceDocumentId,
      sourceDocumentType: entity.sourceDocumentType,
      isSynced: entity.isSynced,
      metadata: entity.metadataJson == null
          ? null
          : Map<String, dynamic>.from(
              jsonDecode(entity.metadataJson!) as Map<String, dynamic>,
            ),
    );
  }

  String _formatInvoiceDate(DateTime invoiceDate) {
    final month = invoiceDate.month.toString().padLeft(2, '0');
    final day = invoiceDate.day.toString().padLeft(2, '0');
    return '${invoiceDate.year}-$month-$day';
  }

  String _mapOfficialBcnRateLookupMessage(
    DioException error,
    String formattedInvoiceDate,
  ) {
    final statusCode = error.response?.statusCode;
    if (statusCode == 404) {
      return 'No official BCN rate is available for $formattedInvoiceDate. Enter the BCN rate manually to continue.';
    }

    final isOfflineFailure =
        error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout;
    if (isOfflineFailure) {
      return 'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.';
    }

    return 'Could not load the official BCN rate. Enter the BCN rate manually to continue.';
  }
}
