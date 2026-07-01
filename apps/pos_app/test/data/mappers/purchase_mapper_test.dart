import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/purchase_mapper.dart';

void main() {
  test('rejects USD responses that omit the explicit BCN rate', () {
    expect(
      () => PurchaseMapper.fromResponse({
        'id': 'purchase-1',
        'insumoId': 'ins-1',
        'supplierId': 'sup-1',
        'invoiceNumber': 'INV-1001',
        'quantity': 2,
        'unitCost': 10,
        'timestamp': '2026-01-10T08:00:00.000Z',
        'invoiceDate': '2026-01-10',
        'currency': 'USD',
      }),
      throwsStateError,
    );
  });

  test('keeps NIO responses on the document-native 1.0 BCN rate', () {
    final purchase = PurchaseMapper.fromResponse({
      'id': 'purchase-2',
      'insumoId': 'ins-1',
      'supplierId': 'sup-1',
      'invoiceNumber': 'INV-1002',
      'quantity': 2,
      'unitCost': 10,
      'timestamp': '2026-01-10T08:00:00.000Z',
      'invoiceDate': '2026-01-10',
      'currency': 'NIO',
    });

    expect(purchase.currency, 'NIO');
    expect(purchase.bcnRate, 1);
  });
}
