import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/catalog/catalog_type.dart';

void main() {
  group('CatalogType', () {
    test('fromString resolves known protocol types', () {
      expect(CatalogType.fromString('UOM'), CatalogType.uom);
      expect(CatalogType.fromString('SALES_PRODUCT_TYPE'), CatalogType.salesProductType);
    });

    test('fromString returns null for unknown (forward-compatible sync)', () {
      expect(CatalogType.fromString('NOPE'), isNull);
    });

    test('fromJson throws on unknown (persisted values must be known)', () {
      expect(() => CatalogType.fromJson('NOPE'), throwsStateError);
      expect(CatalogType.fromJson('UOM'), CatalogType.uom);
    });

    test('toJson round-trips to the protocol string', () {
      expect(CatalogType.toJson(CatalogType.uom), 'UOM');
      expect(CatalogType.toJson(CatalogType.salesProductCategory), 'SALES_PRODUCT_CATEGORY');
    });

    test('value equality', () {
      expect(CatalogType.uom == CatalogType.uom, isTrue);
      expect(CatalogType.uom == CatalogType.inventoryType, isFalse);
    });
  });
}
