import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

class _MockMovementEngine extends Mock implements MovementEngine {}

class _FakeCountSessionDocument extends Fake implements CountSessionDocument {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late PhysicalCountViewModel viewModel;
  var storedSessions = <CountSessionDocument>[];

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

  setUpAll(() {
    registerFallbackValue(_FakeCountSessionDocument());
  });

  setUp(() {
    storedSessions = <CountSessionDocument>[];
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    viewModel = PhysicalCountViewModel(
      repository,
      movementEngine,
      clock: () => DateTime(2026, 6, 2, 10, 30),
    );
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(() => repository.getCountSessionDocuments())
        .thenAnswer((_) async => storedSessions);
    when(() => repository.saveCountSessionDocument(any()))
        .thenAnswer((invocation) async {
      storedSessions = [invocation.positionalArguments.first as CountSessionDocument];
    });
  });

  testWidgets('renders a count-session workspace with session creation CTA', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Conteos físicos BOH'), findsOneWidget);
    expect(find.text('ABRIR SESIÓN DE CONTEO'), findsOneWidget);
    expect(find.text('Todavía no hay sesiones de conteo en esta terminal.'), findsOneWidget);
  });

  testWidgets('renders posted session detail with approved variance and movement references', (tester) async {
    storedSessions = [
      CountSessionDocument(
        id: 'count-1',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.posted,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 11),
        postedAt: DateTime(2026, 6, 2, 11),
        movementReferences: const ['count-1:line-1'],
        lines: const [
          CountSessionLineDocument(
            id: 'line-1',
            insumoId: 'milk',
            insumoName: 'Leche Entera',
            uom: 'L',
            theoreticalQuantity: 10,
            approvedEntryIndex: 0,
            entries: [
              CountLineEntryDocument(countedQuantity: 8),
            ],
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.textContaining('Bodega Central'), findsAtLeastNWidgets(1));
    expect(find.text('Estado: posted'), findsAtLeastNWidgets(1));
    expect(find.textContaining('Variación aprobada: -2.00 L'), findsOneWidget);
    expect(find.textContaining('Referencias de ajuste: 1'), findsOneWidget);
  });
}
