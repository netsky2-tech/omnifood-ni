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

    when(mockEngine.getReversalMovements(any, any, any)).thenAnswer((_) async => []);

    // WHEN
    final result = await useCase.execute(items, reason);

    // THEN
    verify(mockEngine.getReversalMovements('prod-1', 2.0, reason)).called(1);
    expect(result, isEmpty);
  });
}
