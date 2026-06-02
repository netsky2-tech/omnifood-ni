import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late ProductionOrderViewModel viewModel;

  const insumos = <Insumo>[
    Insumo(
      id: 'coffee-base',
      name: 'Base de Café',
      consumptionUom: 'kg',
      stock: 12,
      averageCost: 90,
    ),
  ];

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<ProductionOrderViewModel>.value(
        value: viewModel,
        child: const ProductionOrderView(),
      ),
    );
  }

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => insumos);
    viewModel = ProductionOrderViewModel(
      repository,
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );
  });

  testWidgets('renders an explicit empty production state with a CTA', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Todavía no hay órdenes de producción locales.'), findsOneWidget);
    expect(find.text('INICIAR ORDEN DE PRODUCCIÓN'), findsOneWidget);
  });

  testWidgets('creates and renders a local production order from the dialog flow', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('INICIAR ORDEN DE PRODUCCIÓN'));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Base de Café').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Referencia de receta / versión'), 'rv-2026-06');
    await tester.enterText(find.widgetWithText(TextField, 'Cantidad a producir'), '4.5');

    await tester.tap(find.text('INICIAR'));
    await tester.pumpAndSettle();

    expect(find.text('Base de Café'), findsOneWidget);
    expect(find.text('Referencia receta: rv-2026-06'), findsOneWidget);
    expect(find.text('Cantidad: 4.50'), findsOneWidget);
    expect(find.text('Pendiente BOH'), findsOneWidget);
  });
}
