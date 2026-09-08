import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';

void main() {
  SaleTimeInventoryBinding binding(int ordinal, String insumo) => SaleTimeInventoryBinding(bindingOrdinal: ordinal, insumoId: insumo, quantityPerSaleUnit: 1.25, saleCorrelationId: 'correlation-$ordinal');
  group('SaleTimeInventorySnapshot', () {
    test('copies bindings and serializes the exact D3 snapshot shape', () {
      final source = [binding(0, 'a')];
      final snapshot = SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.direct, catalogRevision: 'r', mappingVersionId: 'mapping', bindings: source);
      source[0] = binding(0, 'mutated');
      expect(snapshot.toJson().keys, unorderedEquals(['classification', 'disposition', 'reasonCode', 'catalogRevision', 'mappingVersionId', 'recipeVersionId', 'bindings']));
      expect(snapshot.toJson()['bindings'], [{'bindingOrdinal': 0, 'insumoId': 'a', 'recipeComponentId': null, 'quantityPerSaleUnit': 1.25, 'saleCorrelationId': 'correlation-0'}]);
      expect(() => snapshot.bindings.add(binding(1, 'b')), throwsUnsupportedError);
      expect(SaleTimeInventorySnapshot.fromJson(snapshot.toJson()).bindings.single.insumoId, 'a');
    });
    test('enforces dispositions, reasons, positive quantities, and stable ordinals', () {
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.direct, catalogRevision: 'r', bindings: [binding(0, 'a')]), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.prepared, disposition: SaleInventoryDisposition.recipe, catalogRevision: 'r', recipeVersionId: 'recipe'), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.noImpact, catalogRevision: 'r', reasonCode: 'UNKNOWN'), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.compound, disposition: SaleInventoryDisposition.pendingRecipe, catalogRevision: 'r', reasonCode: 'MISSING_PUBLISHED_RECIPE', mappingVersionId: 'mapping'), throwsArgumentError);
      expect(() => SaleTimeInventoryBinding(bindingOrdinal: 0, insumoId: 'a', quantityPerSaleUnit: 0, saleCorrelationId: 'c'), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot.fromJson({'classification': 'SIMPLE', 'disposition': 'NO_IMPACT', 'reasonCode': 'NO_EXPLICIT_INSUMO_MAPPING', 'catalogRevision': 'r', 'mappingVersionId': null, 'recipeVersionId': null, 'bindings': [], 'snapshotVersion': 'SALE_TIME_V1'}), throwsFormatException);
    });
    test('enforces binding identities and preserves supplied ordinal semantics', () {
      SaleTimeInventoryBinding recipe(String? component, {int ordinal = 0, String insumo = 'a'}) => SaleTimeInventoryBinding(bindingOrdinal: ordinal, insumoId: insumo, recipeComponentId: component, quantityPerSaleUnit: 1.25, saleCorrelationId: 'c-$ordinal');
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.direct, catalogRevision: 'r', mappingVersionId: 'mapping', bindings: [recipe('component')]), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.prepared, disposition: SaleInventoryDisposition.recipe, catalogRevision: 'r', recipeVersionId: 'recipe', bindings: [recipe(null)]), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.compound, disposition: SaleInventoryDisposition.recipe, catalogRevision: 'r', recipeVersionId: 'recipe', bindings: [recipe('')]), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.prepared, disposition: SaleInventoryDisposition.recipe, catalogRevision: 'r', recipeVersionId: 'recipe', bindings: [recipe('component', ordinal: 1)]), throwsArgumentError);
      expect(() => SaleTimeInventorySnapshot(classification: SaleInventoryClassification.prepared, disposition: SaleInventoryDisposition.recipe, catalogRevision: 'r', recipeVersionId: 'recipe', bindings: [recipe('component-a', insumo: 'b'), recipe('component-b', ordinal: 1, insumo: 'a')]), throwsArgumentError);
      expect(() => SaleTimeInventoryBinding(bindingOrdinal: 0, insumoId: 'a', quantityPerSaleUnit: double.infinity, saleCorrelationId: 'c'), throwsArgumentError);
    });
  });
}
