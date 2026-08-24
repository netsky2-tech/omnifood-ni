import 'package:flutter/foundation.dart';
import '../../../../../domain/models/inventory/insumo.dart';
import '../../../../../domain/models/inventory/inventory_valuation_report.dart';
import '../../../../../domain/repositories/inventory/inventory_repository.dart';

enum ValuationFilterMode {
  all,
  withStock,
  lowStock,
  negativeStock,
}

class InventoryValuationViewModel extends ChangeNotifier {
  InventoryValuationViewModel(this._inventoryRepository);

  final InventoryRepository _inventoryRepository;

  bool _isLoading = false;
  String? _errorMessage;
  String _searchQuery = '';
  ValuationFilterMode _filterMode = ValuationFilterMode.all;

  InventoryValuationReport? _report;

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  ValuationFilterMode get filterMode => _filterMode;
  InventoryValuationReport? get report => _report;

  double get totalValuationNio => _report?.totalValuationNio ?? 0.0;
  int get totalItemsCount => _report?.totalItemsCount ?? 0;
  int get itemsWithStockCount => _report?.itemsWithStockCount ?? 0;
  int get itemsLowStockCount => _report?.itemsLowStockCount ?? 0;
  int get itemsNegativeStockCount => _report?.itemsNegativeStockCount ?? 0;

  List<InventoryValuationItem> get filteredItems {
    if (_report == null) return const [];

    final normalizedQuery = _searchQuery.trim().toLowerCase();

    return _report!.items.where((item) {
      // 1. Status Filter
      switch (_filterMode) {
        case ValuationFilterMode.all:
          break;
        case ValuationFilterMode.withStock:
          if (item.stock <= 0) return false;
          break;
        case ValuationFilterMode.lowStock:
          if (!item.isLowStock) return false;
          break;
        case ValuationFilterMode.negativeStock:
          if (!item.isNegativeStock) return false;
          break;
      }

      // 2. Search Query Filter
      if (normalizedQuery.isNotEmpty) {
        final matchesName = item.name.toLowerCase().contains(normalizedQuery);
        final matchesUom = item.consumptionUom.toLowerCase().contains(normalizedQuery);
        if (!matchesName && !matchesUom) return false;
      }

      return true;
    }).toList(growable: false);
  }

  Future<void> loadValuationReport() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumos = await _inventoryRepository.getActiveInsumos();
      _report = _computeValuationReport(insumos);
    } catch (e) {
      _errorMessage = 'Error al cargar reporte de existencias: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  void setFilterMode(ValuationFilterMode mode) {
    _filterMode = mode;
    notifyListeners();
  }

  InventoryValuationReport _computeValuationReport(List<Insumo> insumos) {
    double totalValuation = 0.0;
    int itemsWithStock = 0;
    int itemsLowStock = 0;
    int itemsNegativeStock = 0;

    final items = insumos.map((insumo) {
      final stock = double.parse(insumo.stock.toStringAsFixed(4));
      final avgCost = double.parse(insumo.averageCost.toStringAsFixed(4));
      final lineValuation = double.parse((stock * avgCost).toStringAsFixed(4));

      final isNegative = stock < 0;
      final isLow = insumo.stockMin != null && stock <= insumo.stockMin!;

      if (stock > 0) {
        itemsWithStock++;
        totalValuation += lineValuation;
      }
      if (isNegative) {
        itemsNegativeStock++;
      }
      if (isLow) {
        itemsLowStock++;
      }

      return InventoryValuationItem(
        id: insumo.id,
        name: insumo.name,
        consumptionUom: insumo.consumptionUom,
        warehouseId: insumo.warehouseId,
        isPerishable: insumo.isPerishable,
        stock: stock,
        averageCostNio: avgCost,
        totalValuationNio: lineValuation,
        stockMin: insumo.stockMin,
        stockMax: insumo.stockMax,
        parLevel: insumo.parLevel,
        isLowStock: isLow,
        isNegativeStock: isNegative,
      );
    }).toList(growable: false);

    // Sort alphabetically
    items.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

    return InventoryValuationReport(
      totalValuationNio: double.parse(totalValuation.toStringAsFixed(4)),
      totalItemsCount: items.length,
      itemsWithStockCount: itemsWithStock,
      itemsLowStockCount: itemsLowStock,
      itemsNegativeStockCount: itemsNegativeStock,
      generatedAt: DateTime.now(),
      items: items,
    );
  }
}
