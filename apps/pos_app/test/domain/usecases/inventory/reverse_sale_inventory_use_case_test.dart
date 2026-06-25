import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:mockito/annotations.dart';

import 'reverse_sale_inventory_use_case_test.mocks.dart';

@GenerateMocks([MovementEngine])
void main() {
  late MockMovementEngine mockEngine;
  late ReverseSaleInventoryUseCase useCase;

  setUp(() {
    mockEngine = MockMovementEngine();
    useCase = ReverseSaleInventoryUseCase(mockEngine);
  });

  test('GIVEN a list of invoice items WHEN reversed THEN it SHOULD call engine for each item and return movements', () async {
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
    const reason = 'Customer returned items';

    when(mockEngine.getReversalMovements('prod-1', 2.0, reason,
            recipeVersionId: argThat(isNull, named: 'recipeVersionId')))
        .thenAnswer((_) async => []);

    // WHEN
    final result = await useCase.execute(items, reason);

    // THEN
    verify(mockEngine.getReversalMovements('prod-1', 2.0, reason,
        recipeVersionId: argThat(isNull, named: 'recipeVersionId'))).called(1);
    expect(result, isEmpty);
  });

  test('GIVEN items with recipeVersionId WHEN reversed THEN it SHOULD pass recipeVersionId to engine per line', () async {
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
    ];
    const reason = 'Cancellation';

    when(mockEngine.getReversalMovements('prod-1', 2.0, reason,
            recipeVersionId: 'rv-historical-1'))
        .thenAnswer((_) async => []);

    // WHEN
    await useCase.execute(items, reason);

    // THEN
    verify(mockEngine.getReversalMovements('prod-1', 2.0, reason,
        recipeVersionId: 'rv-historical-1')).called(1);
  });
}
