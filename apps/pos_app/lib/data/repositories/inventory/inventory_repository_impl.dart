import '../../../domain/models/inventory/insumo.dart';
import '../../../domain/models/inventory/inventory_movement.dart';
import '../../../domain/models/inventory/product.dart';
import '../../../domain/models/inventory/supplier.dart';
import '../../../domain/models/inventory/warehouse.dart';
import '../../../domain/models/inventory/uom_conversion.dart';
import '../../../domain/models/inventory/batch.dart';
import '../../../domain/models/inventory/recipe.dart';
import '../../../domain/models/inventory/purchase.dart';
import '../../models/inventory/insumo_entity.dart';
import '../../models/inventory/uom_conversion_entity.dart';
import '../../models/inventory/batch_entity.dart';
import '../../mappers/inventory_mapper.dart';
import '../../mappers/purchase_mapper.dart';
import '../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../data/database/app_database.dart';
import '../../daos/inventory/insumo_dao.dart';
import '../../daos/inventory/movement_dao.dart';
import '../../daos/inventory/recipe_dao.dart';
import '../../daos/inventory/supplier_dao.dart';
import '../../daos/inventory/warehouse_dao.dart';
import '../../daos/inventory/uom_conversion_dao.dart';
import '../../daos/inventory/batch_dao.dart';
import '../../daos/inventory/purchase_dao.dart';
import 'package:dio/dio.dart';

class InventoryRepositoryImpl implements InventoryRepository {
  final InsumoDao insumoDao;
  final RecipeDao recipeDao;
  final MovementDao movementDao;
  final SupplierDao supplierDao;
  final WarehouseDao warehouseDao;
  final UomConversionDao uomConversionDao;
  final BatchDao batchDao;
  final PurchaseDao purchaseDao;
  final Dio dio;
  final AppDatabase _database;

  InventoryRepositoryImpl({
    required this.insumoDao,
    required this.recipeDao,
    required this.movementDao,
    required this.supplierDao,
    required this.warehouseDao,
    required this.uomConversionDao,
    required this.batchDao,
    required this.purchaseDao,
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
  Future<void> saveProductOptions({
    required String productId,
    required List<ProductVariant> variants,
    required List<Modifier> modifiers,
  }) async {
    await _database.productDao.deleteVariantsByProductId(productId);
    await _database.productDao.deleteModifiersByProductId(productId);

    if (variants.isNotEmpty) {
      await _database.productDao.insertVariants(
        variants.map((v) => InventoryMapper.toVariantEntity(productId, v)).toList(),
      );
    }

    if (modifiers.isNotEmpty) {
      await _database.productDao.insertModifiers(
        modifiers.map((m) => InventoryMapper.toModifierEntity(productId, m)).toList(),
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
  Future<void> saveMovement(InventoryMovement movement) {
    return movementDao.insertMovement(InventoryMapper.toMovementEntity(movement));
  }

  @override
  Future<void> processMovements(List<InventoryMovement> movements) {
    final entities = movements.map(InventoryMapper.toMovementEntity).toList();
    return _database.inventoryDao.processInventoryMovements(entities);
  }

  @override
  Future<List<Supplier>> getActiveSuppliers() async {
    final entities = await supplierDao.findAllActiveSuppliers();
    return entities.map(InventoryMapper.toSupplierDomain).toList();
  }

  @override
  Future<void> saveSupplier(Supplier supplier) {
    return supplierDao.insertSuppliers([InventoryMapper.toSupplierEntity(supplier)]);
  }

  @override
  Future<List<Warehouse>> getActiveWarehouses() async {
    final entities = await warehouseDao.findAllActiveWarehouses();
    return entities.map(InventoryMapper.toWarehouseDomain).toList();
  }

  @override
  Future<void> saveWarehouse(Warehouse warehouse) {
    return warehouseDao.insertWarehouses([InventoryMapper.toWarehouseEntity(warehouse)]);
  }

  @override
  Future<List<Batch>> getBatchesByInsumoId(String insumoId) async {
    final entities = await batchDao.findActiveBatchesByInsumoId(insumoId);
    return entities.map((e) => Batch(
      id: e.id,
      insumoId: e.insumoId,
      batchNumber: e.batchNumber,
      expirationDate: DateTime.parse(e.expirationDate),
      remainingStock: e.remainingStock,
      cost: e.cost,
    )).toList();
  }

  @override
  Future<void> saveBatch(Batch batch) {
    return batchDao.insertBatch(BatchEntity(
      id: batch.id,
      insumoId: batch.insumoId,
      batchNumber: batch.batchNumber,
      expirationDate: batch.expirationDate.toIso8601String(),
      remainingStock: batch.remainingStock,
      cost: batch.cost,
    ));
  }

  @override
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async {
    final entities = await uomConversionDao.findConversionsByInsumoId(insumoId);
    return entities.map((e) => UomConversion(
      id: e.id,
      insumoId: e.insumoId,
      unitName: e.unitName,
      factor: e.factor,
      isDefault: e.isDefault,
    )).toList();
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
      )
    ]);
  }

  @override
  Future<void> savePurchase(Purchase purchase) async {
    await purchaseDao.insertPurchase(PurchaseMapper.toEntity(purchase));
  }

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async {
    final entities = await movementDao.findUnsyncedMovements();
    return entities.map(InventoryMapper.toMovementDomain).toList();
  }

  @override
  Future<void> markMovementAsSynced(String id) {
    return movementDao.markAsSynced(id);
  }
}
