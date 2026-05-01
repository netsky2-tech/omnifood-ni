import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';

void main() {
  group('Insumo Domain Model', () {
    test('should create an Insumo instance', () {
      const insumo = Insumo(
        id: '1',
        name: 'Café',
        consumptionUom: 'gramos',
        stock: 1000,
        averageCost: 0.5,
      );

      expect(insumo.id, '1');
      expect(insumo.name, 'Café');
      expect(insumo.stock, 1000);
    });
  });
}
