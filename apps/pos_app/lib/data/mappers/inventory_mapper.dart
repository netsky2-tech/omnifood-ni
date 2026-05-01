import '../../domain/models/inventory/insumo.dart';
import '../../domain/models/inventory/recipe.dart';
import '../../domain/models/inventory/inventory_movement.dart';
import '../../domain/models/inventory/supplier.dart';
import '../../domain/models/inventory/warehouse.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/inventory/movement_entity.dart';
import '../models/inventory/supplier_entity.dart';
import '../models/inventory/warehouse_entity.dart';

class InventoryMapper {
  static Insumo toInsumoDomain(InsumoEntity entity) {
    return Insumo(
      id: entity.id,
      name: entity.name,
      consumptionUom: entity.consumptionUom,
      stock: entity.stock,
      averageCost: entity.averageCost,
      parLevel: entity.parLevel,
      warehouseId: entity.warehouseId,
      isPerishable: entity.isPerishable,
    );
  }

  static InsumoEntity toInsumoEntity(Insumo domain) {
    return InsumoEntity(
      id: domain.id,
      name: domain.name,
      consumptionUom: domain.consumptionUom,
      stock: domain.stock,
      averageCost: domain.averageCost,
      parLevel: domain.parLevel,
      warehouseId: domain.warehouseId,
      isPerishable: domain.isPerishable,
    );
  }

  static Supplier toSupplierDomain(SupplierEntity entity) {
    return Supplier(
      id: entity.id,
      name: entity.name,
      phone: entity.phone,
      contactPerson: entity.contactPerson,
      creditTerms: entity.creditTerms,
      isActive: entity.isActive,
    );
  }

  static SupplierEntity toSupplierEntity(Supplier domain) {
    return SupplierEntity(
      id: domain.id,
      name: domain.name,
      phone: domain.phone,
      contactPerson: domain.contactPerson,
      creditTerms: domain.creditTerms,
      isActive: domain.isActive,
    );
  }

  static Warehouse toWarehouseDomain(WarehouseEntity entity) {
    return Warehouse(
      id: entity.id,
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
    );
  }

  static WarehouseEntity toWarehouseEntity(Warehouse domain) {
    return WarehouseEntity(
      id: domain.id,
      name: domain.name,
      description: domain.description,
      isActive: domain.isActive,
    );
  }

  static Recipe toRecipeDomain(RecipeEntity entity) {
    return Recipe(
      id: entity.id,
      productId: entity.productId,
      ingredientId: entity.ingredientId,
      ingredientType: IngredientType.values.byName(entity.ingredientType.toLowerCase()),
      quantity: entity.quantity,
    );
  }

  static MovementEntity toMovementEntity(InventoryMovement domain) {
    return MovementEntity(
      id: domain.id,
      insumoId: domain.insumoId,
      type: domain.type.name.toUpperCase(),
      quantity: domain.quantity,
      previousStock: domain.previousStock,
      newStock: domain.newStock,
      timestamp: domain.timestamp.toIso8601String(),
      reason: domain.reason,
      userId: domain.userId,
    );
  }
}
