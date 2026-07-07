import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/purchase_mapper.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';

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

  test(
    'keeps NIO responses on the document-native 1.0 BCN rate without inventing FX provenance',
    () {
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
      expect(purchase.fxRateMode, isNull);
    },
  );

  test(
    'does not invent explicit fxRateMode when Purchase.fromJson omits it',
    () {
      final purchase = Purchase.fromJson({
        'id': 'purchase-json-1',
        'insumoId': 'ins-1',
        'supplierId': 'sup-1',
        'invoiceNumber': 'INV-JSON-1',
        'quantity': 2,
        'unitCost': 10,
        'timestamp': '2026-01-10T08:00:00.000Z',
        'invoiceDate': '2026-01-10T00:00:00.000',
        'currency': 'USD',
        'bcnRate': 36.5,
      });

      expect(purchase.fxRateMode, isNull);
    },
  );

  test('roundtrips fxRateMode through entity and sync mapping', () {
    final purchase = Purchase(
      id: 'purchase-3',
      insumoId: 'ins-1',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-1003',
      quantity: 2,
      unitCost: 10,
      timestamp: DateTime.parse('2026-01-10T08:00:00.000Z'),
      invoiceDate: DateTime(2026, 1, 10),
      currency: 'USD',
      bcnRate: 36.7123,
      fxRateMode: purchaseFxRateModeOfficial,
    );

    final entity = PurchaseMapper.toEntity(purchase);
    final roundtrip = PurchaseMapper.toDomain(entity);
    final syncJson = PurchaseMapper.toSyncJson(purchase);

    expect(entity.fxRateMode, purchaseFxRateModeOfficial);
    expect(roundtrip.fxRateMode, purchaseFxRateModeOfficial);
    expect(syncJson['fxRateMode'], purchaseFxRateModeOfficial);
    expect(syncJson.containsKey('bcnRate'), isFalse);
  });

  test(
    'preserves legacy null fxRateMode locally while syncing backward-compatible USD payloads',
    () {
      final purchase = Purchase(
        id: 'purchase-legacy-4',
        insumoId: 'ins-1',
        supplierId: 'sup-1',
        invoiceNumber: 'INV-1004',
        quantity: 2,
        unitCost: 10,
        timestamp: DateTime.parse('2026-01-10T08:00:00.000Z'),
        invoiceDate: DateTime(2026, 1, 10),
        currency: 'USD',
        bcnRate: 36.5,
        fxRateMode: null,
      );

      final entity = PurchaseMapper.toEntity(purchase);
      final roundtrip = PurchaseMapper.toDomain(entity);
      final syncJson = PurchaseMapper.toSyncJson(roundtrip);

      expect(entity.fxRateMode, isNull);
      expect(roundtrip.fxRateMode, isNull);
      expect(syncJson.containsKey('fxRateMode'), isFalse);
      expect(syncJson['bcnRate'], 36.5);
    },
  );
}
