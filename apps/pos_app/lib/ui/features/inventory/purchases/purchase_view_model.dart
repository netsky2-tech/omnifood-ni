import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/supplier.dart';
import '../../../../domain/models/inventory/purchase.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/models/inventory/inventory_movement.dart';
import '../../../../domain/services/inventory/movement_engine.dart';

class PurchaseViewModel with ChangeNotifier {
  final InventoryRepository repository;
  final MovementEngine movementEngine;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Supplier> _suppliers = [];
  List<Supplier> get suppliers => _suppliers;

  List<UomConversion> _conversions = [];
  List<UomConversion> get conversions => _conversions;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  PurchaseViewModel(this.repository, this.movementEngine);

  Future<void> loadInitialData({String? insumoId}) async {
    _isLoading = true;
    notifyListeners();

    _insumos = await repository.getActiveInsumos();
    _suppliers = await repository.getActiveSuppliers();
    if (insumoId != null) {
      _conversions = await repository.getConversionsByInsumoId(insumoId);
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> recordPurchase({
    required String insumoId,
    required String supplierId,
    required String uomConversionId,
    required double quantity,
    required double unitCost,
  }) async {
    _errorMessage = null;
    _isLoading = true;
    notifyListeners();

    try {
      // 1. Get the UOM conversion
      final conversion = _conversions.firstWhere(
        (c) => c.id == uomConversionId,
        orElse: () => throw ArgumentError('Invalid conversion ID: $uomConversionId'),
      );

      // 2. Convert quantity to base unit (e.g., sacks -> grams)
      final quantityInBaseUnit = quantity * conversion.factor;

      // 3. Delegate to MovementEngine (calculates stock, WAC, creates movement)
      await movementEngine.recordPurchase(insumoId, quantityInBaseUnit, unitCost);

      // 4. Create and persist Purchase locally
      final purchase = Purchase(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        insumoId: insumoId,
        supplierId: supplierId,
        quantity: quantityInBaseUnit,
        unitCost: unitCost,
        timestamp: DateTime.now(),
      );
      await repository.savePurchase(purchase);

      // 5. Queue for sync with backend (offline-first)
      await repository.queuePurchaseSync(purchase);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }
}

extension PurchaseX on Purchase {
  InventoryMovement toMovement() {
    return InventoryMovement(
      id: id,
      insumoId: insumoId,
      type: MovementType.purchase,
      quantity: quantity,
      previousStock: 0, // Should be fetched from repo
      newStock: quantity, // Should be calculated
      timestamp: timestamp,
      reason: 'Purchase from $supplierId',
    );
  }
}
