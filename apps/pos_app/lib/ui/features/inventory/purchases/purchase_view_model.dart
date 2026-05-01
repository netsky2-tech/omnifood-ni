import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/supplier.dart';
import '../../../../domain/models/inventory/purchase.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/models/inventory/inventory_movement.dart';

class PurchaseViewModel with ChangeNotifier {
  final InventoryRepository repository;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Supplier> _suppliers = [];
  List<Supplier> get suppliers => _suppliers;

  List<UomConversion> _conversions = [];
  List<UomConversion> get conversions => _conversions;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  PurchaseViewModel(this.repository);

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
    // Logic to be implemented...
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
