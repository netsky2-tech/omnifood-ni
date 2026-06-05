import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
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
}
