import 'package:flutter/foundation.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';

enum StockAlertSeverity {
  negativeStock,
  critical,
  warning,
}

@immutable
class StockAlertItem {
  const StockAlertItem({
    required this.insumoId,
    required this.insumoName,
    required this.consumptionUom,
    required this.stock,
    required this.severity,
    required this.message,
    required this.suggestedReorderQuantity,
    this.warehouseId,
    this.minStock,
    this.parLevel,
    this.isPerishable = false,
  });

  final String insumoId;
  final String insumoName;
  final String consumptionUom;
  final double stock;
  final StockAlertSeverity severity;
  final String message;
  final double suggestedReorderQuantity;
  final String? warehouseId;
  final double? minStock;
  final double? parLevel;
  final bool isPerishable;
}

class StockAlertsViewModel extends ChangeNotifier {
  StockAlertsViewModel(this._repository);

  final InventoryRepository _repository;

  bool _isLoading = false;
  String? _errorMessage;
  List<StockAlertItem> _alerts = <StockAlertItem>[];
  StockAlertSeverity? _severityFilter;
  String _searchQuery = '';

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  List<StockAlertItem> get alerts => _alerts;
  StockAlertSeverity? get severityFilter => _severityFilter;
  String get searchQuery => _searchQuery;

  int get totalAlertsCount => _alerts.length;
  int get criticalCount =>
      _alerts.where((a) => a.severity == StockAlertSeverity.critical).length;
  int get negativeCount =>
      _alerts.where((a) => a.severity == StockAlertSeverity.negativeStock).length;
  int get warningCount =>
      _alerts.where((a) => a.severity == StockAlertSeverity.warning).length;

  List<StockAlertItem> get filteredAlerts {
    return _alerts.where((alert) {
      if (_severityFilter != null && alert.severity != _severityFilter) {
        return false;
      }
      if (_searchQuery.trim().isNotEmpty) {
        final query = _searchQuery.trim().toLowerCase();
        return alert.insumoName.toLowerCase().contains(query) ||
            alert.insumoId.toLowerCase().contains(query);
      }
      return true;
    }).toList(growable: false);
  }

  void setSeverityFilter(StockAlertSeverity? severity) {
    if (_severityFilter == severity) return;
    _severityFilter = severity;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    if (_searchQuery == query) return;
    _searchQuery = query;
    notifyListeners();
  }

  void clearSearch() {
    if (_searchQuery.isEmpty) return;
    _searchQuery = '';
    notifyListeners();
  }

  Future<void> loadStockAlerts() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumos = await _repository.getActiveInsumos();
      final calculatedAlerts = <StockAlertItem>[];

      for (final insumo in insumos) {
        final stock = insumo.stock;
        final minStock = insumo.stockMin;
        final parLevel = insumo.parLevel;

        StockAlertSeverity? severity;
        String message = '';

        if (stock < 0) {
          severity = StockAlertSeverity.negativeStock;
          message =
              'Stock negativo ($stock ${insumo.consumptionUom}). Requiere retrocálculo o conteo físico.';
        } else if (stock == 0) {
          severity = StockAlertSeverity.critical;
          message =
              'Stock agotado (0 ${insumo.consumptionUom}). Reabastecimiento urgente.';
        } else if (minStock != null && stock <= minStock) {
          severity = StockAlertSeverity.warning;
          message =
              'Stock bajo ($stock ${insumo.consumptionUom}), por debajo o igual al mínimo ($minStock).';
        }

        if (severity != null) {
          final targetLevel =
              parLevel ?? (minStock != null ? minStock * 2 : stock + 10);
          final suggestedReorder =
              double.parse((targetLevel - stock).clamp(0.0, double.infinity).toStringAsFixed(4));

          calculatedAlerts.add(
            StockAlertItem(
              insumoId: insumo.id,
              insumoName: insumo.name,
              consumptionUom: insumo.consumptionUom,
              stock: stock,
              minStock: minStock,
              parLevel: parLevel,
              warehouseId: insumo.warehouseId,
              isPerishable: insumo.isPerishable,
              severity: severity,
              message: message,
              suggestedReorderQuantity: suggestedReorder,
            ),
          );
        }
      }

      // Priority sort: negativeStock (0), critical (1), warning (2)
      final severityWeight = <StockAlertSeverity, int>{
        StockAlertSeverity.negativeStock: 0,
        StockAlertSeverity.critical: 1,
        StockAlertSeverity.warning: 2,
      };

      calculatedAlerts.sort(
        (a, b) => severityWeight[a.severity]!.compareTo(severityWeight[b.severity]!),
      );

      _alerts = calculatedAlerts;
    } catch (e) {
      _errorMessage = 'Error al cargar alertas de inventario: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
