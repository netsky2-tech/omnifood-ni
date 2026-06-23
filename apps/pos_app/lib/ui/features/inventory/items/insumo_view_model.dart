import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/product.dart';
import '../../../../domain/models/inventory/warehouse.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../../domain/models/inventory/forensic_alert.dart';
import '../../../../domain/models/catalog/catalog_value.dart';
import '../../../../domain/models/catalog/catalog_type.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/services/alerts/alert_service.dart';

const highValueAlterationThresholdNio = 1500.0;

/// Catalog code used to mark a sales product as prepared (carries a recipe/BOM
/// and deducts insumo stock on sale). The opposite code (`REVENTA`) means
/// direct resale. Both codes are tenant-administrable values in the
/// `SALES_PRODUCT_TYPE` catalog; this constant only maps the prepared flag
/// persisted on the (still bool-based) Product entity to its catalog code.
const preparedProductTypeCode = 'PREPARADO';

class InsumoViewModel with ChangeNotifier {
  InsumoViewModel(this.repository, {AlertService? alertService, Uuid? uuid})
      : _alertService = alertService,
        _uuid = uuid ?? const Uuid();

  final InventoryRepository repository;
  final AlertService? _alertService;
  final Uuid _uuid;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Product> _products = [];
  List<Product> get products => _products;

  List<Warehouse> _warehouses = [];
  List<Warehouse> get warehouses => _warehouses;

  // Administrable master catalogs (offline mirror). Replaces the former
  // hardcoded UI presets (commonConsumptionUoms, commonProductUoms,
  // productCategoryPresets) — these are now tenant-administrable via the
  // Admin backend and cached locally for offline-first operation.
  List<CatalogValue> _uomCatalog = [];
  List<CatalogValue> get uomCatalog => _uomCatalog;

  List<CatalogValue> _productCategoryCatalog = [];
  List<CatalogValue> get productCategoryCatalog => _productCategoryCatalog;

  List<CatalogValue> _productTypeCatalog = [];
  List<CatalogValue> get productTypeCatalog => _productTypeCatalog;

  /// UOM codes for dropdowns (inventory consumption + sales). Empty until the
  /// local catalog is provisioned (migration seed or Admin sync).
  List<String> get uomOptions =>
      _uomCatalog.map((u) => u.code).toList(growable: false);

  /// Sales product category display names for the product form dropdown.
  List<String> get productCategoryNames =>
      _productCategoryCatalog.map((c) => c.name).toList(growable: false);

  /// Sales product type codes (e.g. PREPARADO, REVENTA) for the product form.
  List<String> get productTypeCodes =>
      _productTypeCatalog.map((t) => t.code).toList(growable: false);

  /// Maps the catalog type code to the persisted prepared flag.
  bool isPreparedForTypeCode(String? typeCode) =>
      typeCode == preparedProductTypeCode;

  /// Inverse mapping: derives the catalog type code from the persisted flag.
  String defaultProductTypeCode(bool isPrepared) =>
      isPrepared ? preparedProductTypeCode : 'REVENTA';

  final Map<String, List<UomConversion>> _conversionsByInsumo = {};
  List<UomConversion> conversionsFor(String insumoId) =>
      List.unmodifiable(_conversionsByInsumo[insumoId] ?? const <UomConversion>[]);

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Future<void> loadInitialData() async {
    _isLoading = true;
    notifyListeners();

    _insumos = await repository.getActiveInsumos();
    _products = await repository.getActiveProducts();
    _warehouses = await repository.getActiveWarehouses();

    // Load administrable master catalogs (offline-first: read from local cache
    // seeded by migration and kept fresh by Admin sync).
    _uomCatalog = await repository.getActiveCatalog(CatalogType.uom);
    _productCategoryCatalog =
        await repository.getActiveCatalog(CatalogType.salesProductCategory);
    _productTypeCatalog =
        await repository.getActiveCatalog(CatalogType.salesProductType);

    _isLoading = false;
    notifyListeners();

    await _backfillLowStockAlerts();
  }

  Future<void> loadConversions(String insumoId) async {
    final list = await repository.getConversionsByInsumoId(insumoId);
    _conversionsByInsumo[insumoId] = list;
    notifyListeners();
  }

  Future<void> saveConversion(UomConversion conversion) async {
    await repository.saveConversion(conversion);
    await loadConversions(conversion.insumoId);
  }

  Future<void> deleteConversion(String insumoId, String conversionId) async {
    await repository.deleteConversion(conversionId);
    await loadConversions(insumoId);
  }

  Future<void> saveInsumo({
    String? id,
    required String name,
    required String consumptionUom,
    required double stock,
    required double averageCost,
    double? parLevel,
    double? stockMin,
    double? stockMax,
    String? warehouseId,
    required bool isPerishable,
  }) async {
    final isEdit = id != null;
    final previous = isEdit
        ? _insumos.cast<Insumo?>().firstWhere(
              (item) => item?.id == id,
              orElse: () => null,
            )
        : null;

    final insumo = Insumo(
      id: id ?? _uuid.v4(),
      name: name,
      consumptionUom: consumptionUom,
      stock: stock,
      averageCost: averageCost,
      parLevel: parLevel,
      stockMin: stockMin,
      stockMax: stockMax,
      warehouseId: warehouseId,
      isPerishable: isPerishable,
    );

    await repository.saveInsumo(insumo);
    await loadInitialData();

    if (previous != null) {
      await _evaluateStockAlterationAlert(previous, insumo);
    }
  }

  Future<void> saveProduct({
    String? id,
    required String name,
    String? sku,
    String? barcode,
    String? category,
    required bool isPrepared,
    required String uom,
    required double stock,
    required double averageCost,
    required double sellPrice,
  }) async {
    _isLoading = true;
    notifyListeners();
    try {
      final now = DateTime.now();
      final product = Product(
        id: id ?? _uuid.v4(),
        name: name,
        uom: uom,
        stock: stock,
        averageCost: averageCost,
        sellPrice: sellPrice,
        sku: sku,
        barcode: barcode,
        category: category,
        isPrepared: isPrepared,
        createdAt: now.toIso8601String(),
      );
      await repository.saveProduct(product);
      await loadInitialData();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> saveProductOptions({
    required String productId,
    required List<ProductVariant> variants,
    required List<Modifier> modifiers,
  }) async {
    _isLoading = true;
    notifyListeners();
    try {
      await repository.saveProductOptions(
        productId: productId,
        variants: variants,
        modifiers: modifiers,
      );
      await loadInitialData();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _evaluateStockAlterationAlert(
    Insumo previous,
    Insumo next,
  ) async {
    if (previous.stock == next.stock) {
      return;
    }

    final delta = (next.stock - previous.stock).abs();
    final unitCost = next.averageCost > 0 ? next.averageCost : previous.averageCost;
    final deltaValueNio = delta * unitCost;
    final exceedsThreshold = deltaValueNio > highValueAlterationThresholdNio;

    if (!exceedsThreshold) {
      return;
    }

    final direction = next.stock > previous.stock ? 'INCREMENT' : 'DECREMENT';
    final alert = ForensicAlert(
      id: 'manual-stock-${next.id}-${DateTime.now().millisecondsSinceEpoch}',
      alertType: 'MANUAL_STOCK_ALTERATION',
      severity: 'critical',
      message:
          'Alteración manual de stock en ${next.name}: ${previous.stock.toStringAsFixed(2)} → ${next.stock.toStringAsFixed(2)} (${next.consumptionUom}). Valor afectado: C\$${deltaValueNio.toStringAsFixed(2)}.',
      createdAt: DateTime.now(),
      status: 'active',
      sourceDocumentId: next.id,
      sourceDocumentType: 'manual-stock-edit',
      metadata: <String, dynamic>{
        'item': next.name,
        'previousStock': previous.stock,
        'currentStock': next.stock,
        'delta': delta,
        'unitCostNio': unitCost,
        'deltaValueNio': deltaValueNio,
        'direction': direction,
        'movementType': 'MANUAL_STOCK_ALTERATION',
        'originDocument': 'manual-stock-edit',
      },
    );

    _alertService?.publishAlert(alert);
  }

  Future<void> _backfillLowStockAlerts() async {
    final service = _alertService;
    if (service == null) {
      return;
    }

    final existing = service.sessionAlerts;
    final activeLowStockItems = existing
        .where(
          (alert) =>
              alert.alertType == 'LOW_STOCK' &&
              alert.status == 'active' &&
              alert.sourceDocumentType == 'low-stock-backfill',
        )
        .map((alert) => alert.sourceDocumentId)
        .toSet();

    for (final insumo in _insumos) {
      if (insumo.parLevel == null) {
        continue;
      }
      if (insumo.stock >= insumo.parLevel!) {
        continue;
      }
      if (activeLowStockItems.contains(insumo.id)) {
        continue;
      }

      final alert = ForensicAlert(
        id: 'low-stock-backfill-${insumo.id}',
        alertType: 'LOW_STOCK',
        severity: insumo.stock <= 0 ? 'critical' : 'high',
        message: insumo.stock <= 0
            ? '${insumo.name} sin existencias (PAR ${insumo.parLevel!.toStringAsFixed(2)}).'
            : 'Stock bajo en ${insumo.name}: ${insumo.stock.toStringAsFixed(2)} ${insumo.consumptionUom} (PAR ${insumo.parLevel!.toStringAsFixed(2)}).',
        createdAt: DateTime.now(),
        status: 'active',
        sourceDocumentId: insumo.id,
        sourceDocumentType: 'low-stock-backfill',
        metadata: <String, dynamic>{
          'item': insumo.name,
          'currentStock': insumo.stock,
          'parLevel': insumo.parLevel,
          'originDocument': 'session-low-stock',
          'movementType': 'LOW_STOCK_THRESHOLD',
        },
      );
      service.publishAlert(alert);
    }
  }
}
