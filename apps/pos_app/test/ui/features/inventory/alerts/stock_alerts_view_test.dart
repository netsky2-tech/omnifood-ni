import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/alerts/stock_alerts_view.dart';
import 'package:pos_app/ui/features/inventory/alerts/stock_alerts_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late StockAlertsViewModel viewModel;

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-warning',
      name: 'Leche Entera',
      consumptionUom: 'lt',
      stock: 4.0,
      averageCost: 35.0,
      stockMin: 5.0,
      parLevel: 20.0,
    ),
    const Insumo(
      id: 'ins-critical',
      name: 'Vasos 8oz',
      consumptionUom: 'unit',
      stock: 0.0,
      averageCost: 2.0,
      stockMin: 50.0,
      parLevel: 100.0,
    ),
  ];

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<StockAlertsViewModel>.value(
        value: viewModel,
        child: const StockAlertsView(),
      ),
    );
  }

  setUp(() {
    repository = _MockInventoryRepository();
    viewModel = StockAlertsViewModel(repository);
  });

  testWidgets('renders stock alerts summary cards, table, and filter chips', (tester) async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Alertas de Stock'), findsOneWidget);
    expect(find.text('Total Alertas'), findsOneWidget);
    expect(find.text('Críticas'), findsOneWidget);
    expect(find.text('Stock Bajo'), findsOneWidget);

    expect(find.text('Vasos 8oz'), findsOneWidget);
    expect(find.text('Leche Entera'), findsOneWidget);

    // Tap on Critical chip to filter
    await tester.tap(
      find.descendant(
        of: find.byType(FilterChip),
        matching: find.textContaining('Críticas'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Vasos 8oz'), findsOneWidget);
    expect(find.text('Leche Entera'), findsNothing);
  });

  testWidgets('renders empty state when there are no stock alerts', (tester) async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const [
      Insumo(
        id: 'ins-ok',
        name: 'Arroz 50kg',
        consumptionUom: 'kg',
        stock: 100.0,
        averageCost: 20.0,
        stockMin: 10.0,
        parLevel: 120.0,
      ),
    ]);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('No hay alertas de stock activas.'), findsOneWidget);
  });
}
