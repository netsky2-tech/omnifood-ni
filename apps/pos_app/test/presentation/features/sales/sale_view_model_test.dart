import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'sale_view_model_test.mocks.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';

@GenerateMocks([MovementEngine])
void main() {
  late MockMovementEngine mockEngine;
  late SaleViewModel viewModel;

  setUp(() {
    mockEngine = MockMovementEngine();
    viewModel = SaleViewModel(mockEngine);
  });

  test('completeSale should trigger movementEngine recordSale', () async {
    // GIVEN
    const productId = 'prod-123';
    const quantity = 2;

    // WHEN
    await viewModel.completeSale(productId, quantity);

    // THEN
    verify(mockEngine.recordSale(productId, quantity)).called(1);
  });
}
