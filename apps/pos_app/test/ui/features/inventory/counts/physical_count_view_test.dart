import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

class _MockMovementEngine extends Mock implements MovementEngine {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late PhysicalCountViewModel viewModel;

  const milk = Insumo(
    id: 'milk',
    name: 'Leche Entera',
    consumptionUom: 'L',
    stock: 10,
    averageCost: 42,
  );

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<PhysicalCountViewModel>.value(
        value: viewModel,
        child: const PhysicalCountView(),
      ),
    );
  }

  setUp(() {
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    viewModel = PhysicalCountViewModel(
      repository,
      movementEngine,
      clock: () => DateTime(2026, 6, 2, 10, 30),
    );
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
  });

  testWidgets('renders an explicit empty state with a creation CTA', (tester) async {
    when(() => repository.getAllMovements()).thenAnswer((_) async => const <InventoryMovement>[]);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Conteo Físico / Ajustes'), findsOneWidget);
    expect(find.text('Todavía no hay conteos físicos aplicados en esta terminal.'), findsOneWidget);
    expect(find.text('NUEVO CONTEO / AJUSTE'), findsOneWidget);
  });

  testWidgets('creates a local compensating adjustment from the form flow', (tester) async {
    var movementLoads = 0;
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async {
        movementLoads += 1;
        if (movementLoads == 1) {
          return const <InventoryMovement>[];
        }

        return <InventoryMovement>[
          InventoryMovement(
            id: 'adj-1',
            insumoId: 'milk',
            type: MovementType.adjustment,
            quantity: -2,
            previousStock: 10,
            newStock: 8,
            timestamp: DateTime(2026, 6, 2, 10, 30),
            reason: 'Conteo físico | Motivo: Diferencia de cierre | Notas: Quedó menos producto del esperado',
          ),
        ];
      },
    );
    when(() => repository.getInsumoById('milk')).thenAnswer((_) async => milk);
    when(() => movementEngine.recordAdjustment('milk', -2, any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('NUEVO CONTEO / AJUSTE'));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Leche Entera').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Cantidad contada'), '8');
    await tester.enterText(find.widgetWithText(TextField, 'Motivo'), 'Diferencia de cierre');
    await tester.enterText(find.widgetWithText(TextField, 'Notas'), 'Quedó menos producto del esperado');

    await tester.tap(find.text('APLICAR AJUSTE'));
    await tester.pumpAndSettle();

    expect(find.text('Leche Entera'), findsOneWidget);
    expect(find.textContaining('Esperado: 10.00 L'), findsOneWidget);
    expect(find.textContaining('Contado: 8.00 L'), findsOneWidget);
    expect(find.textContaining('Variación: -2.00 L'), findsOneWidget);
  });
}
