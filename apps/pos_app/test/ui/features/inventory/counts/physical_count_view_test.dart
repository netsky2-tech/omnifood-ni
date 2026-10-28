import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
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

    expect(find.text('Conteo Físico / Ajustes'), findsOneWidget);
    expect(find.text('INICIAR CONTEO FÍSICO'), findsOneWidget);
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
    expect(find.text('Estado: Aplicada'), findsAtLeastNWidgets(1));
    expect(find.text('Estado: posted'), findsNothing);
    expect(find.textContaining('Variación aprobada: -2.00 L'), findsOneWidget);
    expect(find.textContaining('Referencias de ajuste: 1'), findsOneWidget);
  });

  testWidgets('lot-managed line shows POR LOTES badge and requires lot on surplus count', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    const beef = Insumo(
      id: 'beef',
      name: 'Carne de Res',
      consumptionUom: 'KG',
      stock: 20,
      averageCost: 150,
      isBatchManaged: true,
    );
    final batch = Batch(
      id: 'batch-01',
      insumoId: 'beef',
      batchNumber: 'LOT-BEEF-001',
      expirationDate: DateTime(2026, 7, 1),
      remainingStock: 20,
      cost: 150,
    );

    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const [beef]);
    when(() => repository.getBatchesByInsumoId('beef')).thenAnswer((_) async => [batch]);

    storedSessions = [
      CountSessionDocument(
        id: 'count-beef',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.open,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 10),
        lines: const [
          CountSessionLineDocument(
            id: 'line-beef',
            insumoId: 'beef',
            insumoName: 'Carne de Res',
            uom: 'KG',
            theoreticalQuantity: 20,
            isBatchManaged: true,
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    // Verify badge POR LOTES is visible
    expect(find.text('POR LOTES'), findsOneWidget);

    // Tap "Registrar conteo"
    await tester.tap(find.text('Registrar conteo'));
    await tester.pumpAndSettle();

    // Dialog opens with lot selector
    expect(find.byKey(const Key('count_entry_batch_select')), findsOneWidget);

    // Enter surplus quantity 25 (> theoretical 20)
    final countField = find.widgetWithText(TextField, 'Cantidad contada');
    await tester.enterText(countField, '25');
    await tester.pumpAndSettle();

    // Attempt to save without selecting lot -> validation error
    await tester.tap(find.text('Guardar conteo'));
    await tester.pumpAndSettle();

    expect(
      find.text('Debe seleccionar en qué lote se encuentra el sobrante para continuar.'),
      findsOneWidget,
    );

    // Now select the lot from dropdown
    await tester.tap(find.byKey(const Key('count_entry_batch_select')));
    await tester.pumpAndSettle();

    // Select the batch item
    await tester.tap(find.textContaining('LOT-BEEF-001').last);
    await tester.pumpAndSettle();

    // Save conteo
    await tester.tap(find.text('Guardar conteo'));
    await tester.pumpAndSettle();

    // Dialog closes and count is recorded with the lot
    expect(find.text('Guardar conteo'), findsNothing);
    expect(storedSessions.first.lines.single.entries.single.batchId, equals('batch-01'));
    expect(storedSessions.first.lines.single.entries.single.batchNumber, equals('LOT-BEEF-001'));
  });

  testWidgets('showPostingDialog warns when an approved surplus line lacks a declared lot', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    storedSessions = [
      CountSessionDocument(
        id: 'count-surplus',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.approved,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 11),
        lines: const [
          CountSessionLineDocument(
            id: 'line-beef',
            insumoId: 'beef',
            insumoName: 'Carne de Res',
            uom: 'KG',
            theoreticalQuantity: 20,
            approvedEntryIndex: 0,
            isBatchManaged: true,
            entries: [
              CountLineEntryDocument(countedQuantity: 25), // surplus without batchId
            ],
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    // Tap "Aplicar ajustes"
    await tester.tap(find.text('Aplicar ajustes'));
    await tester.pumpAndSettle();

    // Warning dialog appears
    expect(find.text('No se pueden aplicar los ajustes'), findsOneWidget);
    expect(find.textContaining('sobrante sin lote asignado'), findsOneWidget);
    expect(find.text('ENTENDIDO'), findsOneWidget);

    // Dismiss dialog
    await tester.tap(find.text('ENTENDIDO'));
    await tester.pumpAndSettle();

    expect(find.text('No se pueden aplicar los ajustes'), findsNothing);
  });

  testWidgets('lot-managed line without cached batches accepts manual lot number input', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    const beef = Insumo(
      id: 'beef',
      name: 'Carne de Res',
      consumptionUom: 'KG',
      stock: 20,
      averageCost: 150,
      isBatchManaged: true,
    );

    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const [beef]);
    when(() => repository.getBatchesByInsumoId('beef')).thenAnswer((_) async => []);

    storedSessions = [
      CountSessionDocument(
        id: 'count-beef',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.open,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 10),
        lines: const [
          CountSessionLineDocument(
            id: 'line-beef',
            insumoId: 'beef',
            insumoName: 'Carne de Res',
            uom: 'KG',
            theoreticalQuantity: 20,
            isBatchManaged: true,
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Registrar conteo'));
    await tester.pumpAndSettle();

    // Verify text field for manual lot input is present
    expect(find.byKey(const Key('count_entry_batch_text')), findsOneWidget);

    // Enter surplus quantity 25
    final countField = find.widgetWithText(TextField, 'Cantidad contada');
    await tester.enterText(countField, '25');
    await tester.pumpAndSettle();

    // Attempt to save without entering lot -> validation error
    await tester.tap(find.text('Guardar conteo'));
    await tester.pumpAndSettle();

    expect(
      find.text('Debe seleccionar en qué lote se encuentra el sobrante para continuar.'),
      findsOneWidget,
    );

    // Enter manual lot number
    final batchField = find.byKey(const Key('count_entry_batch_text'));
    await tester.enterText(batchField, 'LOT-R28-C-003');
    await tester.pumpAndSettle();

    // Save conteo
    await tester.tap(find.text('Guardar conteo'));
    await tester.pumpAndSettle();

    expect(find.text('Guardar conteo'), findsNothing);
    expect(storedSessions.first.lines.single.entries.single.batchNumber, equals('LOT-R28-C-003'));
  });

  testWidgets('supports search, filter chips, theoretical suggestion and +/- steppers in Nhilos count modal', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    storedSessions = [
      CountSessionDocument(
        id: 'count-multi',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.open,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 10),
        lines: const [
          CountSessionLineDocument(
            id: 'line-milk',
            insumoId: 'milk',
            insumoName: 'Leche Entera',
            uom: 'L',
            theoreticalQuantity: 10,
          ),
          CountSessionLineDocument(
            id: 'line-coffee',
            insumoId: 'coffee',
            insumoName: 'Café en Grano',
            uom: 'g',
            theoreticalQuantity: 500,
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    // Verify no redundant double card for single session: Bodega Central appears once
    expect(find.text('Bodega Central'), findsOneWidget);

    // Search filters lines
    await tester.enterText(find.byKey(const Key('count_lines_search_input')), 'Café');
    await tester.pumpAndSettle();
    expect(find.text('Café en Grano'), findsOneWidget);
    expect(find.text('Leche Entera'), findsNothing);

    // Clear search restores all lines
    await tester.tap(find.byKey(const Key('count_lines_search_clear')));
    await tester.pumpAndSettle();
    expect(find.text('Leche Entera'), findsOneWidget);

    // Open count modal for Leche Entera
    await tester.tap(find.text('Registrar conteo').first);
    await tester.pumpAndSettle();

    // Tap "Usar teórico" suggestion button -> fills 10 and shows 0.00 variance
    await tester.tap(find.byKey(const Key('count_entry_suggest_theoretical')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sin diferencia (Cuadra exacto)'), findsOneWidget);

    // Tap "+" stepper -> becomes 11 (+1.00 surplus)
    await tester.tap(find.byKey(const Key('count_entry_step_plus')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sobrante físico (+1.00 L)'), findsOneWidget);

    // Tap "-" stepper twice -> becomes 9 (-1.00 shortage)
    await tester.tap(find.byKey(const Key('count_entry_step_minus')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('count_entry_step_minus')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Faltante físico (-1.00 L)'), findsOneWidget);

    // Save count and verify toast notification appears
    await tester.tap(find.text('Guardar conteo'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Conteo registrado para Leche Entera'), findsOneWidget);
    expect(storedSessions.first.lines.first.entries.single.countedQuantity, equals(9));
  });

  testWidgets('cancels an active count session and updates status to closed', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    storedSessions = [
      CountSessionDocument(
        id: 'count-cancel',
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
        cutoffAt: DateTime(2026, 6, 2, 10, 30),
        status: CountSessionStatus.open,
        createdAt: DateTime(2026, 6, 2, 10),
        updatedAt: DateTime(2026, 6, 2, 10),
        lines: const [
          CountSessionLineDocument(
            id: 'line-milk',
            insumoId: 'milk',
            insumoName: 'Leche Entera',
            uom: 'L',
            theoreticalQuantity: 10,
          ),
        ],
      ),
    ];

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    // Verify "Descartar sesión de conteo" button is visible
    expect(find.text('Descartar sesión de conteo'), findsOneWidget);

    await tester.tap(find.text('Descartar sesión de conteo'));
    await tester.pumpAndSettle();

    // Dialog appears
    expect(find.text('¿Descartar sesión de conteo?'), findsOneWidget);
    expect(find.text('SÍ, DESCARTAR'), findsOneWidget);

    await tester.tap(find.text('SÍ, DESCARTAR'));
    await tester.pumpAndSettle();

    // Dialog is dismissed and session is closed
    expect(find.text('¿Descartar sesión de conteo?'), findsNothing);
    expect(storedSessions.first.status, equals(CountSessionStatus.closed));
  });
}
