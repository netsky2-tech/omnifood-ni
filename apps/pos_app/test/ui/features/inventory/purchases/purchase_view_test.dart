import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/supplier.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/domain/models/inventory/warehouse.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view_model.dart';

class _FakeInventoryRepository implements InventoryRepository {
  @override
  get database => throw UnimplementedError();

  @override
  Future<List<Insumo>> getActiveInsumos() async => const [
        Insumo(
          id: 'i1',
          name: 'Yogurt',
          consumptionUom: 'ml',
          stock: 100,
          averageCost: 2,
          isPerishable: true,
        ),
      ];

  @override
  Future<List<Supplier>> getActiveSuppliers() async => const [
        Supplier(id: 's1', name: 'Proveedor 1'),
      ];

  @override
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async => const [
        UomConversion(id: 'u1', insumoId: 'i1', unitName: 'Caja', factor: 12),
      ];

  @override
  Future<List<Batch>> getBatchesByInsumoId(String insumoId) async => const [];

  @override
  Future<void> queuePurchaseSync(Purchase purchase) async {}

  @override
  Future<void> saveBatch(Batch batch) async {}

  @override
  Future<void> savePurchase(Purchase purchase) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => const [];

  @override
  Future<void> markPurchaseAsSynced(String id) async {}
}

class _FakeMovementEngine implements MovementEngine {
  @override
  Future<List<BatchDeduction>> getBatchesForConsumption(String insumoId, double quantity) async => const [];

  @override
  Future<List<InventoryMovement>> getReversalMovements(String productId, double quantity, String reason) async => const [];

  @override
  Future<List<InventoryMovement>> getSaleMovements(String productId, double quantity) async => const [];

  @override
  Future<void> recordAdjustment(String insumoId, double quantityDelta, String reason) async {}

  @override
  Future<void> recordPurchase(String insumoId, double quantity, double cost, {String? movementId, String? reason}) async {}

  @override
  Future<void> recordReversal(String productId, int quantity, String reason) async {}

  @override
  Future<void> recordSale(String productId, int quantity) async {}

  @override
  Future<void> recordShrinkage(String insumoId, double quantity, String reason) async {}
}

void main() {
  testWidgets('shows batch capture and FX review for perishable USD purchase', (tester) async {
    final viewModel = PurchaseViewModel(_FakeInventoryRepository(), _FakeMovementEngine());

    await tester.pumpWidget(
      ChangeNotifierProvider<PurchaseViewModel>.value(
        value: viewModel,
        child: const MaterialApp(home: PurchaseView()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>).at(0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yogurt').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Caja').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>).at(2));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Proveedor 1').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>).at(3));
    await tester.pumpAndSettle();
    await tester.tap(find.text('USD').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Quantity'), '2');
    await tester.enterText(find.widgetWithText(TextFormField, 'Unit cost'), '10');
    await tester.enterText(find.widgetWithText(TextFormField, 'BCN FX rate'), '36.5');
    await tester.pumpAndSettle();

    expect(find.text('BCN rate source'), findsOneWidget);
    expect(find.text('Lot code'), findsOneWidget);
    expect(find.text('Projected CPP'), findsOneWidget);
  });
}
