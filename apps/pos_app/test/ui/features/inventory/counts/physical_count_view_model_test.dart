import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view_model.dart';

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
    parLevel: 3,
  );

  const beef = Insumo(
    id: 'beef',
    name: 'Carne de Res',
    consumptionUom: 'KG',
    stock: 20,
    averageCost: 150,
    isBatchManaged: true,
  );

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
    when(() => repository.getCountSessionDocuments())
        .thenAnswer((_) async => storedSessions);
    when(() => repository.saveCountSessionDocument(any()))
        .thenAnswer((invocation) async {
      storedSessions = [invocation.positionalArguments.first as CountSessionDocument];
    });
  });

  test('startSession freezes the theoretical baseline from active insumos', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );

    expect(viewModel.availableInsumos, hasLength(1));
    expect(viewModel.sessions, hasLength(1));
    expect(viewModel.sessions.first.status, CountSessionStatus.open);
    expect(viewModel.sessions.first.lines.single.theoreticalQuantity, 10);
  });

  test('recordCount preserves disputed first count and recount approval candidate', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 9,
      disputed: true,
      notes: 'Jarra incompleta',
    );
    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 10,
      notes: 'Reconteo gerente',
    );

    final line = viewModel.selectedSession!.lines.single;
    expect(viewModel.selectedSession!.status, CountSessionStatus.recount);
    expect(line.entries, hasLength(2));
    expect(line.entries.first.disputed, isTrue);
    expect(line.approvedEntryIndex, 1);
    expect(line.approvedCountedQuantity, 10);
    expect(line.variance, 0);
  });

  test('approveAndPostSession records only compensating adjustments linked to the session', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(() => repository.getInsumoById('milk')).thenAnswer((_) async => milk);
    when(
      () => movementEngine.recordAdjustment(
        'milk',
        -2,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).thenAnswer((_) async {});

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 8,
      notes: 'Faltante real',
    );
    await viewModel.requestApproval(sessionId);
    await viewModel.approveSession(sessionId);
    await viewModel.postSession(sessionId);

    verify(
      () => movementEngine.recordAdjustment(
        'milk',
        -2,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).called(1);
    expect(viewModel.selectedSession!.status, CountSessionStatus.posted);
    expect(viewModel.selectedSession!.movementReferences, hasLength(1));
    expect(viewModel.selectedSession!.lines.single.variance, -2);
  });

  test('postSession rejects a count without variance', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;
    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 10,
    );
    await viewModel.requestApproval(sessionId);
    await viewModel.approveSession(sessionId);

    expect(
      () => viewModel.postSession(sessionId),
      throwsArgumentError,
    );
  });

  test('recordCount preserves lot identification in the entry (A-01)', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[beef]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 25,
      batchId: 'batch-beef-01',
      batchNumber: 'LOT-BEEF-2026',
      notes: 'Sobrante en estante 3',
    );

    final line = viewModel.selectedSession!.lines.single;
    expect(line.isBatchManaged, isTrue);
    expect(line.entries.single.batchId, equals('batch-beef-01'));
    expect(line.entries.single.batchNumber, equals('LOT-BEEF-2026'));
    expect(line.variance, equals(5.0));
  });

  test('getBatchesForInsumo delegates to repository getBatchesByInsumoId', () async {
    final now = DateTime(2026, 6, 2);
    final batch = Batch(
      id: 'batch-1',
      insumoId: 'beef',
      batchNumber: 'LOTE-01',
      expirationDate: now.add(const Duration(days: 30)),
      remainingStock: 20,
      cost: 150,
    );
    when(() => repository.getBatchesByInsumoId('beef'))
        .thenAnswer((_) async => [batch]);

    final result = await viewModel.getBatchesForInsumo('beef');
    expect(result, hasLength(1));
    expect(result.first.batchNumber, equals('LOTE-01'));
    verify(() => repository.getBatchesByInsumoId('beef')).called(1);
  });

  test('CS-03: postSession rejects positive variance on a lot-managed insumo without lot', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[beef]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    // Count 25 kg when theoretical was 20 kg (positive variance +5 kg) without declaring lot
    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 25,
    );
    await viewModel.requestApproval(sessionId);
    await viewModel.approveSession(sessionId);

    final errors = viewModel.validateSessionBeforePosting(sessionId);
    expect(errors, isNotEmpty);
    expect(errors.first, contains('Carne de Res'));
    expect(errors.first, contains('sobrante'));

    expect(
      () => viewModel.postSession(sessionId),
      throwsA(isA<StateError>().having(
        (e) => e.message,
        'message',
        contains('Carne de Res'),
      )),
    );
  });

  test('CS-02: postSession accepts positive variance on a lot-managed insumo when lot is declared', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[beef]);
    when(
      () => movementEngine.recordAdjustment(
        'beef',
        5,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).thenAnswer((_) async {});

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 25,
      batchId: 'batch-beef-01',
      batchNumber: 'LOT-BEEF-2026',
    );
    await viewModel.requestApproval(sessionId);
    await viewModel.approveSession(sessionId);

    final errors = viewModel.validateSessionBeforePosting(sessionId);
    expect(errors, isEmpty);

    await viewModel.postSession(sessionId);

    verify(
      () => movementEngine.recordAdjustment(
        'beef',
        5,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).called(1);
    expect(viewModel.selectedSession!.status, CountSessionStatus.posted);
  });

  test('CS-03: postSession allows positive variance on a non-lot-managed insumo without lot', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(
      () => movementEngine.recordAdjustment(
        'milk',
        2,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).thenAnswer((_) async {});

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;
    final lineId = viewModel.sessions.single.lines.single.id;

    // Positive variance on milk (not lot managed)
    await viewModel.recordCount(
      sessionId: sessionId,
      lineId: lineId,
      countedQuantity: 12,
    );
    await viewModel.requestApproval(sessionId);
    await viewModel.approveSession(sessionId);

    final errors = viewModel.validateSessionBeforePosting(sessionId);
    expect(errors, isEmpty);

    await viewModel.postSession(sessionId);

    verify(
      () => movementEngine.recordAdjustment(
        'milk',
        2,
        any(),
        movementId: any(named: 'movementId'),
      ),
    ).called(1);
    expect(viewModel.selectedSession!.status, CountSessionStatus.posted);
  });

  test('startSession rejects creating a second active session for the same warehouse', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );

    expect(viewModel.hasActiveSessionForWarehouse('wh-1'), isTrue);

    // Attempting to start another session for the same warehouse must throw StateError
    await expectLater(
      viewModel.startSession(
        warehouseId: 'wh-1',
        warehouseName: 'Bodega Central',
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('cancelSession closes an active session and unblocks new session creation', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;

    expect(viewModel.hasActiveSessionForWarehouse('wh-1'), isTrue);

    await viewModel.cancelSession(sessionId);

    expect(viewModel.selectedSession!.status, CountSessionStatus.closed);
    expect(viewModel.hasActiveSessionForWarehouse('wh-1'), isFalse);

    // Now startSession succeeds because the previous one is closed
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    expect(viewModel.hasActiveSessionForWarehouse('wh-1'), isTrue);
  });

  test('requestApproval rejects a session where zero lines were counted', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);

    await viewModel.loadInitialData();
    await viewModel.startSession(
      warehouseId: 'wh-1',
      warehouseName: 'Bodega Central',
    );
    final sessionId = viewModel.sessions.single.id;

    // No lines counted yet
    await expectLater(
      viewModel.requestApproval(sessionId),
      throwsA(isA<StateError>()),
    );
  });
}
