import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class MockInventoryRepository extends Mock implements InventoryRepository {}
class MockAlertService extends Mock implements AlertService {}
class MockAuthRepository extends Mock implements AuthRepository {}
class FakeProductionOrderDocument extends Fake implements ProductionOrderDocument {}

void main() {
  late MockInventoryRepository inventoryRepository;
  late MockAlertService alertService;
  late MockAuthRepository authRepository;
  late MockPrinterAdapter printerAdapter;
  late MovementEngineImpl movementEngine;
  late ProductionOrderViewModel viewModel;

  final initialInsumos = <Insumo>[
    const Insumo(
      id: 'ins-sugar',
      name: 'Azúcar Refinada',
      consumptionUom: 'kg',
      stock: 50.0,
      averageCost: 20.0,
    ),
    const Insumo(
      id: 'ins-water',
      name: 'Agua Purificada',
      consumptionUom: 'lt',
      stock: 100.0,
      averageCost: 5.0,
    ),
    const Insumo(
      id: 'ins-syrup',
      name: 'Jarabe Simple de la Casa',
      consumptionUom: 'lt',
      stock: 0.0,
      averageCost: 0.0,
    ),
  ];

  final recipeProduct = const Product(
    id: 'prod-syrup',
    name: 'Jarabe Simple de la Casa',
    uom: 'lt',
    stock: 0,
    averageCost: 0,
    sellPrice: 0,
  );

  final recipeVersion = RecipeVersionDocument(
    id: 'rv-syrup-v1',
    productId: 'prod-syrup',
    productName: 'Jarabe Simple de la Casa',
    versionNumber: 1,
    yieldQuantity: 10.0,
    technicalShrinkPct: 0.0,
    diasVidaUtil: 7,
    umbralDesviacionPermitido: 5.0,
    createdAt: DateTime(2026, 8, 27, 8, 0),
    components: const [
      RecipeVersionComponentDocument(
        ingredientId: 'ins-sugar',
        ingredientName: 'Azúcar Refinada',
        ingredientType: 'INSUMO',
        grossQuantity: 5.0,
        netQuantity: 5.0,
        technicalShrinkPct: 0.0,
      ),
      RecipeVersionComponentDocument(
        ingredientId: 'ins-water',
        ingredientName: 'Agua Purificada',
        ingredientType: 'INSUMO',
        grossQuantity: 5.0,
        netQuantity: 5.0,
        technicalShrinkPct: 0.0,
      ),
    ],
  );

  setUpAll(() {
    registerFallbackValue(FakeProductionOrderDocument());
  });

  setUp(() {
    inventoryRepository = MockInventoryRepository();
    alertService = MockAlertService();
    authRepository = MockAuthRepository();
    printerAdapter = MockPrinterAdapter();

    movementEngine = MovementEngineImpl(inventoryRepository, alertService);

    when(() => inventoryRepository.getActiveInsumos())
        .thenAnswer((_) async => initialInsumos);
    when(() => inventoryRepository.getActiveProducts())
        .thenAnswer((_) async => [recipeProduct]);
    when(() => inventoryRepository.getRecipeVersionDocuments('prod-syrup'))
        .thenAnswer((_) async => [recipeVersion]);
    when(() => inventoryRepository.getRecipeVersionDocumentById('rv-syrup-v1'))
        .thenAnswer((_) async => recipeVersion);
    when(() => inventoryRepository.getProductionOrderDocuments())
        .thenAnswer((_) async => <ProductionOrderDocument>[]);

    when(() => inventoryRepository.getInsumoById('ins-sugar'))
        .thenAnswer((_) async => initialInsumos[0]);
    when(() => inventoryRepository.getInsumoById('ins-water'))
        .thenAnswer((_) async => initialInsumos[1]);
    when(() => inventoryRepository.getInsumoById('ins-syrup'))
        .thenAnswer((_) async => initialInsumos[2]);
    when(() => inventoryRepository.getInsumosByIds(any()))
        .thenAnswer((_) async => initialInsumos);

    when(() => inventoryRepository.saveProductionCloseTransaction(any(), any()))
        .thenAnswer((invocation) async {
      final doc = invocation.positionalArguments[0] as ProductionOrderDocument;
      when(() => inventoryRepository.getProductionOrderDocuments())
          .thenAnswer((_) async => [doc]);
    });

    viewModel = ProductionOrderViewModel(
      inventoryRepository,
      movementEngine,
      authRepository: authRepository,
      printer: printerAdapter,
      terminalIdProvider: () => 'POS-DEV-01',
      createId: () => 'prod-doc-12345',
      clock: () => DateTime(2026, 8, 27, 10, 0),
    );
  });

  Widget createTestWidget() {
    return MaterialApp(
      home: ChangeNotifierProvider<ProductionOrderViewModel>.value(
        value: viewModel,
        child: const ProductionOrderView(),
      ),
    );
  }

  testWidgets('E2E Production Flow: Open dialog, close batch, verify movements, and print BOH FIFO label', (tester) async {
    tester.view.physicalSize = const Size(800, 1280);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(createTestWidget());
    await tester.pumpAndSettle();

    // 1. Verify initial UI state
    expect(find.text('Producción BOH'), findsOneWidget);
    expect(find.text('CONFIRMAR Y CERRAR ORDEN'), findsOneWidget);

    // 2. Open production modal
    await tester.tap(find.text('CONFIRMAR Y CERRAR ORDEN'));
    await tester.pumpAndSettle();

    expect(find.text('Cerrar producción'), findsOneWidget);

    // 3. Select recipe version
    await tester.tap(find.byType(DropdownButtonFormField<RecipeVersionDocument>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Jarabe Simple de la Casa • V1').last);
    await tester.pumpAndSettle();

    // 4. Select produced insumo
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Jarabe Simple de la Casa').last);
    await tester.pumpAndSettle();

    // 5. Verify auto-generated fields
    expect(find.text('LOTE-20260827-001'), findsOneWidget);
    // Expiration date (7 days lifetime -> 2026-09-03)
    expect(find.text('2026-09-03'), findsOneWidget);
    expect(find.textContaining('Rendimiento dentro de tolerancia'), findsOneWidget);

    // 6. Submit production closure
    final closeButton = find.widgetWithText(FilledButton, 'CERRAR ORDEN');
    expect(closeButton, findsOneWidget);
    await tester.tap(closeButton);
    await tester.pumpAndSettle();

    // 7. Verify transaction persisted and detail card displayed
    verify(() => inventoryRepository.saveProductionCloseTransaction(
      any(that: isA<ProductionOrderDocument>().having(
        (doc) => doc.producedBatchNumber,
        'producedBatchNumber',
        'LOTE-20260827-001',
      )),
      any(that: isA<List<InventoryMovement>>().having(
        (movs) => movs.length,
        'movements length',
        3, // 2 raw ingredient deductions + 1 produced batch addition
      )),
    )).called(1);

    expect(find.textContaining('LOTE-20260827-001'), findsWidgets);

    // 8. Print BOH FIFO Thermal Label
    final printButton = find.byIcon(Icons.print);
    expect(printButton, findsOneWidget);

    await tester.tap(printButton);
    await tester.pumpAndSettle();

    expect(printerAdapter.lastPrintedText, contains('ETIQUETA DE PRODUCCION'));
    expect(printerAdapter.lastPrintedText, contains('CONTROL FIFO / INOCUIDAD'));
    expect(printerAdapter.lastPrintedText, contains('Jarabe Simple de la Casa'));
    expect(printerAdapter.lastPrintedText, contains('LOTE-20260827-001'));
    expect(printerAdapter.lastPrintedText, contains('10.00 lt'));
    expect(printerAdapter.lastPrintedBytes, isNotNull);
    expect(find.text('Viñeta de producción enviada a impresora'), findsOneWidget);
  });
}
