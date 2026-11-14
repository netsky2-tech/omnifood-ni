import 'package:uuid/uuid.dart';
import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/supplier.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';

class SupplierViewModel with ChangeNotifier {
  final InventoryRepository repository;

  List<Supplier> _suppliers = [];
  List<Supplier> get suppliers => _suppliers;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  SupplierViewModel(this.repository);

  Future<void> loadSuppliers() async {
    _isLoading = true;
    notifyListeners();

    _suppliers = await repository.getActiveSuppliers();

    _isLoading = false;
    notifyListeners();
  }

  Future<void> saveSupplier({
    String? id,
    required String name,
    String? phone,
    String? contactPerson,
    String? creditTerms,
  }) async {
    final supplier = Supplier(
      // A UUID: this id travels to a cloud table whose key is `uuid`. A
      // timestamp id reads fine locally and is REFUSED by PostgreSQL the
      // moment an operation references it (a purchase recorded against a
      // locally created supplier failed the sync with a 500 that the
      // terminal retried forever).
      id: id ?? const Uuid().v4(),
      name: name,
      phone: phone,
      contactPerson: contactPerson,
      creditTerms: creditTerms,
    );

    await repository.saveSupplier(supplier);
    await loadSuppliers();
  }
}
