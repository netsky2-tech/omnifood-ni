import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/reports/cogs_report_view.dart';
import 'package:pos_app/ui/features/inventory/reports/cogs_report_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;

  final now = DateTime.now();

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-coffee',
      name: 'Café Grano',
      consumptionUom: 'kg',
      stock: 10.0,
      averageCost: 100.0,
    ),
  ];

  final testMovements = <InventoryMovement>[
    InventoryMovement(
      id: 'mov-1',
      insumoId: 'ins-coffee',
      type: MovementType.sale,
      quantity: -3.0,
      previousStock: 10.0,
      newStock: 7.0,
      unitCostNio: 100.0,
      timestamp: now,
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    when(() => repository.getAllMovements()).thenAnswer((_) async => testMovements);
  });

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider(
        create: (_) => CogsReportViewModel(repository),
        child: const CogsReportView(),
      ),
    );
  }

  testWidgets('renders COGS summary metrics and item breakdown list', (tester) async {
    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    // Verify Title & Summary Cards
    expect(find.text('Costo de Ventas (COGS) & Consumos'), findsOneWidget);
    expect(find.text('TOTAL COGS'), findsOneWidget);
    expect(find.text('C\$ 300.00'), findsNWidgets(3)); // Total COGS card, Ventas Directas card, and line item cost
    expect(find.text('VENTAS DIRECTAS'), findsOneWidget);
    expect(find.text('MERMAS & PÉRDIDAS'), findsOneWidget);

    // Verify Insumo
    expect(find.text('Café Grano'), findsOneWidget);
    expect(find.text('100.0% del total'), findsOneWidget);
  });

  testWidgets('filters items using search query in COGS view', (tester) async {
    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    final searchField = find.byType(TextField);
    await tester.enterText(searchField, 'Leche');
    await tester.pumpAndSettle();

    expect(find.text('No hay consumos ni ventas registradas en el período seleccionado.'), findsOneWidget);
  });

  testWidgets('renders 2x2 KPI grid on Sunmi V2s handheld (360x720dp) without overflow', (tester) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    expect(find.text('TOTAL COGS'), findsOneWidget);
    expect(find.text('VENTAS DIRECTAS'), findsOneWidget);
    expect(find.text('MERMAS & PÉRDIDAS'), findsOneWidget);
    expect(find.text('Café Grano'), findsOneWidget);
  });
}
