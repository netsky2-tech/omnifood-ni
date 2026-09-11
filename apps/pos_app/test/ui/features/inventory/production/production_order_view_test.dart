import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}
class _MockMovementEngine extends Mock implements MovementEngine {}

class _FakeProductionOrderDocument extends Fake implements ProductionOrderDocument {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late ProductionOrderViewModel viewModel;

  final recipeVersion = RecipeVersionDocument(
    id: 'rv-1',
    productId: 'prod-syrup',
    productName: 'Jarabe',
    versionNumber: 1,
    yieldQuantity: 4,
    technicalShrinkPct: 3,
    createdAt: DateTime(2026, 6, 1),
    components: const [],
  );

  setUpAll(() {
    registerFallbackValue(_FakeProductionOrderDocument());
  });

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
    movementEngine = _MockMovementEngine();
    when(() => repository.getActiveInsumos()).thenAnswer(
      (_) async => const [
        Insumo(id: 'ins-1', name: 'Base de Café', consumptionUom: 'kg', stock: 12, averageCost: 90),
      ],
    );
    when(() => repository.getActiveProducts()).thenAnswer(
      (_) async => const [
        Product(id: 'prod-syrup', name: 'Jarabe', uom: 'lt', stock: 0, averageCost: 0, sellPrice: 0),
      ],
    );
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => [recipeVersion]);
    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => const <ProductionOrderDocument>[]);
    when(() => repository.saveProductionOrderDocument(any())).thenAnswer((_) async {});
    when(
      () => movementEngine.recordProduction(
        recipeProductId: any(named: 'recipeProductId'),
        producedInsumoId: any(named: 'producedInsumoId'),
        quantity: any(named: 'quantity'),
        reason: any(named: 'reason'),
      ),
    ).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'mov-1',
          insumoId: 'ins-1',
          type: MovementType.production,
          quantity: 1,
          previousStock: 0,
          newStock: 1,
          timestamp: DateTime(2026, 6, 1, 8, 30),
        ),
      ],
    );
    viewModel = ProductionOrderViewModel(
      repository,
      movementEngine,
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );
  });

  testWidgets('renders close-order CTA and operational copy', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('CONFIRMAR Y CERRAR ORDEN'), findsOneWidget);
    expect(find.textContaining('Cerrá producción localmente'), findsOneWidget);
  });

  testWidgets('opens close order dialog with auto generated batch code and responsive layout', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('CONFIRMAR Y CERRAR ORDEN'));
    await tester.pumpAndSettle();

    expect(find.text('Cerrar producción'), findsOneWidget);
    expect(find.text('LOTE-20260601-001'), findsOneWidget);
    expect(find.text('CANCELAR'), findsOneWidget);
  });

  testWidgets('selecting recipe version in dialog automatically sets expiration and default quantities', (tester) async {
    tester.view.physicalSize = const Size(800, 1280);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('CONFIRMAR Y CERRAR ORDEN'));
    await tester.pumpAndSettle();

    // Open recipe version dropdown
    await tester.tap(find.byType(DropdownButtonFormField<RecipeVersionDocument>));
    await tester.pumpAndSettle();

    // Select the recipe version
    await tester.tap(find.text('Jarabe • V1').last);
    await tester.pumpAndSettle();

    // Expiry should be 2026-06-01 + 2 days = 2026-06-03
    expect(find.text('2026-06-03'), findsOneWidget);
    // Yield quantity was 4
    expect(find.text('4.0'), findsNWidgets(2)); // Planned & actual textfields
    // Real-time KPI Card
    expect(find.textContaining('Rendimiento dentro de tolerancia'), findsOneWidget);
    expect(find.textContaining('Rendimiento: 100.0%'), findsOneWidget);
  });

  testWidgets('high variance triggers supervisor override warning banner and input fields', (tester) async {
    tester.view.physicalSize = const Size(800, 1280);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('CONFIRMAR Y CERRAR ORDEN'));
    await tester.pumpAndSettle();

    // Select recipe version
    await tester.tap(find.byType(DropdownButtonFormField<RecipeVersionDocument>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Jarabe • V1').last);
    await tester.pumpAndSettle();

    // Change actual quantity to 2.0 (50% yield, 50% deviation > 5%)
    final actualField = find.widgetWithText(TextField, '4.0').last;
    await tester.enterText(actualField, '2.0');
    await tester.pumpAndSettle();

    // Warning banner and supervisor fields
    expect(find.textContaining('Desviación excede tolerancia'), findsOneWidget);
    expect(find.textContaining('Rendimiento: 50.0%'), findsOneWidget);
    expect(find.text('Usuario / ID de Supervisor *'), findsOneWidget);
    expect(find.text('PIN o TOTP de Supervisor *'), findsOneWidget);
  });

  testWidgets('renders print icon button for completed order and triggers label printing', (tester) async {
    final mockPrinter = MockPrinterAdapter();
    final closedOrder = ProductionOrderDocument(
      id: 'ord-1',
      recipeVersionId: 'rv-1',
      recipeProductId: 'prod-syrup',
      recipeProductName: 'Jarabe',
      producedInsumoId: 'ins-1',
      producedInsumoName: 'Base de Café',
      plannedQuantity: 4,
      actualQuantity: 4,
      producedBatchNumber: 'LOTE-20260601-001',
      producedExpirationDate: DateTime(2026, 6, 4),
      operationDate: DateTime(2026, 6, 1, 8, 30),
      status: 'CLOSED_PENDING_SYNC',
      outcome: 'COMPLETED',
      terminalId: 'POS-01',
      sourceSequence: 1,
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      totalConsumedCostNio: 100,
      producedUnitCostNio: 25,
      closedAt: DateTime(2026, 6, 1, 8, 30),
      movementReferences: const ['mov-1'],
    );

    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => [closedOrder]);

    viewModel = ProductionOrderViewModel(
      repository,
      movementEngine,
      printer: mockPrinter,
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.print), findsOneWidget);

    await tester.tap(find.byIcon(Icons.print));
    await tester.pumpAndSettle();

    expect(mockPrinter.lastPrintedText, contains('ETIQUETA DE PRODUCCION'));
    expect(mockPrinter.lastPrintedText, contains('LOTE-20260601-001'));
    expect(find.text('Viñeta de producción enviada a impresora'), findsOneWidget);
  });
}

