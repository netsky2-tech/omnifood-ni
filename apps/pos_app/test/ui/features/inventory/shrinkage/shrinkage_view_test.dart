import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/shrinkage/shrinkage_view.dart';
import 'package:pos_app/ui/features/inventory/shrinkage/shrinkage_view_model.dart';
import 'package:provider/provider.dart';

import 'shrinkage_view_test.mocks.dart';

@GenerateMocks([InventoryRepository, MovementEngine])
void main() {
  late MockInventoryRepository mockRepository;
  late MockMovementEngine mockMovementEngine;
  late ShrinkageViewModel viewModel;

  final testInsumos = [
    const Insumo(id: '1', name: 'Tomate', consumptionUom: 'kg', stock: 10, averageCost: 1.0),
    const Insumo(id: '2', name: 'Cebolla', consumptionUom: 'kg', stock: 5, averageCost: 0.5),
  ];

  setUp(() {
    mockRepository = MockInventoryRepository();
    mockMovementEngine = MockMovementEngine();
    viewModel = ShrinkageViewModel(mockRepository, mockMovementEngine);

    when(mockRepository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
  });

  Widget createWidget() {
    return MaterialApp(
      home: ChangeNotifierProvider<ShrinkageViewModel>.value(
        value: viewModel,
        child: const ShrinkageView(),
      ),
    );
  }

  testWidgets('Should disable REGISTRAR button when VM is loading', (tester) async {
    final completer = Completer<void>();
    when(mockMovementEngine.recordShrinkage(any, any, any)).thenAnswer((_) => completer.future);

    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    // Open dialog
    await tester.tap(find.text('REGISTRAR MERMA'));
    await tester.pumpAndSettle();

    // Select insumo
    await tester.enterText(find.widgetWithText(TextField, 'Insumo (buscar...)'), 'Tom');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tomate').last);
    await tester.pumpAndSettle();

    // Fill qty
    await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '2');
    await tester.pumpAndSettle();

    // Tap Registrar
    await tester.tap(find.text('REGISTRAR'));
    await tester.pump(); // Start async call

    // Check button is disabled (onPressed is null)
    final registrarButton = find.byType(ElevatedButton).last;
    expect(tester.widget<ElevatedButton>(registrarButton).onPressed, isNull);

    completer.complete();
    await tester.pumpAndSettle();
    
    // Dialog should be closed
    expect(find.text('Registrar Merma'), findsNothing);
  });

  testWidgets('Should have a searchable autocomplete for insumos and filter results', (tester) async {
    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('REGISTRAR MERMA'));
    await tester.pumpAndSettle();

    // Find Autocomplete
    expect(find.byType(Autocomplete<Insumo>), findsOneWidget);

    // Type 'Tom'
    await tester.enterText(find.widgetWithText(TextField, 'Insumo (buscar...)'), 'Tom');
    await tester.pumpAndSettle();

    // Should see 'Tomate' in options
    expect(find.text('Tomate'), findsWidgets); // One in field, one in options potentially
    expect(find.text('Cebolla'), findsNothing);
  });
}
