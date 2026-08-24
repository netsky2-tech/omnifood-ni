import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view.dart';
import 'package:pos_app/ui/features/cash/widgets/open_shift_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/cash_movement_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/z_report_dialog.dart';

class _MockCashierSessionDao extends Mock implements CashierSessionDao {}
class _MockCashMovementDao extends Mock implements CashMovementDao {}

void main() {
  late _MockCashierSessionDao mockSessionDao;
  late _MockCashMovementDao mockMovementDao;
  late CashShiftViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(
      CashierSessionEntity(
        id: 'fallback-id',
        userId: 'fallback-user',
        terminalId: 'fallback-term',
        openedAt: 0,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 0.0,
        openingBalanceUsd: 0.0,
        expectedNio: 0.0,
        expectedUsd: 0.0,
        isClosed: false,
        syncStatus: 'pending',
      ),
    );
    registerFallbackValue(
      CashMovementEntity(
        id: 'fallback-mov',
        shiftId: 'fallback-shift',
        terminalId: 'fallback-term',
        type: 'CASH_IN',
        amountNio: 0.0,
        amountUsd: 0.0,
        reason: 'fallback',
        timestamp: 0,
        syncStatus: 'pending',
      ),
    );
  });

  setUp(() {
    mockSessionDao = _MockCashierSessionDao();
    mockMovementDao = _MockCashMovementDao();
    viewModel = CashShiftViewModel(
      sessionDao: mockSessionDao,
      movementDao: mockMovementDao,
      currentUserId: 'user-cajero-1',
      currentUserName: 'Juan Pérez',
      currentTerminalId: 'term-main',
    );
  });

  Widget buildApp(Widget child) {
    return ChangeNotifierProvider<CashShiftViewModel>.value(
      value: viewModel,
      child: MaterialApp(
        home: Scaffold(
          body: child,
        ),
      ),
    );
  }

  group('CashShiftView & Dialogs Widgets', () {
    testWidgets('renders empty state when no shift is active', (tester) async {
      when(() => mockSessionDao.getActiveSession()).thenAnswer((_) async => null);

      await viewModel.init();
      await tester.pumpWidget(buildApp(const CashShiftView()));
      await tester.pump();

      expect(find.text('No hay turno de caja abierto'), findsOneWidget);
      expect(find.text('Abrir Turno de Caja'), findsOneWidget);
    });

    testWidgets('renders active shift view with metrics and movements list',
        (tester) async {
      final activeSession = CashierSessionEntity(
        id: 'shift-1',
        userId: 'user-cajero-1',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1500.0,
        openingBalanceUsd: 50.0,
        expectedNio: 2000.0,
        expectedUsd: 50.0,
        isClosed: false,
        syncStatus: 'pending',
      );

      final movement = CashMovementEntity(
        id: 'mov-1',
        shiftId: 'shift-1',
        terminalId: 'term-main',
        type: 'CASH_IN',
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Ingreso de cambio menudo',
        timestamp: 1716001000000,
        syncStatus: 'pending',
      );

      when(() => mockSessionDao.getActiveSession())
          .thenAnswer((_) async => activeSession);
      when(() => mockMovementDao.getMovementsByShiftId('shift-1'))
          .thenAnswer((_) async => [movement]);

      await viewModel.init();
      await tester.pumpWidget(buildApp(const CashShiftView()));
      await tester.pump();

      expect(find.text('Turno Activo'), findsOneWidget);
      expect(find.text('Terminal: term-main'), findsOneWidget);
      expect(find.text('Fondo Inicial (C\$)'), findsOneWidget);
      expect(find.text('Fondo Inicial (\$ USD)'), findsOneWidget);
      expect(find.text('Esperado en Gaveta (C\$)'), findsOneWidget);
      expect(find.text('Esperado en Gaveta (\$ USD)'), findsOneWidget);
      expect(find.text('Cerrar Turno (Corte Z)'), findsOneWidget);

      // Verify movement in history
      expect(find.text('Ingreso de cambio menudo'), findsOneWidget);
      expect(find.textContaining('C\$ 500.00'), findsWidgets);
    });

    testWidgets('OpenShiftDialog allows entering float and opening shift',
        (tester) async {
      when(() => mockSessionDao.getActiveSession()).thenAnswer((_) async => null);
      when(() => mockSessionDao.insertSession(any())).thenAnswer((_) async {});

      await viewModel.init();
      await tester.pumpWidget(buildApp(const OpenShiftDialog()));
      await tester.pump();

      expect(find.text('Apertura de Turno de Caja'), findsOneWidget);
      expect(find.byKey(const Key('open_shift_nio_input')), findsOneWidget);
      expect(find.byKey(const Key('open_shift_usd_input')), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('open_shift_nio_input')), '2000');
      await tester.enterText(
          find.byKey(const Key('open_shift_usd_input')), '80');
      await tester.pump();

      await tester.tap(find.text('Confirmar Apertura'));
      await tester.pump();

      expect(viewModel.hasActiveShift, isTrue);
      expect(viewModel.activeShift!.openingBalanceNio, 2000.0);
      expect(viewModel.activeShift!.openingBalanceUsd, 80.0);
      verify(() => mockSessionDao.insertSession(any())).called(1);
    });

    testWidgets('CashMovementDialog allows entering amounts and recording movement',
        (tester) async {
      final activeSession = CashierSessionEntity(
        id: 'shift-1',
        userId: 'user-cajero-1',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 50.0,
        expectedNio: 1000.0,
        expectedUsd: 50.0,
        isClosed: false,
        syncStatus: 'pending',
      );

      final recordedMovements = <CashMovementEntity>[];

      when(() => mockSessionDao.getActiveSession())
          .thenAnswer((_) async => activeSession);
      when(() => mockMovementDao.getMovementsByShiftId('shift-1'))
          .thenAnswer((_) async => recordedMovements);
      when(() => mockMovementDao.insertMovement(any())).thenAnswer((inv) async {
        final mov = inv.positionalArguments[0] as CashMovementEntity;
        recordedMovements.add(mov);
      });
      when(() => mockSessionDao.updateSession(any())).thenAnswer((_) async {});

      await viewModel.init();
      await tester.pumpWidget(buildApp(const CashMovementDialog()));
      await tester.pump();

      expect(find.text('Nuevo Movimiento de Caja'), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('cash_movement_nio_input')), '250');
      await tester.enterText(
          find.byKey(const Key('cash_movement_reason_input')),
          'Compra de bolsas de papel');
      await tester.pump();

      await tester.tap(find.text('Guardar Movimiento'));
      await tester.pump();

      expect(viewModel.movements, hasLength(1));
      expect(viewModel.movements.first.reason, 'Compra de bolsas de papel');
      expect(viewModel.movements.first.amountNio, 250.0);
      verify(() => mockMovementDao.insertMovement(any())).called(1);
      verify(() => mockSessionDao.updateSession(any())).called(1);
    });

    testWidgets('CloseShiftDialog closes active shift with blind count and computes Z sequence',
        (tester) async {
      final activeSession = CashierSessionEntity(
        id: 'shift-1',
        userId: 'user-cajero-1',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 50.0,
        expectedNio: 1000.0,
        expectedUsd: 50.0,
        isClosed: false,
        syncStatus: 'pending',
      );

      when(() => mockSessionDao.getActiveSession())
          .thenAnswer((_) async => activeSession);
      when(() => mockMovementDao.getMovementsByShiftId('shift-1'))
          .thenAnswer((_) async => []);
      when(() => mockSessionDao.countClosedSessions()).thenAnswer((_) async => 0);
      when(() => mockSessionDao.updateSession(any())).thenAnswer((_) async {});

      await viewModel.init();
      await tester.pumpWidget(buildApp(const CloseShiftDialog()));
      await tester.pump();

      expect(find.text('Arqueo Ciego y Cierre de Turno'), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('close_shift_nio_counted_input')), '1050');
      await tester.enterText(
          find.byKey(const Key('close_shift_usd_counted_input')), '50');
      await tester.enterText(
          find.byKey(const Key('close_shift_notes_input')), 'Cierre sin novedades');
      await tester.pump();

      await tester.tap(find.text('Cerrar Turno (Corte Z)'));
      await tester.pump();

      expect(viewModel.hasActiveShift, isFalse);
      expect(viewModel.lastClosedShift, isNotNull);
      expect(viewModel.lastClosedShift!.zReportSequence, 1);
      expect(viewModel.lastClosedShift!.differenceNio, 50.0);
      expect(viewModel.lastClosedShift!.differenceUsd, 0.0);
      verify(() => mockSessionDao.updateSession(any())).called(1);
    });

    testWidgets('ZReportDialog renders formal DGI Z-sequence and discrepancy metrics',
        (tester) async {
      final closedSession = CashierSessionEntity(
        id: 'shift-1',
        userId: 'user-cajero-1',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        closedAt: 1716028800000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 50.0,
        closingCountedNio: 1050.0,
        closingCountedUsd: 50.0,
        expectedNio: 1000.0,
        expectedUsd: 50.0,
        differenceNio: 50.0,
        differenceUsd: 0.0,
        zReportSequence: 5,
        isClosed: true,
        supervisorId: 'sup-01',
        notes: 'Cierre de turno tarde',
        syncStatus: 'pending',
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ZReportDialog(shift: closedSession),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Reporte Fiscal Corte Z-0005'), findsOneWidget);
      expect(find.text('Z-0005'), findsOneWidget);
      expect(find.text('Terminal POS'), findsOneWidget);
      expect(find.text('term-main'), findsOneWidget);
      expect(find.text('user-cajero-1'), findsOneWidget);
      expect(find.text('sup-01'), findsOneWidget);
      expect(find.text('Fondo Inicial'), findsOneWidget);
      expect(find.text('Saldo Esperado'), findsOneWidget);
      expect(find.text('Conteo Ciego'), findsOneWidget);
      expect(find.text('Diferencia (Varianza)'), findsOneWidget);
      expect(find.text('Entendido / Cerrar Reporte'), findsOneWidget);
    });
  });
}
