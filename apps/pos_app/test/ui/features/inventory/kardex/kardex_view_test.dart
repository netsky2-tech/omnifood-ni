import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/kardex/kardex_view.dart';
import 'package:pos_app/ui/features/inventory/kardex/kardex_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late KardexViewModel viewModel;

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<KardexViewModel>.value(
        value: viewModel,
        child: const KardexView(),
      ),
    );
  }

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async => <InventoryMovement>[
        InventoryMovement(
          id: 'move-1',
          insumoId: 'milk',
          type: MovementType.shrinkage,
          quantity: -2,
          previousStock: 20,
          newStock: 18,
          timestamp: DateTime(2026, 6, 2, 9, 30),
          reason: 'Derramada',
        ),
        InventoryMovement(
          id: 'move-2',
          insumoId: 'coffee',
          type: MovementType.purchase,
          quantity: 3,
          previousStock: 3,
          newStock: 6,
          timestamp: DateTime(2026, 6, 1, 8, 15),
          reason: 'Compra local',
        ),
      ],
    );
    when(() => repository.getInsumosByIds(any())).thenAnswer(
      (_) async => const <Insumo>[
        Insumo(
          id: 'milk',
          name: 'Leche Entera',
          consumptionUom: 'L',
          stock: 18,
          averageCost: 42.5,
        ),
        Insumo(
          id: 'coffee',
          name: 'Café Molido',
          consumptionUom: 'kg',
          stock: 6,
          averageCost: 130,
        ),
      ],
    );
    when(() => repository.getPurchaseHistory()).thenAnswer((_) async => const <Purchase>[]);
    when(() => repository.getCountSessionDocuments()).thenAnswer((_) async => const <CountSessionDocument>[]);
    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => const <ProductionOrderDocument>[]);
    when(() => repository.getForensicAlerts()).thenAnswer((_) async => const <ForensicAlert>[]);
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => const <RecipeVersionDocument>[]);
    viewModel = KardexViewModel(repository);
  });

  testWidgets('renders a usable kardex table from local movement history', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Kardex BOH'), findsOneWidget);
    expect(find.text('Leche Entera'), findsOneWidget);
    expect(find.text('Café Molido'), findsOneWidget);
    expect(
      find.textContaining('Los costos históricos se muestran cuando el documento origen está disponible'),
      findsOneWidget,
    );
  });

  testWidgets('supports search and type chips for local kardex history', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'leche');
    await tester.pumpAndSettle();

    expect(find.text('Leche Entera'), findsOneWidget);
    expect(find.text('Café Molido'), findsNothing);

    await tester.tap(find.text('Limpiar búsqueda'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Compra'));
    await tester.pumpAndSettle();

    expect(find.text('Café Molido'), findsOneWidget);
    expect(find.text('Leche Entera'), findsNothing);
  });

  testWidgets('shows source document traceability and valuation metadata in the detail sheet', (
    tester,
  ) async {
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'purchase-1',
          insumoId: 'coffee',
          type: MovementType.purchase,
          quantity: 3,
          previousStock: 3,
          newStock: 6,
          timestamp: DateTime(2026, 6, 1, 8, 15),
          reason: 'Purchase USD @ 365.0000 NIO',
        ),
      ],
    );
    when(() => repository.getPurchaseHistory()).thenAnswer(
      (_) async => [
        Purchase(
          id: 'purchase-1',
          insumoId: 'coffee',
          supplierId: 'supplier-1',
          invoiceNumber: 'INV-1001',
          quantity: 3,
          unitCost: 10,
          timestamp: DateTime(2026, 6, 1, 8, 15),
          invoiceDate: DateTime(2026, 6, 1),
          currency: 'USD',
          bcnRate: 36.5,
          unitCostNio: 365,
          projectedCppNio: 200,
        ),
      ],
    );
    when(() => repository.getForensicAlerts()).thenAnswer(
      (_) async => [
        ForensicAlert(
          id: 'alert-1',
          alertType: 'LOW_STOCK',
          severity: 'high',
          message: 'Stock bajo en café.',
          createdAt: DateTime(2026, 6, 1, 8, 20),
          sourceMovementId: 'purchase-1',
        ),
      ],
    );
    viewModel = KardexViewModel(repository);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Café Molido').first);
    await tester.pumpAndSettle();

    expect(find.text('Documento origen: PURCHASE · purchase-1'), findsOneWidget);
    expect(find.text('Valor total: 1095.00'), findsOneWidget);
    expect(find.text('Alertas relacionadas: 1'), findsOneWidget);
  });
}
