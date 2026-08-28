import 'package:flutter/foundation.dart';
import '../../../../../domain/models/inventory/cogs_report.dart';
import '../../../../../domain/models/inventory/insumo.dart';
import '../../../../../domain/models/inventory/inventory_movement.dart';
import '../../../../../domain/repositories/inventory/inventory_repository.dart';

enum CogsDateRangeFilter {
  today,
  last7Days,
  thisMonth,
  custom,
}

class CogsReportViewModel extends ChangeNotifier {
  CogsReportViewModel(this._inventoryRepository);

  final InventoryRepository _inventoryRepository;

  bool _isLoading = false;
  String? _errorMessage;
  String _searchQuery = '';
  CogsDateRangeFilter _dateFilter = CogsDateRangeFilter.today;
  DateTime _fromDate = DateTime(
    DateTime.now().year,
    DateTime.now().month,
    DateTime.now().day,
  );
  DateTime _toDate = DateTime(
    DateTime.now().year,
    DateTime.now().month,
    DateTime.now().day,
    23,
    59,
    59,
    999,
  );

  CogsReport? _report;

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  CogsDateRangeFilter get dateFilter => _dateFilter;
  DateTime get fromDate => _fromDate;
  DateTime get toDate => _toDate;
  CogsReport? get report => _report;

  double get totalCogsNio => _report?.totalCogsNio ?? 0.0;
  double get salesCogsNio => _report?.salesCogsNio ?? 0.0;
  double get shrinkageCogsNio => _report?.shrinkageCogsNio ?? 0.0;

  List<CogsReportItem> get filteredItems {
    if (_report == null) return const [];

    final normalizedQuery = _searchQuery.trim().toLowerCase();
    if (normalizedQuery.isEmpty) return _report!.items;

    return _report!.items.where((item) {
      return item.insumoName.toLowerCase().contains(normalizedQuery) ||
          item.consumptionUom.toLowerCase().contains(normalizedQuery);
    }).toList(growable: false);
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  void setDateFilter(CogsDateRangeFilter filter) {
    _dateFilter = filter;
    final now = DateTime.now();

    switch (filter) {
      case CogsDateRangeFilter.today:
        _fromDate = DateTime(now.year, now.month, now.day);
        _toDate = DateTime(now.year, now.month, now.day, 23, 59, 59, 999);
        break;
      case CogsDateRangeFilter.last7Days:
        _fromDate = DateTime(now.year, now.month, now.day - 6);
        _toDate = DateTime(now.year, now.month, now.day, 23, 59, 59, 999);
        break;
      case CogsDateRangeFilter.thisMonth:
        _fromDate = DateTime(now.year, now.month, 1);
        _toDate = DateTime(now.year, now.month + 1, 0, 23, 59, 59, 999);
        break;
      case CogsDateRangeFilter.custom:
        // Keep current custom bounds
        break;
    }

    loadCogsReport();
  }

  void setCustomDateRange(DateTime from, DateTime to) {
    _dateFilter = CogsDateRangeFilter.custom;
    _fromDate = DateTime(from.year, from.month, from.day);
    _toDate = DateTime(to.year, to.month, to.day, 23, 59, 59, 999);
    loadCogsReport();
  }

  Future<void> loadCogsReport() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final insumos = await _inventoryRepository.getActiveInsumos();
      final movements = await _inventoryRepository.getAllMovements();
      _report = _computeCogsReport(insumos, movements, _fromDate, _toDate);
    } catch (e) {
      _errorMessage = 'Error al cargar reporte de costo de ventas: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  CogsReport _computeCogsReport(
    List<Insumo> insumos,
    List<InventoryMovement> movements,
    DateTime from,
    DateTime to,
  ) {
    final insumoMap = {for (final i in insumos) i.id: i};

    // Filter movements by timestamp range and operational types
    final filteredMovements = movements.where((m) {
      final isInRange = (m.timestamp.isAfter(from) || m.timestamp.isAtSameMomentAs(from)) &&
          (m.timestamp.isBefore(to) || m.timestamp.isAtSameMomentAs(to));
      if (!isInRange) return false;

      return m.type == MovementType.sale ||
          m.type == MovementType.shrinkage ||
          m.type == MovementType.reversal;
    });

    double totalCogs = 0.0;
    double salesCogs = 0.0;
    double shrinkageCogs = 0.0;

    final aggregates = <String, _InsumoCogsAccumulator>{};

    for (final mov in filteredMovements) {
      final insumo = insumoMap[mov.insumoId];
      final unitCost = mov.unitCostNio ?? insumo?.averageCost ?? 0.0;
      final qty = mov.quantity.abs();
      final lineCost = double.parse((qty * unitCost).toStringAsFixed(4));

      final acc = aggregates.putIfAbsent(
        mov.insumoId,
        () => _InsumoCogsAccumulator(),
      );

      if (mov.type == MovementType.sale) {
        acc.salesQty += qty;
        acc.salesCost += lineCost;
        salesCogs += lineCost;
        totalCogs += lineCost;
      } else if (mov.type == MovementType.reversal) {
        acc.salesQty -= qty;
        acc.salesCost -= lineCost;
        salesCogs -= lineCost;
        totalCogs -= lineCost;
      } else if (mov.type == MovementType.shrinkage) {
        acc.shrinkageQty += qty;
        acc.shrinkageCost += lineCost;
        shrinkageCogs += lineCost;
        totalCogs += lineCost;
      }
    }

    final totalCogsFixed = double.parse((totalCogs < 0 ? 0.0 : totalCogs).toStringAsFixed(4));
    final salesCogsFixed = double.parse((salesCogs < 0 ? 0.0 : salesCogs).toStringAsFixed(4));
    final shrinkageCogsFixed = double.parse((shrinkageCogs < 0 ? 0.0 : shrinkageCogs).toStringAsFixed(4));

    final items = aggregates.entries.map((entry) {
      final insumo = insumoMap[entry.key];
      final acc = entry.value;
      final totalQty = double.parse((acc.salesQty + acc.shrinkageQty).toStringAsFixed(4));
      final totalCost = double.parse((acc.salesCost + acc.shrinkageCost).toStringAsFixed(4));
      final costPct = totalCogsFixed > 0
          ? double.parse(((totalCost / totalCogsFixed) * 100).toStringAsFixed(2))
          : 0.0;

      return CogsReportItem(
        insumoId: entry.key,
        insumoName: insumo?.name ?? entry.key,
        consumptionUom: insumo?.consumptionUom ?? 'unit',
        salesQuantity: double.parse(acc.salesQty.toStringAsFixed(4)),
        salesCostNio: double.parse(acc.salesCost.toStringAsFixed(4)),
        shrinkageQuantity: double.parse(acc.shrinkageQty.toStringAsFixed(4)),
        shrinkageCostNio: double.parse(acc.shrinkageCost.toStringAsFixed(4)),
        totalQuantity: totalQty,
        totalCostNio: totalCost,
        costPercentage: costPct,
      );
    }).toList(growable: false);

    // Sort descending by total cost
    items.sort((a, b) => b.totalCostNio.compareTo(a.totalCostNio));

    return CogsReport(
      fromDate: from,
      toDate: to,
      totalCogsNio: totalCogsFixed,
      salesCogsNio: salesCogsFixed,
      shrinkageCogsNio: shrinkageCogsFixed,
      generatedAt: DateTime.now(),
      items: items,
    );
  }
}

class _InsumoCogsAccumulator {
  double salesQty = 0.0;
  double salesCost = 0.0;
  double shrinkageQty = 0.0;
  double shrinkageCost = 0.0;
}
