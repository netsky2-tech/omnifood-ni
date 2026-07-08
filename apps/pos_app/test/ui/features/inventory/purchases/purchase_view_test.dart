import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/supplier.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view_model.dart';

class _FakeInventoryRepository implements InventoryRepository {
  _FakeInventoryRepository({this.officialBcnRate, this.officialBcnRateError});

  final double? officialBcnRate;
  final Exception? officialBcnRateError;

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
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId) async =>
      const [
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
  Future<List<Purchase>> getPurchaseHistory() async => const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => const [];

  @override
  Future<void> markPurchaseAsSynced(String id) async {}

  @override
  Future<double> fetchOfficialBcnRateByInvoiceDate(DateTime invoiceDate) async {
    if (officialBcnRateError != null) {
      throw officialBcnRateError!;
    }
    return officialBcnRate ?? 36.7123;
  }
}

class _FakeMovementEngine implements MovementEngine {
  int recordPurchaseCalls = 0;

  @override
  Future<List<BatchDeduction>> getBatchesForConsumption(
    String insumoId,
    double quantity,
  ) async => const [];

  @override
  Future<List<InventoryMovement>> getReversalMovements(
    String productId,
    double quantity,
    String reason, {
    String? recipeVersionId,
  }) async => const [];

  @override
  Future<List<InventoryMovement>> getSaleMovements(
    String productId,
    double quantity, {
    String? recipeVersionId,
  }) async => const [];

  @override
  Future<void> recordAdjustment(
    String insumoId,
    double quantityDelta,
    String reason, {
    String? movementId,
  }) async {}

  @override
  Future<void> recordPurchase(
    String insumoId,
    double quantity,
    double cost, {
    String? movementId,
    String? reason,
  }) async {
    recordPurchaseCalls += 1;
  }

  @override
  Future<void> recordReversal(
    String productId,
    int quantity,
    String reason,
  ) async {}

  @override
  Future<void> recordSale(String productId, int quantity) async {}

  @override
  Future<void> recordShrinkage(
    String insumoId,
    double quantity,
    String reason,
  ) async {}

  @override
  Future<List<InventoryMovement>> recordProduction({
    required String recipeProductId,
    required String producedInsumoId,
    required double quantity,
    required String reason,
  }) async => const [];
}

Future<void> _pumpPurchaseView(
  WidgetTester tester,
  PurchaseViewModel viewModel,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<PurchaseViewModel>.value(
      value: viewModel,
      child: const MaterialApp(home: PurchaseView()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _selectDropdownValue(
  WidgetTester tester, {
  required int index,
  required String value,
}) async {
  final dropdown = find.byType(DropdownButtonFormField<String>).at(index);

  await tester.ensureVisible(dropdown);
  await tester.pumpAndSettle();
  expect(dropdown, findsOneWidget);

  await tester.tap(dropdown);
  await tester.pumpAndSettle();

  final menuItem = find.text(value).last;
  expect(menuItem, findsOneWidget);

  await tester.tap(menuItem);
  await tester.pumpAndSettle();
}

Future<void> _configurePurchaseHeader(WidgetTester tester) async {
  await _selectDropdownValue(tester, index: 0, value: 'Yogurt');
  await _selectDropdownValue(tester, index: 1, value: 'Caja');
  await _selectDropdownValue(tester, index: 2, value: 'Proveedor 1');
}

Future<void> _switchCurrency(WidgetTester tester, String currency) {
  return _selectDropdownValue(tester, index: 3, value: currency);
}

Future<void> _lookupOfficialBcnRate(WidgetTester tester) async {
  final lookupButton = find.widgetWithText(
    OutlinedButton,
    'Usar tasa oficial BCN',
  );

  await tester.scrollUntilVisible(
    lookupButton,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(lookupButton);
  await tester.pumpAndSettle();
}

TextFormField _bcnRateField(WidgetTester tester) {
  return tester.widget<TextFormField>(
    find.widgetWithText(TextFormField, 'Tasa de cambio BCN'),
  );
}

Future<void> _fillRequiredPurchaseInputs(
  WidgetTester tester, {
  String invoiceNumber = 'INV-1001',
  String quantity = '2',
  String unitCost = '10',
}) async {
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Número de factura'),
    invoiceNumber,
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Cantidad'),
    quantity,
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Costo unitario'),
    unitCost,
  );
  await tester.pumpAndSettle();
}

Future<void> _prepareUsdPurchaseWithOfficialLookup(WidgetTester tester) async {
  await _configurePurchaseHeader(tester);
  await _switchCurrency(tester, 'USD');
  await _lookupOfficialBcnRate(tester);
  await _fillRequiredPurchaseInputs(tester);
}

Future<void> _changeInvoiceDate(WidgetTester tester) async {
  final now = DateTime.now();
  final currentDay = now.day;
  final replacementDay = currentDay < 28 ? currentDay + 1 : currentDay - 1;

  await tester.tap(find.text(_formatDate(now)).first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('$replacementDay').last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}

Future<void> _tapRegisterPurchaseButton(WidgetTester tester) async {
  final registerButton = find.widgetWithText(
    ElevatedButton,
    'REGISTRAR COMPRA',
  );

  await tester.scrollUntilVisible(
    registerButton,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(registerButton);
  await tester.pumpAndSettle();
}

String _formatDate(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}

void main() {
  testWidgets('shows batch capture and FX review for perishable USD purchase', (
    tester,
  ) async {
    final viewModel = PurchaseViewModel(
      _FakeInventoryRepository(officialBcnRate: 36.7123),
      _FakeMovementEngine(),
    );

    await _pumpPurchaseView(tester, viewModel);
    await _prepareUsdPurchaseWithOfficialLookup(tester);

    expect(_bcnRateField(tester).controller?.text, '36.7123');

    expect(find.text('Origen tasa BCN'), findsOneWidget);
    expect(
      find.text('Tasa oficial BCN cargada para la fecha de factura.'),
      findsOneWidget,
    );
    expect(find.text('Tasa oficial BCN consultada'), findsOneWidget);
    expect(find.text('Código de lote'), findsOneWidget);
    expect(find.text('CPP proyectado'), findsOneWidget);
  });

  testWidgets(
    'resets the visible official source when the cashier edits the BCN rate',
    (tester) async {
      final viewModel = PurchaseViewModel(
        _FakeInventoryRepository(officialBcnRate: 36.7123),
        _FakeMovementEngine(),
      );

      await _pumpPurchaseView(tester, viewModel);
      await _prepareUsdPurchaseWithOfficialLookup(tester);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Tasa de cambio BCN'),
        '36.9000',
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Tasa oficial BCN cargada para la fecha de factura.'),
        findsNothing,
      );
      expect(find.text('Tasa oficial BCN consultada'), findsNothing);
      expect(
        find.text(
          'Se ingresó una tasa BCN manual. La fuente de la tasa ahora es manual.',
        ),
        findsOneWidget,
      );
      expect(find.text('Tasa ingresada manualmente'), findsOneWidget);
    },
  );

  testWidgets(
    'keeps a fresh manual BCN value when the invoice date changes after a manual override',
    (tester) async {
      final viewModel = PurchaseViewModel(
        _FakeInventoryRepository(officialBcnRate: 36.7123),
        _FakeMovementEngine(),
      );

      await _pumpPurchaseView(tester, viewModel);
      await _prepareUsdPurchaseWithOfficialLookup(tester);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Tasa de cambio BCN'),
        '36.9000',
      );
      await tester.pumpAndSettle();

      await _changeInvoiceDate(tester);

      expect(_bcnRateField(tester).controller?.text, '36.9000');
      expect(
        find.text(
          'La fecha de factura cambió. Volvé a consultar la tasa oficial o conservá una tasa manual.',
        ),
        findsNothing,
      );
      expect(find.text('Tasa ingresada manualmente'), findsOneWidget);
    },
  );

  testWidgets(
    'keeps a fresh manual BCN value when the cashier changes currency away from USD and back',
    (tester) async {
      final viewModel = PurchaseViewModel(
        _FakeInventoryRepository(officialBcnRate: 36.7123),
        _FakeMovementEngine(),
      );

      await _pumpPurchaseView(tester, viewModel);
      await _prepareUsdPurchaseWithOfficialLookup(tester);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Tasa de cambio BCN'),
        '36.9000',
      );
      await tester.pumpAndSettle();

      await _switchCurrency(tester, 'NIO');

      expect(find.text('Tasa del documento NIO'), findsOneWidget);

      await _switchCurrency(tester, 'USD');

      expect(_bcnRateField(tester).controller?.text, '36.9000');
      expect(
        find.text('Tasa oficial BCN cargada para la fecha de factura.'),
        findsNothing,
      );
      expect(find.text('Tasa oficial BCN consultada'), findsNothing);
      expect(find.text('Tasa ingresada manualmente'), findsOneWidget);
    },
  );

  testWidgets(
    'clears stale official BCN value and blocks submission after the invoice date changes',
    (tester) async {
      final engine = _FakeMovementEngine();
      final viewModel = PurchaseViewModel(
        _FakeInventoryRepository(officialBcnRate: 36.7123),
        engine,
      );

      await _pumpPurchaseView(tester, viewModel);
      await _prepareUsdPurchaseWithOfficialLookup(tester);
      await _changeInvoiceDate(tester);

      expect(_bcnRateField(tester).controller?.text, isEmpty);
      expect(
        find.text('Tasa oficial BCN cargada para la fecha de factura.'),
        findsNothing,
      );
      expect(find.text('Tasa oficial BCN consultada'), findsNothing);
      expect(
        find.text(
          'La fecha de factura cambió. Volvé a consultar la tasa oficial o conservá una tasa manual.',
        ),
        findsOneWidget,
      );

      await _tapRegisterPurchaseButton(tester);

      expect(find.text('Ingresá una tasa BCN válida'), findsOneWidget);
      expect(find.text('Confirmar registro'), findsNothing);
      expect(engine.recordPurchaseCalls, 0);
    },
  );

  testWidgets(
    'clears stale official BCN value when the cashier changes currency after an official lookup',
    (tester) async {
      final viewModel = PurchaseViewModel(
        _FakeInventoryRepository(officialBcnRate: 36.7123),
        _FakeMovementEngine(),
      );

      await _pumpPurchaseView(tester, viewModel);
      await _prepareUsdPurchaseWithOfficialLookup(tester);

      await _switchCurrency(tester, 'NIO');

      expect(
        find.text('Tasa oficial BCN cargada para la fecha de factura.'),
        findsNothing,
      );
      expect(find.text('Tasa oficial BCN consultada'), findsNothing);
      expect(find.text('Tasa del documento NIO'), findsOneWidget);

      await _switchCurrency(tester, 'USD');

      expect(_bcnRateField(tester).controller?.text, isEmpty);
      expect(
        find.text('Tasa oficial BCN cargada para la fecha de factura.'),
        findsNothing,
      );
      expect(find.text('Tasa oficial BCN consultada'), findsNothing);
      expect(find.text('Tasa ingresada manualmente'), findsNothing);
    },
  );

  testWidgets('keeps manual BCN entry available when official lookup fails', (
    tester,
  ) async {
    final viewModel = PurchaseViewModel(
      _FakeInventoryRepository(
        officialBcnRateError: const OfficialBcnRateLookupException(
          'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.',
        ),
      ),
      _FakeMovementEngine(),
    );

    await _pumpPurchaseView(tester, viewModel);
    await _configurePurchaseHeader(tester);
    await _switchCurrency(tester, 'USD');
    await _lookupOfficialBcnRate(tester);

    expect(
      find.text(
        'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.',
      ),
      findsOneWidget,
    );

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Número de factura'),
      'INV-2002',
    );
    await tester.enterText(find.widgetWithText(TextFormField, 'Cantidad'), '2');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Costo unitario'),
      '10',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Tasa de cambio BCN'),
      '36.5',
    );
    await tester.pumpAndSettle();

    expect(find.text('Tasa ingresada manualmente'), findsOneWidget);
    expect(find.text('36.5000'), findsOneWidget);
  });

  testWidgets(
    'blocks submission and surfaces validation when invoice number is missing',
    (tester) async {
      final engine = _FakeMovementEngine();
      final viewModel = PurchaseViewModel(_FakeInventoryRepository(), engine);

      await _pumpPurchaseView(tester, viewModel);
      await _configurePurchaseHeader(tester);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Cantidad'),
        '2',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Costo unitario'),
        '10',
      );
      await tester.pumpAndSettle();

      await _tapRegisterPurchaseButton(tester);

      expect(find.text('Ingresá el número de factura'), findsOneWidget);
      expect(find.text('Confirmar registro'), findsNothing);
      expect(engine.recordPurchaseCalls, 0);
    },
  );

  testWidgets(
    'blocks USD submission and surfaces validation when BCN rate is missing',
    (tester) async {
      final engine = _FakeMovementEngine();
      final viewModel = PurchaseViewModel(_FakeInventoryRepository(), engine);

      await _pumpPurchaseView(tester, viewModel);
      await _configurePurchaseHeader(tester);
      await _switchCurrency(tester, 'USD');

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Número de factura'),
        'INV-1001',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Cantidad'),
        '2',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Costo unitario'),
        '10',
      );
      await tester.pumpAndSettle();

      await _tapRegisterPurchaseButton(tester);

      expect(find.text('Ingresá una tasa BCN válida'), findsOneWidget);
      expect(find.text('Confirmar registro'), findsNothing);
      expect(engine.recordPurchaseCalls, 0);
    },
  );
}
