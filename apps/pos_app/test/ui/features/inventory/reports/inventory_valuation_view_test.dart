import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/reports/inventory_valuation_view.dart';
import 'package:pos_app/ui/features/inventory/reports/inventory_valuation_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-1',
      name: 'Café Grano Especial',
      consumptionUom: 'kg',
      stock: 10.0,
      averageCost: 150.0,
      stockMin: 5.0,
      isPerishable: true,
    ),
    const Insumo(
      id: 'ins-2',
      name: 'Leche Deslactosada',
      consumptionUom: 'lt',
      stock: 2.0,
      averageCost: 35.0,
      stockMin: 4.0, // Low stock
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
  });

  Widget createWidgetUnderTest() {
    return MaterialApp(
      home: ChangeNotifierProvider(
        create: (_) => InventoryValuationViewModel(repository),
        child: const InventoryValuationView(),
      ),
    );
  }

  testWidgets('renders valuation summary metrics and items list', (tester) async {
    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    // Verify Title & Metrics
    expect(find.text('Reporte de Existencias & Valorización'), findsOneWidget);
    expect(find.text('VALORIZACIÓN TOTAL'), findsOneWidget);
    // (10 * 150 = 1500) + (2 * 35 = 70) = C$ 1570.00
    expect(find.text('C\$ 1570.00'), findsOneWidget);
    expect(find.text('ÍTEMS TOTALES'), findsOneWidget);
    expect(find.text('2 ítems con existencias'), findsOneWidget);

    // Verify Items
    expect(find.text('Café Grano Especial'), findsOneWidget);
    expect(find.text('Leche Deslactosada'), findsOneWidget);
    expect(find.text('Perecedero'), findsOneWidget);
    expect(find.text('STOCK BAJO'), findsNWidgets(2)); // Card header & item badge
  });

  testWidgets('filters items using search query', (tester) async {
    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    final searchField = find.byType(TextField);
    await tester.enterText(searchField, 'Leche');
    await tester.pumpAndSettle();

    expect(find.text('Leche Deslactosada'), findsOneWidget);
    expect(find.text('Café Grano Especial'), findsNothing);
  });

  testWidgets('renders 2x2 KPI grid on Sunmi V2s handheld (360x720dp) without overflow', (tester) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(createWidgetUnderTest());
    await tester.pumpAndSettle();

    expect(find.text('VALORIZACIÓN TOTAL'), findsOneWidget);
    expect(find.text('C\$ 1570.00'), findsOneWidget);
    expect(find.text('ÍTEMS TOTALES'), findsOneWidget);
    expect(find.text('Café Grano Especial'), findsOneWidget);
    expect(find.text('Leche Deslactosada'), findsOneWidget);
  });
}
