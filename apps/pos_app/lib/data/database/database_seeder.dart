import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';
import '../services/local_auth_service.dart';
import 'app_database.dart';
import '../models/user_entity.dart';
import '../models/security_profile_entity.dart';
import '../models/catalog/catalog_value_entity.dart';
import '../models/inventory/warehouse_entity.dart';
import '../models/inventory/supplier_entity.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/product_entity.dart';
import '../models/inventory/uom_conversion_entity.dart';
import '../models/inventory/batch_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/inventory/recipe_version_document_entity.dart';
import '../models/inventory/movement_entity.dart';
import '../models/inventory/movement_sync_state_entity.dart';
import '../models/sales/restaurant_area_entity.dart';
import '../models/sales/restaurant_table_entity.dart';
import '../models/sales/promotion_entity.dart';
import '../models/sales/invoice_entity.dart';
import '../models/sales/invoice_item_entity.dart';
import '../models/sales/payment_entity.dart';
import '../models/audit_log_entity.dart';

class DatabaseSeeder {
  static Future<void> seedAll(AppDatabase database, {bool force = false}) async {
    final localAuth = LocalAuthService();
    final now = DateTime.now();

    // 1. Catalog Values (UOM, Categories, Product Types) - ALWAYS ENSURE PRESENT
    final existingCatalogCount = await database.catalogValueDao.countAll() ?? 0;
    if (force || existingCatalogCount == 0) {
      final catalogValues = <CatalogValueEntity>[
        CatalogValueEntity(id: 'cat-uom-und', catalogType: 'UOM', code: 'UND', name: 'Unidad', sortOrder: 0),
        CatalogValueEntity(id: 'cat-uom-kg', catalogType: 'UOM', code: 'kg', name: 'Kilogramo', sortOrder: 1),
        CatalogValueEntity(id: 'cat-uom-g', catalogType: 'UOM', code: 'g', name: 'Gramo', sortOrder: 2),
        CatalogValueEntity(id: 'cat-uom-lb', catalogType: 'UOM', code: 'lb', name: 'Libra', sortOrder: 3),
        CatalogValueEntity(id: 'cat-uom-oz', catalogType: 'UOM', code: 'oz', name: 'Onza', sortOrder: 4),
        CatalogValueEntity(id: 'cat-uom-l', catalogType: 'UOM', code: 'L', name: 'Litro', sortOrder: 5),
        CatalogValueEntity(id: 'cat-uom-ml', catalogType: 'UOM', code: 'ml', name: 'Mililitro', sortOrder: 6),
        CatalogValueEntity(id: 'cat-uom-gal', catalogType: 'UOM', code: 'gal', name: 'Galón', sortOrder: 7),
        CatalogValueEntity(id: 'cat-uom-saco', catalogType: 'UOM', code: 'saco', name: 'Saco', sortOrder: 8),
        CatalogValueEntity(id: 'cat-uom-paq', catalogType: 'UOM', code: 'paq', name: 'Paquete', sortOrder: 9),
        CatalogValueEntity(id: 'cat-uom-caja', catalogType: 'UOM', code: 'caja', name: 'Caja', sortOrder: 10),
        CatalogValueEntity(id: 'cat-uom-porcion', catalogType: 'UOM', code: 'porcion', name: 'Porción', sortOrder: 11),
        CatalogValueEntity(id: 'cat-pcat-bebidas', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'BEBIDAS', name: 'Bebidas', sortOrder: 1),
        CatalogValueEntity(id: 'cat-pcat-calientes', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'BEB-CAL', name: 'Bebidas Calientes', sortOrder: 2),
        CatalogValueEntity(id: 'cat-pcat-frias', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'BEB-FRI', name: 'Bebidas Frías', sortOrder: 3),
        CatalogValueEntity(id: 'cat-pcat-desayunos', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'DESAYUNOS', name: 'Desayunos', sortOrder: 4),
        CatalogValueEntity(id: 'cat-pcat-comidas', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'COMIDAS', name: 'Comidas', sortOrder: 5),
        CatalogValueEntity(id: 'cat-pcat-postres', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'POSTRES', name: 'Postres', sortOrder: 6),
        CatalogValueEntity(id: 'cat-pcat-snacks', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'SNACKS', name: 'Snacks', sortOrder: 7),
        CatalogValueEntity(id: 'cat-pcat-otros', catalogType: 'SALES_PRODUCT_CATEGORY', code: 'OTROS', name: 'Otros', sortOrder: 8),
        CatalogValueEntity(id: 'cat-ptype-prep', catalogType: 'SALES_PRODUCT_TYPE', code: 'PREPARADO', name: 'Preparado en Barra/Cocina', sortOrder: 1),
        CatalogValueEntity(id: 'cat-ptype-rev', catalogType: 'SALES_PRODUCT_TYPE', code: 'REVENTA', name: 'Reventa Comercial', sortOrder: 2),
      ];
      await database.catalogValueDao.insertCatalogValues(catalogValues);
    }

    // 2. Users & Security Profiles
    final existingUsers = await database.userDao.findAllUsers();
    final adminUser = await database.userDao.findUserByEmail('admin@omnifood.ni');
    if (force || existingUsers.isEmpty || adminUser == null) {
      final users = <UserEntity>[
        UserEntity(
          id: 'admin-1',
          name: 'Admin Principal',
          role: 'admin',
          pinHash: localAuth.hashPin('1234'),
          isActive: true,
          email: 'admin@omnifood.ni',
          tenantId: 'pilot-cafe',
        ),
        UserEntity(
          id: 'cajero-1',
          name: 'Carlos Cajero',
          role: 'cashier',
          pinHash: localAuth.hashPin('1111'),
          isActive: true,
          email: 'carlos@omnifood.ni',
          tenantId: 'pilot-cafe',
        ),
        UserEntity(
          id: 'mesero-1',
          name: 'Mario Mesero',
          role: 'waiter',
          pinHash: localAuth.hashPin('2222'),
          isActive: true,
          email: 'mario@omnifood.ni',
          tenantId: 'pilot-cafe',
        ),
        UserEntity(
          id: 'cocina-1',
          name: 'Chef Roberto',
          role: 'kitchen',
          pinHash: localAuth.hashPin('3333'),
          isActive: true,
          email: 'roberto@omnifood.ni',
          tenantId: 'pilot-cafe',
        ),
        UserEntity(
          id: 'super-1',
          name: 'Sofía Supervisora',
          role: 'supervisor',
          pinHash: localAuth.hashPin('9999'),
          isActive: true,
          email: 'sofia@omnifood.ni',
          tenantId: 'pilot-cafe',
        ),
      ];

      final profiles = <SecurityProfileEntity>[
        SecurityProfileEntity(
          userId: 'admin-1',
          pinHash: localAuth.hashPin('1234'),
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
        SecurityProfileEntity(
          userId: 'cajero-1',
          pinHash: localAuth.hashPin('1111'),
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
        SecurityProfileEntity(
          userId: 'mesero-1',
          pinHash: localAuth.hashPin('2222'),
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
        SecurityProfileEntity(
          userId: 'cocina-1',
          pinHash: localAuth.hashPin('3333'),
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
        SecurityProfileEntity(
          userId: 'super-1',
          pinHash: localAuth.hashPin('9999'),
          isTotpEnabled: false,
          isPinEnabled: true,
        ),
      ];

      await database.userDao.insertUsers(users);
      await database.securityProfileDao.insertProfiles(profiles);
    }

    // 3. Warehouses
    final existingWarehouses = await database.warehouseDao.findAllActiveWarehouses();
    if (force || existingWarehouses.isEmpty) {
      final warehouses = <WarehouseEntity>[
        WarehouseEntity(id: 'BOD-01', name: 'Almacén Central', description: 'Bodega principal de insumos secos y granos'),
        WarehouseEntity(id: 'BOD-02', name: 'Barra & Cafetería', description: 'Stock de operación inmediata para baristas'),
        WarehouseEntity(id: 'BOD-03', name: 'Cocina & BOH', description: 'Almacén de cocina caliente y refrigerados'),
      ];
      await database.warehouseDao.insertWarehouses(warehouses);
    }

    // 4. Suppliers
    final existingSuppliers = await database.supplierDao.findAllActiveSuppliers();
    if (force || existingSuppliers.isEmpty) {
      final suppliers = <SupplierEntity>[
        SupplierEntity(id: 'PROV-01', name: 'Café Las Flores S.A.', phone: '+505 2278-1111', contactPerson: 'Juan Flores', creditTerms: '30 días'),
        SupplierEntity(id: 'PROV-02', name: 'Lácteos La Perfecta S.A.', phone: '+505 2249-2222', contactPerson: 'María Gómez', creditTerms: '15 días'),
        SupplierEntity(id: 'PROV-03', name: 'Granos Básicos Tío Pelón', phone: '+505 2233-4444', contactPerson: 'Pedro Rivas', creditTerms: 'Contado'),
        SupplierEntity(id: 'PROV-04', name: 'Empaques & Vasos Nicapack', phone: '+505 2255-6666', contactPerson: 'Ana Toruño', creditTerms: '30 días'),
      ];
      await database.supplierDao.insertSuppliers(suppliers);
    }

    // 5. Insumos (Raw Materials)
    final existingInsumos = await database.insumoDao.findAllActiveInsumos();
    if (force || existingInsumos.isEmpty) {
      final insumos = <InsumoEntity>[
        InsumoEntity(id: 'INS-01', name: 'Café en Grano Matagalpa', consumptionUom: 'kg', warehouseId: 'BOD-02', stock: 24.5, averageCost: 180.0, parLevel: 30.0, stockMin: 5.0, stockMax: 50.0),
        InsumoEntity(id: 'INS-02', name: 'Leche Entera La Perfecta', consumptionUom: 'L', warehouseId: 'BOD-02', stock: 38.0, averageCost: 38.0, parLevel: 50.0, stockMin: 10.0, stockMax: 80.0, isPerishable: true),
        InsumoEntity(id: 'INS-03', name: 'Azúcar Sulfitada San Antonio', consumptionUom: 'kg', warehouseId: 'BOD-02', stock: 48.0, averageCost: 22.0, parLevel: 60.0, stockMin: 10.0, stockMax: 100.0),
        InsumoEntity(id: 'INS-04', name: 'Queso Chontaleño Fresco', consumptionUom: 'kg', warehouseId: 'BOD-03', stock: 14.0, averageCost: 115.0, parLevel: 20.0, stockMin: 3.0, stockMax: 30.0, isPerishable: true),
        InsumoEntity(id: 'INS-05', name: 'Arroz 80/20 Calidad Superior', consumptionUom: 'kg', warehouseId: 'BOD-03', stock: 58.0, averageCost: 24.0, parLevel: 80.0, stockMin: 15.0, stockMax: 120.0),
        InsumoEntity(id: 'INS-06', name: 'Frijol Rojo de Seda Nacional', consumptionUom: 'kg', warehouseId: 'BOD-03', stock: 42.0, averageCost: 36.0, parLevel: 60.0, stockMin: 10.0, stockMax: 90.0),
        InsumoEntity(id: 'INS-07', name: 'Crema Ácida Nicaragüense', consumptionUom: 'L', warehouseId: 'BOD-03', stock: 11.5, averageCost: 68.0, parLevel: 18.0, stockMin: 3.0, stockMax: 25.0, isPerishable: true),
        InsumoEntity(id: 'INS-08', name: 'Vaso Térmico 12oz con Tapa', consumptionUom: 'UND', warehouseId: 'BOD-02', stock: 220.0, averageCost: 3.50, parLevel: 350.0, stockMin: 50.0, stockMax: 500.0),
        InsumoEntity(id: 'INS-09', name: 'Vaso Térmico 16oz con Tapa', consumptionUom: 'UND', warehouseId: 'BOD-02', stock: 175.0, averageCost: 4.20, parLevel: 300.0, stockMin: 40.0, stockMax: 400.0),
        InsumoEntity(id: 'INS-10', name: 'Pulpa de Pitahaya Congelada', consumptionUom: 'kg', warehouseId: 'BOD-02', stock: 12.0, averageCost: 45.0, parLevel: 18.0, stockMin: 3.0, stockMax: 30.0, isPerishable: true),
      ];
      await database.insumoDao.insertInsumos(insumos);
    }

    // 6. Insumo UOM Conversions
    final existingConversions = await database.uomConversionDao.findConversionsByInsumoId('INS-01');
    if (force || existingConversions.isEmpty) {
      final conversions = <UomConversionEntity>[
        UomConversionEntity(id: 'CONV-01-01', insumoId: 'INS-01', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-01-02', insumoId: 'INS-01', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-01-03', insumoId: 'INS-01', unitName: 'g', factor: 0.001),
        UomConversionEntity(id: 'CONV-01-04', insumoId: 'INS-01', unitName: 'saco', factor: 45.36),
        UomConversionEntity(id: 'CONV-02-01', insumoId: 'INS-02', unitName: 'L', factor: 1.0),
        UomConversionEntity(id: 'CONV-02-02', insumoId: 'INS-02', unitName: 'ml', factor: 0.001),
        UomConversionEntity(id: 'CONV-02-03', insumoId: 'INS-02', unitName: 'gal', factor: 3.78541),
        UomConversionEntity(id: 'CONV-02-04', insumoId: 'INS-02', unitName: 'caja', factor: 12.0),
        UomConversionEntity(id: 'CONV-03-01', insumoId: 'INS-03', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-03-02', insumoId: 'INS-03', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-03-03', insumoId: 'INS-03', unitName: 'saco', factor: 50.0),
        UomConversionEntity(id: 'CONV-04-01', insumoId: 'INS-04', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-04-02', insumoId: 'INS-04', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-05-01', insumoId: 'INS-05', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-05-02', insumoId: 'INS-05', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-05-03', insumoId: 'INS-05', unitName: 'saco', factor: 45.36),
        UomConversionEntity(id: 'CONV-06-01', insumoId: 'INS-06', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-06-02', insumoId: 'INS-06', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-06-03', insumoId: 'INS-06', unitName: 'saco', factor: 45.36),
        UomConversionEntity(id: 'CONV-07-01', insumoId: 'INS-07', unitName: 'L', factor: 1.0),
        UomConversionEntity(id: 'CONV-07-02', insumoId: 'INS-07', unitName: 'ml', factor: 0.001),
        UomConversionEntity(id: 'CONV-08-01', insumoId: 'INS-08', unitName: 'UND', factor: 1.0),
        UomConversionEntity(id: 'CONV-08-02', insumoId: 'INS-08', unitName: 'paq', factor: 50.0),
        UomConversionEntity(id: 'CONV-08-03', insumoId: 'INS-08', unitName: 'caja', factor: 1000.0),
        UomConversionEntity(id: 'CONV-09-01', insumoId: 'INS-09', unitName: 'UND', factor: 1.0),
        UomConversionEntity(id: 'CONV-09-02', insumoId: 'INS-09', unitName: 'paq', factor: 50.0),
        UomConversionEntity(id: 'CONV-09-03', insumoId: 'INS-09', unitName: 'caja', factor: 1000.0),
        UomConversionEntity(id: 'CONV-10-01', insumoId: 'INS-10', unitName: 'kg', factor: 1.0),
        UomConversionEntity(id: 'CONV-10-02', insumoId: 'INS-10', unitName: 'lb', factor: 0.453592),
        UomConversionEntity(id: 'CONV-10-03', insumoId: 'INS-10', unitName: 'paq', factor: 1.0),
      ];
      await database.uomConversionDao.insertConversions(conversions);
    }

    // 7. Batches (FIFO Stock Lots for Perishables)
    final existingBatches = await database.batchDao.findActiveBatchesByInsumoId('INS-02');
    if (force || existingBatches.isEmpty) {
      final batches = <BatchEntity>[
        BatchEntity(
          id: 'BATCH-INS-02-01',
          insumoId: 'INS-02',
          batchNumber: 'LOTE-LEC-2026-08',
          remainingStock: 38.0,
          receivedDate: now.subtract(const Duration(days: 2)).toIso8601String(),
          expirationDate: now.add(const Duration(days: 12)).toIso8601String(),
          cost: 38.0,
          isSynced: true,
        ),
        BatchEntity(
          id: 'BATCH-INS-04-01',
          insumoId: 'INS-04',
          batchNumber: 'LOTE-QUE-2026-08',
          remainingStock: 14.0,
          receivedDate: now.subtract(const Duration(days: 1)).toIso8601String(),
          expirationDate: now.add(const Duration(days: 8)).toIso8601String(),
          cost: 115.0,
          isSynced: true,
        ),
        BatchEntity(
          id: 'BATCH-INS-07-01',
          insumoId: 'INS-07',
          batchNumber: 'LOTE-CRE-2026-08',
          remainingStock: 11.5,
          receivedDate: now.subtract(const Duration(days: 1)).toIso8601String(),
          expirationDate: now.add(const Duration(days: 15)).toIso8601String(),
          cost: 68.0,
          isSynced: true,
        ),
        BatchEntity(
          id: 'BATCH-INS-10-01',
          insumoId: 'INS-10',
          batchNumber: 'LOTE-PIT-2026-08',
          remainingStock: 12.0,
          receivedDate: now.subtract(const Duration(days: 3)).toIso8601String(),
          expirationDate: now.add(const Duration(days: 45)).toIso8601String(),
          cost: 45.0,
          isSynced: true,
        ),
      ];
      for (final b in batches) {
        await database.batchDao.insertBatch(b);
      }
    }

    // 8. Products, Variants & Modifiers
    final existingProducts = await database.productDao.findAllActiveProducts();
    if (force || existingProducts.isEmpty) {
      final products = <ProductEntity>[
        ProductEntity(id: 'PROD-01', name: 'Café Americano', uom: 'UND', stock: 100.0, averageCost: 12.50, sellPrice: 60.0, sku: 'CAF-AME-01', category: 'Bebidas Calientes', isPrepared: true),
        ProductEntity(id: 'PROD-02', name: 'Cappuccino Artesanal', uom: 'UND', stock: 100.0, averageCost: 22.00, sellPrice: 85.0, sku: 'CAF-CAP-01', category: 'Bebidas Calientes', isPrepared: true),
        ProductEntity(id: 'PROD-03', name: 'Desayuno Típico Nica', uom: 'UND', stock: 50.0, averageCost: 42.00, sellPrice: 130.0, sku: 'DES-TIP-01', category: 'Desayunos', isPrepared: true),
        ProductEntity(id: 'PROD-04', name: 'Quesillo Doble Especial', uom: 'UND', stock: 50.0, averageCost: 31.00, sellPrice: 95.0, sku: 'COM-QUE-01', category: 'Comidas', isPrepared: true),
        ProductEntity(id: 'PROD-05', name: 'Nacatamal de Cerdo Tradicional', uom: 'UND', stock: 30.0, averageCost: 48.00, sellPrice: 120.0, sku: 'COM-NAC-01', category: 'Comidas', isPrepared: true),
        ProductEntity(id: 'PROD-06', name: 'Jugo Natural de Pitahaya', uom: 'UND', stock: 60.0, averageCost: 16.00, sellPrice: 55.0, sku: 'BEB-PIT-01', category: 'Bebidas Frías', isPrepared: true),
        ProductEntity(id: 'PROD-07', name: 'Pastel Tres Leches Artesanal', uom: 'UND', stock: 25.0, averageCost: 28.00, sellPrice: 90.0, sku: 'POS-3LE-01', category: 'Postres', isPrepared: true),
        ProductEntity(id: 'PROD-08', name: 'Agua Purificada 600ml', uom: 'UND', stock: 80.0, averageCost: 12.00, sellPrice: 30.0, sku: 'BEB-AGU-01', category: 'Bebidas Frías', isPrepared: false),
      ];
      await database.productDao.insertProducts(products);

      final variants = <ProductVariantEntity>[
        ProductVariantEntity(id: 'VAR-01-01', productId: 'PROD-01', name: '12oz Regular', priceAdjustment: 0.0),
        ProductVariantEntity(id: 'VAR-01-02', productId: 'PROD-01', name: '16oz Grande', priceAdjustment: 25.0),
      ];
      await database.productDao.insertVariants(variants);

      final modifiers = <ProductModifierEntity>[
        ProductModifierEntity(id: 'MOD-01-01', productId: 'PROD-01', name: 'Leche de Almendras', extraPrice: 20.0),
        ProductModifierEntity(id: 'MOD-01-02', productId: 'PROD-01', name: 'Extra Shot Espresso', extraPrice: 15.0),
        ProductModifierEntity(id: 'MOD-02-01', productId: 'PROD-02', name: 'Canela en Polvo', extraPrice: 5.0),
        ProductModifierEntity(id: 'MOD-02-02', productId: 'PROD-02', name: 'Sirope de Vainilla', extraPrice: 15.0),
        ProductModifierEntity(id: 'MOD-03-01', productId: 'PROD-03', name: 'Queso Frito Extra', extraPrice: 25.0),
        ProductModifierEntity(id: 'MOD-03-02', productId: 'PROD-03', name: 'Huevo Extra al Gusto', extraPrice: 15.0),
        ProductModifierEntity(id: 'MOD-04-01', productId: 'PROD-04', name: 'Con Chile Cabro', extraPrice: 0.0),
        ProductModifierEntity(id: 'MOD-04-02', productId: 'PROD-04', name: 'Extra Crema Chontaleña', extraPrice: 15.0),
        ProductModifierEntity(id: 'MOD-05-01', productId: 'PROD-05', name: 'Pan Simple Extra', extraPrice: 10.0),
      ];
      await database.productDao.insertModifiers(modifiers);
    }

    // 9. Recipes & Version Documents
    final existingRecipes = await database.recipeDao.findRecipeByProductId('PROD-01');
    if (force || existingRecipes.isEmpty) {
      final recipes = <RecipeEntity>[
        RecipeEntity(id: 'REC-01-01', productId: 'PROD-01', ingredientId: 'INS-01', ingredientType: 'INSUMO', quantity: 0.018),
        RecipeEntity(id: 'REC-01-02', productId: 'PROD-01', ingredientId: 'INS-08', ingredientType: 'INSUMO', quantity: 1.0),
        RecipeEntity(id: 'REC-02-01', productId: 'PROD-02', ingredientId: 'INS-01', ingredientType: 'INSUMO', quantity: 0.018),
        RecipeEntity(id: 'REC-02-02', productId: 'PROD-02', ingredientId: 'INS-02', ingredientType: 'INSUMO', quantity: 0.20),
        RecipeEntity(id: 'REC-02-03', productId: 'PROD-02', ingredientId: 'INS-08', ingredientType: 'INSUMO', quantity: 1.0),
        RecipeEntity(id: 'REC-03-01', productId: 'PROD-03', ingredientId: 'INS-05', ingredientType: 'INSUMO', quantity: 0.15),
        RecipeEntity(id: 'REC-03-02', productId: 'PROD-03', ingredientId: 'INS-06', ingredientType: 'INSUMO', quantity: 0.10),
        RecipeEntity(id: 'REC-03-03', productId: 'PROD-03', ingredientId: 'INS-04', ingredientType: 'INSUMO', quantity: 0.08),
        RecipeEntity(id: 'REC-03-04', productId: 'PROD-03', ingredientId: 'INS-07', ingredientType: 'INSUMO', quantity: 0.05),
      ];
      await database.recipeDao.insertRecipes(recipes);

      final recipeDocs = <RecipeVersionDocumentEntity>[
        RecipeVersionDocumentEntity(
          id: 'RDOC-01',
          productId: 'PROD-01',
          productName: 'Café Americano',
          versionNumber: 1,
          yieldQuantity: 1.0,
          technicalShrinkPct: 2.0,
          createdAt: now.toIso8601String(),
          publishedAt: now.toIso8601String(),
          versionNote: 'Receta estándar 12oz con grano Matagalpa',
          componentsJson: jsonEncode([
            {'ingredient_id': 'INS-01', 'ingredient_name': 'Café en Grano Matagalpa', 'ingredient_type': 'INSUMO', 'gross_quantity': 0.018, 'net_quantity': 0.0176, 'technical_shrink_pct': 2.0, 'unit_cost_nio': 180.0, 'component_uom': 'kg'},
            {'ingredient_id': 'INS-08', 'ingredient_name': 'Vaso Térmico 12oz', 'ingredient_type': 'INSUMO', 'gross_quantity': 1.0, 'net_quantity': 1.0, 'technical_shrink_pct': 0.0, 'unit_cost_nio': 3.50, 'component_uom': 'UND'},
          ]),
          isSynced: true,
        ),
        RecipeVersionDocumentEntity(
          id: 'RDOC-02',
          productId: 'PROD-02',
          productName: 'Cappuccino Artesanal',
          versionNumber: 1,
          yieldQuantity: 1.0,
          technicalShrinkPct: 3.0,
          createdAt: now.toIso8601String(),
          publishedAt: now.toIso8601String(),
          versionNote: 'Doble shot y leche texturizada',
          componentsJson: jsonEncode([
            {'ingredient_id': 'INS-01', 'ingredient_name': 'Café en Grano Matagalpa', 'ingredient_type': 'INSUMO', 'gross_quantity': 0.018, 'net_quantity': 0.0175, 'technical_shrink_pct': 3.0, 'unit_cost_nio': 180.0, 'component_uom': 'kg'},
            {'ingredient_id': 'INS-02', 'ingredient_name': 'Leche Entera La Perfecta', 'ingredient_type': 'INSUMO', 'gross_quantity': 0.20, 'net_quantity': 0.194, 'technical_shrink_pct': 3.0, 'unit_cost_nio': 38.00, 'component_uom': 'L'},
            {'ingredient_id': 'INS-08', 'ingredient_name': 'Vaso Térmico 12oz', 'ingredient_type': 'INSUMO', 'gross_quantity': 1.0, 'net_quantity': 1.0, 'technical_shrink_pct': 0.0, 'unit_cost_nio': 3.50, 'component_uom': 'UND'},
          ]),
          isSynced: true,
        ),
      ];
      for (final doc in recipeDocs) {
        await database.recipeVersionDocumentDao.upsertDocument(doc);
      }
    }

    // Auto-migrate any existing legacy recipe documents in SQLite for demo products
    for (final pid in ['PROD-01', 'PROD-02', 'PROD-03', 'PROD-04']) {
      final docs = await database.recipeVersionDocumentDao.findByProductId(pid);
      for (final doc in docs) {
        if (doc.componentsJson.contains('raw_material')) {
          final updatedJson = doc.componentsJson.replaceAll('raw_material', 'INSUMO');
          await database.recipeVersionDocumentDao.upsertDocument(
            RecipeVersionDocumentEntity(
              id: doc.id,
              productId: doc.productId,
              productName: doc.productName,
              versionNumber: doc.versionNumber,
              yieldQuantity: doc.yieldQuantity,
              technicalShrinkPct: doc.technicalShrinkPct,
              createdAt: doc.createdAt,
              publishedAt: doc.publishedAt,
              versionNote: doc.versionNote,
              componentsJson: updatedJson,
              isSynced: doc.isSynced,
            ),
          );
        }
      }
    }

    // 8. Areas & Tables
    final existingAreas = await database.restaurantAreaDao.getAllAreas();
    if (force || existingAreas.isEmpty) {
      final areas = <RestaurantAreaEntity>[
        RestaurantAreaEntity(id: 'AREA-01', name: 'Terraza Food Park', displayOrder: 1, isActive: true),
        RestaurantAreaEntity(id: 'AREA-02', name: 'Salón Climatizado', displayOrder: 2, isActive: true),
        RestaurantAreaEntity(id: 'AREA-03', name: 'Barra Barista', displayOrder: 3, isActive: true),
      ];
      await database.restaurantAreaDao.insertAreas(areas);

      final tables = <RestaurantTableEntity>[
        RestaurantTableEntity(id: 'TAB-01', areaId: 'AREA-01', tableNumber: 'T-01', capacity: 4, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-02', areaId: 'AREA-01', tableNumber: 'T-02', capacity: 4, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-03', areaId: 'AREA-01', tableNumber: 'T-03', capacity: 4, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-04', areaId: 'AREA-01', tableNumber: 'T-04', capacity: 6, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-05', areaId: 'AREA-02', tableNumber: 'M-01', capacity: 4, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-06', areaId: 'AREA-02', tableNumber: 'M-02', capacity: 4, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-07', areaId: 'AREA-02', tableNumber: 'M-03', capacity: 2, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-08', areaId: 'AREA-02', tableNumber: 'M-04', capacity: 6, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-09', areaId: 'AREA-03', tableNumber: 'B-01', capacity: 2, status: 'DISPONIBLE'),
        RestaurantTableEntity(id: 'TAB-10', areaId: 'AREA-03', tableNumber: 'B-02', capacity: 2, status: 'DISPONIBLE'),
      ];
      await database.restaurantTableDao.insertTables(tables);
    }

    // 9. Promotions
    final existingPromotions = await database.promotionDao.getActivePromotions();
    if (force || existingPromotions.isEmpty) {
      final promotions = <PromotionEntity>[
        PromotionEntity(
          id: 'PROM-01',
          name: '2x1 en Café Americano',
          type: 'twoForOne',
          targetProductId: 'PROD-01',
          buyQuantity: 1,
          getQuantity: 1,
          discountValue: 0.0,
          isActive: true,
        ),
        PromotionEntity(
          id: 'PROM-02',
          name: '10% Descuento en Desayuno',
          type: 'percentageDiscount',
          targetProductId: 'PROD-03',
          buyQuantity: 1,
          getQuantity: 1,
          discountValue: 10.0,
          isActive: true,
        ),
      ];
      for (final promo in promotions) {
        await database.promotionDao.savePromotion(promo);
      }
    }

    // 10. Kardex Movements
    final existingMovements = await database.movementDao.findAllMovements();
    if (force || existingMovements.isEmpty) {
      final movements = <MovementEntity>[
        MovementEntity(
          id: 'MOV-01',
          insumoId: 'INS-01',
          type: 'PURCHASE_RECEIPT',
          quantity: 25.0,
          previousStock: 0.0,
          newStock: 25.0,
          unitCostNio: 180.0,
          timestamp: now.subtract(const Duration(days: 2)).toIso8601String(),
          reason: 'Compra factura #F-1029 Café Las Flores',
          userId: 'admin-1',
        ),
        MovementEntity(
          id: 'MOV-02',
          insumoId: 'INS-02',
          type: 'PURCHASE_RECEIPT',
          quantity: 40.0,
          previousStock: 0.0,
          newStock: 40.0,
          unitCostNio: 38.0,
          timestamp: now.subtract(const Duration(days: 2)).toIso8601String(),
          reason: 'Compra factura #L-8821 La Perfecta',
          userId: 'admin-1',
        ),
        MovementEntity(
          id: 'MOV-03',
          insumoId: 'INS-01',
          type: 'SALE_DEDUCTION',
          quantity: -0.50,
          previousStock: 25.0,
          newStock: 24.5,
          unitCostNio: 180.0,
          timestamp: now.subtract(const Duration(hours: 4)).toIso8601String(),
          reason: 'Deducción automática por ventas del turno',
          userId: 'cajero-1',
        ),
        MovementEntity(
          id: 'MOV-04',
          insumoId: 'INS-02',
          type: 'SALE_DEDUCTION',
          quantity: -2.0,
          previousStock: 40.0,
          newStock: 38.0,
          unitCostNio: 38.0,
          timestamp: now.subtract(const Duration(hours: 4)).toIso8601String(),
          reason: 'Deducción automática por ventas del turno',
          userId: 'cajero-1',
        ),
      ];
      for (final mov in movements) {
        await database.movementDao.insertMovement(mov);
        await database.movementSyncStateDao.upsertSyncState(
          MovementSyncStateEntity(
            movementId: mov.id,
            syncStatus: 'synced',
            syncedAt: now.toIso8601String(),
          ),
        );
      }
    }

    // 11. Sales Invoices & Payments (History & DGI Report)
    final existingInvoices = await database.invoiceDao.getAllInvoices();
    if (force || existingInvoices.isEmpty) {
      final invoices = <InvoiceEntity>[
        InvoiceEntity(
          id: 'INV-01',
          number: '001-001-01-00000001',
          createdAt: now.subtract(const Duration(hours: 3)).millisecondsSinceEpoch,
          userId: 'cajero-1',
          subtotal: 150.0,
          totalTax: 22.5,
          total: 172.50,
          isCanceled: false,
          syncStatus: 'synced',
          paymentStatus: 'PAID',
          type: 'regular',
          terminalId: 'term-main',
          sourceSequence: 1,
        ),
        InvoiceEntity(
          id: 'INV-02',
          number: '001-001-01-00000002',
          createdAt: now.subtract(const Duration(hours: 2)).millisecondsSinceEpoch,
          userId: 'cajero-1',
          subtotal: 300.0,
          totalTax: 45.0,
          total: 345.00,
          isCanceled: false,
          syncStatus: 'synced',
          paymentStatus: 'PAID',
          type: 'regular',
          terminalId: 'term-main',
          sourceSequence: 2,
        ),
      ];

      for (final inv in invoices) {
        await database.invoiceDao.insertInvoice(inv);
      }

      final invoiceItems = <InvoiceItemEntity>[
        InvoiceItemEntity(
          id: const Uuid().v4(),
          invoiceId: 'INV-01',
          productId: 'PROD-01',
          productName: 'Café Americano',
          quantity: 1.0,
          unitPrice: 60.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 9.0,
          total: 69.0,
        ),
        InvoiceItemEntity(
          id: const Uuid().v4(),
          invoiceId: 'INV-01',
          productId: 'PROD-07',
          productName: 'Pastel Tres Leches Artesanal',
          quantity: 1.0,
          unitPrice: 90.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 13.5,
          total: 103.5,
        ),
        InvoiceItemEntity(
          id: const Uuid().v4(),
          invoiceId: 'INV-02',
          productId: 'PROD-02',
          productName: 'Cappuccino Artesanal',
          quantity: 2.0,
          unitPrice: 85.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 25.5,
          total: 195.5,
        ),
        InvoiceItemEntity(
          id: const Uuid().v4(),
          invoiceId: 'INV-02',
          productId: 'PROD-03',
          productName: 'Desayuno Típico Nica',
          quantity: 1.0,
          unitPrice: 130.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 19.5,
          total: 149.5,
        ),
      ];
      await database.invoiceItemDao.insertItems(invoiceItems);

      final payments = <PaymentEntity>[
        PaymentEntity(
          id: 'PAY-01',
          invoiceId: 'INV-01',
          method: 'cash',
          amount: 172.50,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 172.50,
          changeGiven: 27.50,
          changeCurrency: 'NIO',
        ),
        PaymentEntity(
          id: 'PAY-02',
          invoiceId: 'INV-02',
          method: 'card',
          amount: 345.00,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 345.00,
          bankPos: 'BAC',
          cardBrand: 'VISA',
          voucherCode: '184920',
          reconciliationStatus: 'CONCILIADO',
        ),
      ];
      await database.paymentDao.insertPayments(payments);
    }

    // 12. Audit Logs with Hash Chain
    final existingLogs = await database.auditDao.findAllLogs();
    if (force || existingLogs.isEmpty) {
      final auditEntries = [
        {'action': 'SISTEMA_INICIADO', 'userId': 'admin-1', 'meta': 'Sistema inicializado con base de datos local SQLite.'},
        {'action': 'USUARIO_AUTENTICADO', 'userId': 'cajero-1', 'meta': 'Inicio de sesión exitoso mediante PIN pad.'},
        {'action': 'APERTURA_CAJA', 'userId': 'cajero-1', 'meta': 'Apertura de turno con fondo inicial C\$ 600.00'},
        {'action': 'VENTA_COMPLETADA', 'userId': 'cajero-1', 'meta': 'Factura 001-001-01-00000001 emitida por C\$ 172.50'},
        {'action': 'VENTA_COMPLETADA', 'userId': 'cajero-1', 'meta': 'Factura 001-001-01-00000002 emitida por C\$ 345.00'},
      ];

      String prevHash = 'GENESIS_HASH_00000000000000000000000000000000';
      for (var i = 0; i < auditEntries.length; i++) {
        final entry = auditEntries[i];
        final seq = i + 1;
        final ts = now.subtract(Duration(minutes: (auditEntries.length - i) * 15)).toIso8601String();
        final content = '$seq|$prevHash|${entry['action']}|${entry['userId']}|$ts';
        final entryHash = sha256.convert(utf8.encode(content)).toString();

        await database.auditDao.insertLog(
          AuditLogEntity(
            userId: entry['userId']!,
            action: entry['action']!,
            timestamp: ts,
            deviceId: 'term-main',
            metadata: entry['meta'],
            sequenceNo: seq,
            prevHash: prevHash,
            entryHash: entryHash,
            remoteRefUuid: const Uuid().v4(),
            isSynced: true,
          ),
        );
        prevHash = entryHash;
      }
    }
  }
}
