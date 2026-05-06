import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/shrinkage/shrinkage_view.dart';
import 'package:pos_app/ui/features/inventory/shrinkage/shrinkage_view_model.dart';
import 'package:provider/provider.dart';

class MockInventoryRepository extends Mock implements InventoryRepository {}
class MockMovementEngine extends Mock implements MovementEngine {}

void main() {
  late MockInventoryRepository mockRepo;
  late MockMovementEngine mockEngine;
  late ShrinkageViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(MovementType.shrinkage);
  });

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockEngine = MockMovementEngine();
    viewModel = ShrinkageViewModel(mockRepo, mockEngine);

    when(() => mockRepo.getActiveInsumos()).thenAnswer((_) async => [
      const Insumo(id: 'i1', name: 'Coffee', stock: 10, averageCost: 5, consumptionUom: 'oz'),
    ]);
    when(() => mockRepo.getRecentMovementsByType(any(), any())).thenAnswer((_) async => []);
  });

  Widget createWidget() {
    return MaterialApp(
      home: ChangeNotifierProvider<ShrinkageViewModel>.value(
        value: viewModel,
        child: const ShrinkageView(),
      ),
    );
  }

  testWidgets('Should display insumo list in dropdown and call recordShrinkage', (tester) async {
    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    // Open dialog
    await tester.tap(find.text('REGISTRAR NUEVA MERMA'));
    await tester.pumpAndSettle();

    // Find and select insumo
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Coffee').last);
    await tester.pumpAndSettle();

    // Enter quantity
    await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '2.5');
    
    // Enter reason
    await tester.enterText(find.widgetWithText(TextField, 'Motivo'), 'Spilled');

    // Stub recordShrinkage
    when(() => mockEngine.recordShrinkage(any(), any(), any())).thenAnswer((_) async {});
    when(() => mockRepo.getActiveInsumos()).thenAnswer((_) async => []);

    // Submit
    await tester.tap(find.text('REGISTRAR'));
    await tester.pumpAndSettle();

    // Verify interaction
    verify(() => mockEngine.recordShrinkage('i1', 2.5, 'Spilled')).called(1);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('Should show validation error if quantity is empty or zero', (tester) async {
    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('REGISTRAR NUEVA MERMA'));
    await tester.pumpAndSettle();

    // Try to submit without values
    await tester.tap(find.text('REGISTRAR'));
    await tester.pumpAndSettle();

    expect(find.text('Seleccione un insumo'), findsOneWidget);

    // Select insumo
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Coffee').last);
    await tester.pumpAndSettle();

    // Try to submit without quantity
    await tester.tap(find.text('REGISTRAR'));
    await tester.pumpAndSettle();

    expect(find.text('Ingrese una cantidad válida'), findsOneWidget);
    
    // Dialog should still be open
    expect(find.byType(AlertDialog), findsOneWidget);
  });
}
