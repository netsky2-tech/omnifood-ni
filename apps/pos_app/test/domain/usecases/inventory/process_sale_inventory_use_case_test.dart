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

  test('GIVEN a list of invoice items WHEN processed THEN it SHOULD call engine for each item', () async {
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
      InvoiceItem(
        id: '2',
        invoiceId: 'INV-001',
        productId: 'prod-2',
        productName: 'Product 2',
        quantity: 1,
        unitPrice: 5,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 0.75,
        total: 5.75,
      ),
    ];

    // WHEN
    await useCase.execute(items);

    // THEN
    verify(mockEngine.recordSale('prod-1', 2.0)).called(1);
    verify(mockEngine.recordSale('prod-2', 1.0)).called(1);
  });
}
