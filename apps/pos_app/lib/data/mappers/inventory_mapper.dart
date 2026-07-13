import 'dart:convert';
import '../../domain/models/inventory/insumo.dart';
import '../../domain/models/inventory/recipe.dart';
import '../../domain/models/inventory/inventory_movement.dart';
import '../../domain/models/inventory/batch_deduction.dart';
import '../../domain/models/inventory/supplier.dart';
import '../../domain/models/inventory/warehouse.dart';
import '../../domain/models/inventory/product.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/inventory/movement_entity.dart';
import '../models/inventory/supplier_entity.dart';
import '../models/inventory/warehouse_entity.dart';
import '../models/inventory/product_entity.dart';

class InventoryMapper {
  static Insumo toInsumoDomain(InsumoEntity entity) {
    return Insumo(
      id: entity.id,
      name: entity.name,
      consumptionUom: entity.consumptionUom,
      stock: entity.stock,
      averageCost: entity.averageCost,
      parLevel: entity.parLevel,
      stockMin: entity.stockMin,
      stockMax: entity.stockMax,
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
      stockMin: domain.stockMin,
      stockMax: domain.stockMax,
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

  static RecipeEntity toRecipeEntity(Recipe domain) {
    return RecipeEntity(
      id: domain.id,
      productId: domain.productId,
      ingredientId: domain.ingredientId,
      ingredientType: domain.ingredientType.name.toLowerCase(),
      quantity: domain.quantity,
    );
  }

  static InventoryMovement toMovementDomain(MovementEntity entity) {
    List<BatchDeduction>? batchDeductions;
    if (entity.batch_deductions != null) {
      final List<dynamic> jsonList = jsonDecode(entity.batch_deductions!);
      batchDeductions = jsonList
          .map((j) => BatchDeduction.fromJson(j as Map<String, dynamic>))
          .toList();
    }

    return InventoryMovement(
      id: entity.id,
      insumoId: entity.insumoId,
      type: MovementType.values.byName(entity.type.toLowerCase()),
      quantity: entity.quantity,
      previousStock: entity.previousStock,
      newStock: entity.newStock,
      timestamp: DateTime.parse(entity.timestamp),
      reason: entity.reason,
      userId: entity.userId,
      unitCostNio: entity.unitCostNio,
      sourceDocumentType: entity.sourceDocumentType,
      sourceDocumentId: entity.sourceDocumentId,
      originMovementId: entity.originMovementId,
      originInvoiceItemId: entity.originInvoiceItemId,
      batchDeductions: batchDeductions,
    );
  }

  static MovementEntity toMovementEntity(InventoryMovement domain) {
    String? batchDeductionsJson;
    if (domain.batchDeductions != null) {
      batchDeductionsJson = jsonEncode(
        domain.batchDeductions!.map((d) => d.toJson()).toList(),
      );
    }

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
      unitCostNio: domain.unitCostNio,
      sourceDocumentType: domain.sourceDocumentType,
      sourceDocumentId: domain.sourceDocumentId,
      originMovementId: domain.originMovementId,
      originInvoiceItemId: domain.originInvoiceItemId,
      batch_deductions: batchDeductionsJson,
    );
  }

  static Product toProductDomain(
    ProductEntity entity, {
    List<ProductVariant> variants = const [],
    List<Modifier> modifiers = const [],
  }) {
    return Product(
      id: entity.id,
      name: entity.name,
      uom: entity.uom,
      stock: entity.stock,
      averageCost: entity.averageCost,
      sellPrice: entity.sellPrice,
      isActive: entity.isActive,
      sku: entity.sku,
      barcode: entity.barcode,
      category: entity.category,
      isPrepared: entity.isPrepared,
      createdAt: entity.createdAt,
      variants: variants,
      availableModifiers: modifiers,
    );
  }

  static ProductEntity toProductEntity(Product domain) {
    return ProductEntity(
      id: domain.id,
      name: domain.name,
      uom: domain.uom,
      stock: domain.stock,
      averageCost: domain.averageCost,
      sellPrice: domain.sellPrice,
      isActive: domain.isActive,
      sku: domain.sku,
      barcode: domain.barcode,
      category: domain.category,
      isPrepared: domain.isPrepared,
      createdAt: domain.createdAt,
    );
  }

  static ProductVariant toVariantDomain(ProductVariantEntity entity) {
    return ProductVariant(
      id: entity.id,
      name: entity.name,
      priceAdjustment: entity.priceAdjustment,
    );
  }

  static ProductVariantEntity toVariantEntity(String productId, ProductVariant domain) {
    return ProductVariantEntity(
      id: domain.id,
      productId: productId,
      name: domain.name,
      priceAdjustment: domain.priceAdjustment,
    );
  }

  static Modifier toModifierDomain(ProductModifierEntity entity) {
    return Modifier(
      id: entity.id,
      name: entity.name,
      extraPrice: entity.extraPrice,
    );
  }

  static ProductModifierEntity toModifierEntity(String productId, Modifier domain) {
    return ProductModifierEntity(
      id: domain.id,
      productId: productId,
      name: domain.name,
      extraPrice: domain.extraPrice,
    );
  }
}
