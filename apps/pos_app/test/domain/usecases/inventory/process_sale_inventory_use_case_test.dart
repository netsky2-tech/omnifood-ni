import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:mockito/annotations.dart';

import 'process_sale_inventory_use_case_test.mocks.dart';

@GenerateMocks([MovementEngine])
void main() {
  late MockMovementEngine mockEngine;
  late ProcessSaleInventoryUseCase useCase;

  setUp(() {
    mockEngine = MockMovementEngine();
    useCase = ProcessSaleInventoryUseCase(mockEngine);
  });

  test('GIVEN a list of invoice items WHEN processed THEN it SHOULD call engine for each item and return movements', () async {
    // GIVEN
    final items = [
      InvoiceItem(
        id: '1',
        invoiceId: 'INV-001',
        productId: 'prod-1',
        productName: 'Product 1',
        quantity: 2,
        unitPrice: 10,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 3,
        total: 23,
      ),
    ];

    when(mockEngine.getSaleMovements('prod-1', 2.0,
            recipeVersionId: argThat(isNull, named: 'recipeVersionId')))
        .thenAnswer((_) async => []);

    // WHEN
    final result = await useCase.execute(items);

    // THEN
    verify(mockEngine.getSaleMovements('prod-1', 2.0,
        recipeVersionId: argThat(isNull, named: 'recipeVersionId'))).called(1);
    expect(result, isEmpty);
  });

  test('GIVEN items with recipeVersionId WHEN processed THEN it SHOULD pass recipeVersionId to engine per line', () async {
    // GIVEN
    final items = [
      InvoiceItem(
        id: '1',
        invoiceId: 'INV-001',
        productId: 'prod-1',
        productName: 'Burger',
        quantity: 2,
        unitPrice: 10,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 3,
        total: 23,
        recipeVersionId: 'rv-historical-1',
      ),
      InvoiceItem(
        id: '2',
        invoiceId: 'INV-001',
        productId: 'prod-2',
        productName: 'Salad',
        quantity: 1,
        unitPrice: 15,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 2.25,
        total: 17.25,
        recipeVersionId: 'rv-historical-2',
      ),
    ];

    when(mockEngine.getSaleMovements('prod-1', 2.0,
            recipeVersionId: 'rv-historical-1'))
        .thenAnswer((_) async => []);
    when(mockEngine.getSaleMovements('prod-2', 1.0,
            recipeVersionId: 'rv-historical-2'))
        .thenAnswer((_) async => []);

    // WHEN
    await useCase.execute(items);

    // THEN — per-line recipeVersionId forwarded, not document-level
    verify(mockEngine.getSaleMovements('prod-1', 2.0,
        recipeVersionId: 'rv-historical-1')).called(1);
    verify(mockEngine.getSaleMovements('prod-2', 1.0,
        recipeVersionId: 'rv-historical-2')).called(1);
  });
}
