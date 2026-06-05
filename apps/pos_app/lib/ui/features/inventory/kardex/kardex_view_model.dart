import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
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
    required this.sourceDocumentLabel,
    required this.relatedAlertCount,
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
  final String sourceDocumentLabel;
  final int relatedAlertCount;
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
      final purchases = await _repository.getPurchaseHistory();
      final purchaseById = <String, Purchase>{
        for (final purchase in purchases) purchase.id: purchase,
      };
      final alerts = await _repository.getForensicAlerts();
      final alertCountByMovementId = _buildAlertCountByMovement(alerts);

      final nextEntries = movements
          .map(
            (movement) => _toEntry(
              movement,
              insumoNames,
              purchaseById,
              alertCountByMovementId,
            ),
          )
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
    Map<String, Purchase> purchaseById,
    Map<String, int> alertCountByMovementId,
  ) {
    final numberFormat = NumberFormat('0.00');
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');
    final purchase = purchaseById[movement.id];
    final unitCostLabel = purchase == null
        ? valuationUnavailableLabel
        : numberFormat.format(purchase.unitCostNio ?? purchase.unitCost);
    final totalValueLabel = purchase == null
        ? valuationUnavailableLabel
        : numberFormat.format(
            (purchase.unitCostNio ?? purchase.unitCost) * purchase.quantity,
          );
    final sourceDocumentLabel = _resolveSourceDocumentLabel(movement, purchase);

    return KardexEntryViewData(
      id: movement.id,
      referenceLabel: insumoNames[movement.insumoId] ?? movement.insumoId,
      typeLabel: switch (movement.type) {
        MovementType.purchase => 'Compra',
        MovementType.production => 'Producción',
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
      unitCostLabel: unitCostLabel,
      totalValueLabel: totalValueLabel,
      reasonLabel: movement.reason?.trim().isNotEmpty == true
          ? movement.reason!.trim()
          : 'Sin detalle operativo',
      sourceDocumentLabel: sourceDocumentLabel,
      relatedAlertCount: alertCountByMovementId[movement.id] ?? 0,
    );
  }

  Map<String, int> _buildAlertCountByMovement(List<ForensicAlert> alerts) {
    final counts = <String, int>{};
    for (final alert in alerts) {
      final movementId = alert.sourceMovementId ?? alert.metadata?['sourceMovementId']?.toString();
      if (movementId == null || movementId.isEmpty) {
        continue;
      }
      counts[movementId] = (counts[movementId] ?? 0) + 1;
    }
    return counts;
  }

  String _resolveSourceDocumentLabel(
    InventoryMovement movement,
    Purchase? purchase,
  ) {
    if (purchase != null) {
      return 'PURCHASE · ${purchase.id}';
    }
    if (movement.reason?.startsWith('COUNT_SESSION:') ?? false) {
      return 'COUNT_SESSION · ${movement.reason!.split('|').first.replaceFirst('COUNT_SESSION:', '')}';
    }
    if (movement.reason?.startsWith('PRODUCTION_') ?? false) {
      final suffix = movement.reason!.split(':').last;
      return 'PRODUCTION · $suffix';
    }
    return 'Sin documento ligado';
  }
}
