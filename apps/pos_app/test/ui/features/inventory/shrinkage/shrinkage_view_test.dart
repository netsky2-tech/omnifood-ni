import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
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
    const Insumo(
      id: '1',
      name: 'Tomate',
      consumptionUom: 'kg',
      stock: 10,
      averageCost: 800.0,
    ),
    const Insumo(
      id: '2',
      name: 'Cebolla',
      consumptionUom: 'kg',
      stock: 5,
      averageCost: 0.5,
    ),
  ];
  final testBatches = [
    Batch(
      id: 'batch-1',
      insumoId: '1',
      batchNumber: 'LOT-001',
      receivedDate: DateTime(2026, 6, 1),
      expirationDate: DateTime(2026, 6, 14),
      remainingStock: 4,
      cost: 800,
    ),
    Batch(
      id: 'batch-2',
      insumoId: '1',
      batchNumber: 'LOT-002',
      receivedDate: DateTime(2026, 6, 2),
      expirationDate: DateTime(2026, 6, 20),
      remainingStock: 6,
      cost: 820,
    ),
  ];

  setUp(() {
    mockRepository = MockInventoryRepository();
    mockMovementEngine = MockMovementEngine();
    viewModel = ShrinkageViewModel(mockRepository, mockMovementEngine);

    when(
      mockRepository.getActiveInsumos(),
    ).thenAnswer((_) async => testInsumos);
    when(
      mockRepository.getBatchesByInsumoId(any),
    ).thenAnswer((_) async => testBatches);
  });

  Widget createWidget() {
    return MaterialApp(
      home: ChangeNotifierProvider<ShrinkageViewModel>.value(
        value: viewModel,
        child: const ShrinkageView(),
      ),
    );
  }

  testWidgets('Should disable REGISTRAR button when VM is loading', (
    tester,
  ) async {
    final completer = Completer<void>();
    when(
      mockMovementEngine.recordShrinkage(any, any, any),
    ).thenAnswer((_) => completer.future);

    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    // Open dialog
    await tester.tap(find.text('REGISTRAR MERMA'));
    await tester.pumpAndSettle();

    // Select insumo
    await tester.enterText(
      find.widgetWithText(TextField, 'Insumo (buscar...)'),
      'Tom',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tomate').last);
    await tester.pumpAndSettle();

    // Fill qty
    await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '2');
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Observation'),
      'Spoiled batch',
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Lote exacto a ajustar'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('LOT-001').last);
    await tester.pumpAndSettle();

    // Tap Registrar
    await tester.tap(find.text('REGISTRAR'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CONFIRMAR MERMA'));
    await tester.pump(); // Start async call

    // Check button is disabled (onPressed is null)
    final registrarButton = find.byType(ElevatedButton).last;
    expect(tester.widget<ElevatedButton>(registrarButton).onPressed, isNull);

    completer.complete();
    await tester.pumpAndSettle();

    expect(find.text('Registrar Merma'), findsNothing);
  });

  testWidgets(
    'Should have a searchable autocomplete for insumos and filter results',
    (tester) async {
      await tester.pumpWidget(createWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('REGISTRAR MERMA'));
      await tester.pumpAndSettle();

      // Find Autocomplete
      expect(find.byType(Autocomplete<Insumo>), findsOneWidget);

      // Type 'Tom'
      await tester.enterText(
        find.widgetWithText(TextField, 'Insumo (buscar...)'),
        'Tom',
      );
      await tester.pumpAndSettle();

      // Should see 'Tomate' in options
      expect(
        find.text('Tomate'),
        findsWidgets,
      ); // One in field, one in options potentially
      expect(find.text('Cebolla'), findsNothing);
    },
  );

  testWidgets('Shows forensic notice for high-value shrinkage adjustments', (
    tester,
  ) async {
    when(
      mockMovementEngine.recordShrinkage(any, any, any),
    ).thenAnswer((_) async {});

    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('REGISTRAR MERMA'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Insumo (buscar...)'),
      'Tom',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tomate').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '2.5');
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Observation'),
      'Expired tomatoes',
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Lote exacto a ajustar'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('LOT-001').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('REGISTRAR'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CONFIRMAR MERMA'));
    await tester.pumpAndSettle();

    expect(viewModel.forensicNotice, isNotNull);
    expect(viewModel.forensicNotice, contains('alto valor'));
  });

  testWidgets(
    'Shows FIFO review and destructive confirmation for manual batch adjustments',
    (tester) async {
      when(
        mockMovementEngine.recordShrinkage(any, any, any),
      ).thenAnswer((_) async {});

      await tester.pumpWidget(createWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.text('REGISTRAR MERMA'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextField, 'Insumo (buscar...)'),
        'Tom',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tomate').last);
      await tester.pumpAndSettle();

      expect(find.text('Revisión FIFO antes del ajuste'), findsOneWidget);
      expect(find.textContaining('FIFO 1: LOT-001'), findsOneWidget);
      expect(find.textContaining('FIFO 2: LOT-002'), findsOneWidget);

      await tester.tap(find.text('Lote exacto a ajustar'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('LOT-001').last);
      await tester.pumpAndSettle();

      await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '2');
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextField, 'Observation'),
        'Broken during prep',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('REGISTRAR'));
      await tester.pumpAndSettle();

      expect(find.text('Confirmar ajuste destructivo'), findsOneWidget);
      expect(find.text('Batch FIFO seleccionado: LOT-001'), findsOneWidget);
      expect(find.text('Valuación afectada: C\$1600.00'), findsOneWidget);

      await tester.tap(find.text('CONFIRMAR MERMA'));
      await tester.pumpAndSettle();

      verify(
        mockMovementEngine.recordShrinkage(
          '1',
          2.0,
          'VENCIDO | observation:Broken during prep | batch:LOT-001',
        ),
      ).called(1);
    },
  );

  testWidgets('Blocks posting until observation is provided', (tester) async {
    when(
      mockMovementEngine.recordShrinkage(any, any, any),
    ).thenAnswer((_) async {});

    await tester.pumpWidget(createWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('REGISTRAR MERMA'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Insumo (buscar...)'),
      'Tom',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tomate').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Cantidad'), '1');
    await tester.pumpAndSettle();

    await tester.tap(find.text('Lote exacto a ajustar'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('LOT-001').last);
    await tester.pumpAndSettle();

    final registrarButton = find.widgetWithText(ElevatedButton, 'REGISTRAR');
    expect(tester.widget<ElevatedButton>(registrarButton).onPressed, isNull);

    await tester.enterText(
      find.widgetWithText(TextField, 'Observation'),
      'Loss confirmed',
    );
    await tester.pumpAndSettle();

    expect(tester.widget<ElevatedButton>(registrarButton).onPressed, isNotNull);
  });
}
