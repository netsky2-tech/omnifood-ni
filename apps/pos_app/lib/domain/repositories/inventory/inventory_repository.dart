import '../../models/inventory/insumo.dart';
import '../../models/inventory/recipe.dart';
import '../../models/inventory/inventory_movement.dart';
import '../../models/inventory/supplier.dart';
import '../../models/inventory/warehouse.dart';
import '../../models/inventory/uom_conversion.dart';
import '../../models/inventory/batch.dart';
import '../../../data/database/app_database.dart';

abstract class InventoryRepository {
  AppDatabase get database;
  
  Future<List<Insumo>> getActiveInsumos();
  Future<Insumo?> getInsumoById(String id);
  Future<void> updateInsumoStock(String id, double newStock);
  Future<void> updateInsumoCost(String id, double newCost);
  Future<void> saveInsumo(Insumo insumo);
  
  Future<List<Recipe>> getRecipeByProductId(String productId);
  
  Future<void> saveMovement(InventoryMovement movement);

  // Suppliers
  Future<List<Supplier>> getActiveSuppliers();
  Future<void> saveSupplier(Supplier supplier);

  // Warehouses
  Future<List<Warehouse>> getActiveWarehouses();
  Future<void> saveWarehouse(Warehouse warehouse);
  // Batch Tracking
  Future<List<Batch>> getBatchesByInsumoId(String insumoId);
  Future<void> saveBatch(Batch batch);

  // UOM Conversions
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId);
  Future<void> saveConversion(UomConversion conversion);
}
