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

/// Cost-basis coverage of the current report window (finding H10).
///
/// Purely derived data: it never changes the COGS aggregation, sorting, or
/// totals math. It exists so the UI can avoid presenting a confident C$ 0.00
/// when the zero comes from missing purchase-cost data instead of a real
/// recorded cost.
enum CogsCostCoverage {
  /// No candidate movements in the period: the existing empty state applies.
  noMovements,

  /// Every candidate movement lacks cost basis.
  zeroBasis,

  /// Some movements lack cost basis.
  partial,

  /// Every movement resolves to a recorded cost.
  complete,
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

  CogsCostCoverage _costCoverage = CogsCostCoverage.noMovements;
  int _missingBasisCount = 0;
  int _totalMovementCount = 0;
  Set<String> _uncostedInsumoIds = const {};

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  CogsDateRangeFilter get dateFilter => _dateFilter;
  DateTime get fromDate => _fromDate;
  DateTime get toDate => _toDate;
  CogsReport? get report => _report;
  CogsCostCoverage get costCoverage => _costCoverage;
  int get missingBasisCount => _missingBasisCount;
  int get totalMovementCount => _totalMovementCount;

  /// Whether the view should render the "Sin costo" warning banner. Copy and
  /// styling mirror the dashboard's ZERO_COST_BASIS coverage treatment — the
  /// same failure must not diverge between surfaces.
  bool get hasCostCoverageWarning =>
      _costCoverage == CogsCostCoverage.zeroBasis ||
      _costCoverage == CogsCostCoverage.partial;

  /// Whether EVERY candidate movement of the insumo in this window lacks cost
  /// basis, meaning its reported C$ 0.00 cost is a data gap, not a real cost.
  /// Such items render "—" (unavailable) instead of a confident 0.00.
  bool isItemCostBasisMissing(String insumoId) =>
      _uncostedInsumoIds.contains(insumoId);

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
      _deriveCostCoverage(insumos, movements);
    } catch (e) {
      _errorMessage = 'Error al cargar reporte de costo de ventas: $e';
      _resetCostCoverage();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// The exact movement filter used by the COGS aggregation (date range +
  /// operational types). Shared with [_deriveCostCoverage] so coverage is
  /// always measured over the same movement set the math consumed.
  static bool _isCogsCandidateMovement(
    InventoryMovement m,
    DateTime from,
    DateTime to,
  ) {
    final isInRange =
        (m.timestamp.isAfter(from) || m.timestamp.isAtSameMomentAs(from)) &&
            (m.timestamp.isBefore(to) || m.timestamp.isAtSameMomentAs(to));
    if (!isInRange) return false;

    return m.type == MovementType.sale ||
        m.type == MovementType.shrinkage ||
        m.type == MovementType.reversal;
  }

  /// A movement LACKS cost basis when the effective cost consumed by the COGS
  /// math (`mov.unitCostNio ?? insumo?.averageCost ?? 0.0`) resolves to 0.0
  /// purely from missing data: no explicit `unitCostNio` AND (no insumo OR a
  /// non-positive `averageCost`). An explicitly recorded `unitCostNio` of
  /// 0.0 is treated as a real recorded cost, not a gap — the failure mode of
  /// finding H10 is ABSENT purchase data (the dashboard's ZERO_COST_BASIS
  /// reason: "todavía no tienen costo de compra registrado"), not a
  /// deliberately recorded zero.
  static bool _movementLacksCostBasis(InventoryMovement mov, Insumo? insumo) {
    return mov.unitCostNio == null &&
        (insumo == null || !(insumo.averageCost > 0));
  }

  /// Derives cost coverage WITHOUT touching any calculation: replays the same
  /// movement filter over the same inputs and classifies basis availability.
  void _deriveCostCoverage(
    List<Insumo> insumos,
    List<InventoryMovement> movements,
  ) {
    final insumoMap = {for (final i in insumos) i.id: i};
    final filtered = movements
        .where((m) => _isCogsCandidateMovement(m, _fromDate, _toDate))
        .toList(growable: false);

    final movementsPerInsumo = <String, int>{};
    final missingPerInsumo = <String, int>{};
    var missingBasis = 0;

    for (final mov in filtered) {
      movementsPerInsumo[mov.insumoId] =
          (movementsPerInsumo[mov.insumoId] ?? 0) + 1;
      if (_movementLacksCostBasis(mov, insumoMap[mov.insumoId])) {
        missingBasis++;
        missingPerInsumo[mov.insumoId] =
            (missingPerInsumo[mov.insumoId] ?? 0) + 1;
      }
    }

    _totalMovementCount = filtered.length;
    _missingBasisCount = missingBasis;
    // An item's cost is unavailable only when EVERY one of its movements in
    // the window lacks basis; otherwise the amount is understated, not zero.
    _uncostedInsumoIds = missingPerInsumo.keys
        .where((id) => missingPerInsumo[id] == movementsPerInsumo[id])
        .toSet();

    _costCoverage = filtered.isEmpty
        ? CogsCostCoverage.noMovements
        : missingBasis == filtered.length
            ? CogsCostCoverage.zeroBasis
            : missingBasis > 0
                ? CogsCostCoverage.partial
                : CogsCostCoverage.complete;
  }

  void _resetCostCoverage() {
    _costCoverage = CogsCostCoverage.noMovements;
    _missingBasisCount = 0;
    _totalMovementCount = 0;
    _uncostedInsumoIds = const {};
  }

  CogsReport _computeCogsReport(
    List<Insumo> insumos,
    List<InventoryMovement> movements,
    DateTime from,
    DateTime to,
  ) {
    final insumoMap = {for (final i in insumos) i.id: i};

    // Filter movements by timestamp range and operational types.
    // Extraction-only refactor: the predicate is shared verbatim with the
    // coverage derivation so the two can never diverge.
    final filteredMovements = movements
        .where((m) => _isCogsCandidateMovement(m, from, to));

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
