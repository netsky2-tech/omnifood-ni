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

  group('cost coverage banner (H10 zero-cost basis UX)', () {
    const bannerText =
        'Sin costo: algunos insumos todavía no tienen costo de compra registrado. '
        'Registra el costo de compra de esos insumos para calcular el margen.';
    const bannerKey = Key('cogs_cost_basis_warning_banner');

    final uncostedInsumos = <Insumo>[
      const Insumo(
        id: 'ins-harina',
        name: 'Harina',
        consumptionUom: 'kg',
        stock: 5.0,
        averageCost: 0.0,
      ),
    ];

    final uncostedMovements = <InventoryMovement>[
      InventoryMovement(
        id: 'mov-u1',
        insumoId: 'ins-harina',
        type: MovementType.sale,
        quantity: -1.0,
        previousStock: 5.0,
        newStock: 4.0,
        timestamp: now,
      ),
    ];

    testWidgets('zero basis: movements exist without costs -> banner visible and item shows — instead of 0.00', (tester) async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => uncostedInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => uncostedMovements);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      // Dashboard-aligned ZERO_COST_BASIS copy, warning styling.
      expect(find.byKey(bannerKey), findsOneWidget);
      expect(find.textContaining('Sin costo: algunos insumos todavía no tienen costo de compra registrado'), findsOneWidget);
      expect(find.text(bannerText), findsOneWidget);

      // NHILOS §34: — means unavailable, never a confident 0.00 (item row).
      expect(find.text('—'), findsOneWidget);
      expect(find.text('Sin costo'), findsOneWidget);
      // The only remaining C$ 0.00 are the three KPI summary cards: the COGS
      // math is untouched, and the banner above them explains the zero.
      expect(find.text('C\$ 0.00'), findsNWidgets(3));
    });

    testWidgets('partial: mixed movements -> banner visible with same dashboard copy', (tester) async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => [...testInsumos, ...uncostedInsumos]);
      when(() => repository.getAllMovements()).thenAnswer((_) async => [...testMovements, ...uncostedMovements]);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.byKey(bannerKey), findsOneWidget);
      expect(find.text(bannerText), findsOneWidget);

      // Costed item keeps its numbers; uncosted item shows —.
      expect(find.text('Café Grano'), findsOneWidget);
      expect(find.text('Harina'), findsOneWidget);
      expect(find.text('—'), findsOneWidget);
    });

    testWidgets('complete: all movements costed -> no banner, presentation unchanged', (tester) async {
      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.byKey(bannerKey), findsNothing);
      expect(find.text(bannerText), findsNothing);
      expect(find.text('Café Grano'), findsOneWidget);
      expect(find.text('C\$ 300.00'), findsNWidgets(3));
    });

    testWidgets('no movements: existing empty state stays, no banner', (tester) async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => <InventoryMovement>[]);

      await tester.pumpWidget(createWidgetUnderTest());
      await tester.pumpAndSettle();

      expect(find.text('No hay consumos ni ventas registradas en el período seleccionado.'), findsOneWidget);
      expect(find.byKey(bannerKey), findsNothing);
    });
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
