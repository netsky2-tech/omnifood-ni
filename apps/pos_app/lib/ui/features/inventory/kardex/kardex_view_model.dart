import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';

enum KardexTypeFilter { all, purchase, sale, shrinkage, adjustment, reversal }

@immutable
class KardexEntryViewData {
  const KardexEntryViewData({
    required this.id,
    required this.referenceLabel,
    required this.typeLabel,
    required this.type,
    required this.timestamp,
    required this.dateLabel,
    required this.quantityLabel,
    required this.stockAfterLabel,
    required this.stockBeforeLabel,
    required this.unitCostLabel,
    required this.totalValueLabel,
    required this.reasonLabel,
  });

  final String id;
  final String referenceLabel;
  final String typeLabel;
  final MovementType type;
  final DateTime timestamp;
  final String dateLabel;
  final String quantityLabel;
  final String stockAfterLabel;
  final String stockBeforeLabel;
  final String unitCostLabel;
  final String totalValueLabel;
  final String reasonLabel;
}

class KardexViewModel extends ChangeNotifier {
  KardexViewModel(this._repository);

  static const String valuationUnavailableLabel = 'N/D';

  final InventoryRepository _repository;
  final List<KardexEntryViewData> _entries = <KardexEntryViewData>[];
  bool _isLoading = false;
  String _searchQuery = '';
  KardexTypeFilter _typeFilter = KardexTypeFilter.all;
  String? _errorMessage;

  UnmodifiableListView<KardexEntryViewData> get entries =>
      UnmodifiableListView<KardexEntryViewData>(_entries);

  List<KardexEntryViewData> get visibleEntries {
    final normalizedQuery = _searchQuery.trim().toLowerCase();

    return _entries.where((entry) {
      final typeMatches = switch (_typeFilter) {
        KardexTypeFilter.all => true,
        KardexTypeFilter.purchase => entry.type == MovementType.purchase,
        KardexTypeFilter.sale => entry.type == MovementType.sale,
        KardexTypeFilter.shrinkage => entry.type == MovementType.shrinkage,
        KardexTypeFilter.adjustment => entry.type == MovementType.adjustment,
        KardexTypeFilter.reversal => entry.type == MovementType.reversal,
      };

      if (!typeMatches) {
        return false;
      }

      if (normalizedQuery.isEmpty) {
        return true;
      }

      return entry.referenceLabel.toLowerCase().contains(normalizedQuery) ||
          entry.typeLabel.toLowerCase().contains(normalizedQuery) ||
          entry.reasonLabel.toLowerCase().contains(normalizedQuery) ||
          entry.id.toLowerCase().contains(normalizedQuery);
    }).toList(growable: false);
  }

  bool get isLoading => _isLoading;
  String get searchQuery => _searchQuery;
  KardexTypeFilter get typeFilter => _typeFilter;
  String? get errorMessage => _errorMessage;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final movements = await _repository.getAllMovements();
      final insumoIds = movements
          .map((movement) => movement.insumoId)
          .where((id) => id.trim().isNotEmpty)
          .toSet()
          .toList(growable: false);
      final insumos = insumoIds.isEmpty
          ? const <Insumo>[]
          : await _repository.getInsumosByIds(insumoIds);

      final insumoNames = <String, String>{
        for (final insumo in insumos) insumo.id: insumo.name,
      };

      final nextEntries = movements
          .map((movement) => _toEntry(movement, insumoNames))
          .toList(growable: false)
        ..sort((left, right) => right.timestamp.compareTo(left.timestamp));

      _entries
        ..clear()
        ..addAll(nextEntries);
    } catch (error) {
      _errorMessage = 'No se pudo cargar el historial Kardex local: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setSearchQuery(String nextQuery) {
    if (_searchQuery == nextQuery) {
      return;
    }

    _searchQuery = nextQuery;
    notifyListeners();
  }

  void clearSearch() {
    if (_searchQuery.isEmpty) {
      return;
    }

    _searchQuery = '';
    notifyListeners();
  }

  void setTypeFilter(KardexTypeFilter nextFilter) {
    if (_typeFilter == nextFilter) {
      return;
    }

    _typeFilter = nextFilter;
    notifyListeners();
  }

  String chipLabelFor(KardexTypeFilter filter) {
    return switch (filter) {
      KardexTypeFilter.all => 'Todos',
      KardexTypeFilter.purchase => 'Compra',
      KardexTypeFilter.sale => 'Venta',
      KardexTypeFilter.shrinkage => 'Merma',
      KardexTypeFilter.adjustment => 'Ajuste',
      KardexTypeFilter.reversal => 'Reverso',
    };
  }

  KardexEntryViewData _toEntry(
    InventoryMovement movement,
    Map<String, String> insumoNames,
  ) {
    final numberFormat = NumberFormat('0.00');
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    return KardexEntryViewData(
      id: movement.id,
      referenceLabel: insumoNames[movement.insumoId] ?? movement.insumoId,
      typeLabel: switch (movement.type) {
        MovementType.purchase => 'Compra',
        MovementType.sale => 'Venta',
        MovementType.shrinkage => 'Merma',
        MovementType.adjustment => 'Ajuste',
        MovementType.reversal => 'Reverso',
      },
      type: movement.type,
      timestamp: movement.timestamp,
      dateLabel: dateFormat.format(movement.timestamp.toLocal()),
      quantityLabel: numberFormat.format(movement.quantity),
      stockAfterLabel: numberFormat.format(movement.newStock),
      stockBeforeLabel: numberFormat.format(movement.previousStock),
      unitCostLabel: valuationUnavailableLabel,
      totalValueLabel: valuationUnavailableLabel,
      reasonLabel: movement.reason?.trim().isNotEmpty == true
          ? movement.reason!.trim()
          : 'Sin detalle operativo',
    );
  }
}
