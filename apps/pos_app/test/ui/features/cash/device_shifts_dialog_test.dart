import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view.dart';
import 'package:pos_app/ui/features/cash/widgets/device_shifts_dialog.dart';

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
  });

  setUp(() {
    mockSessionDao = _MockCashierSessionDao();
    mockMovementDao = _MockCashMovementDao();
    viewModel = CashShiftViewModel(
      sessionDao: mockSessionDao,
      movementDao: mockMovementDao,
      currentUserId: 'current-user-1',
      currentUserName: 'Dueño Administrador',
      currentTerminalId: 'term-main',
      currentUserRole: UserRole.owner,
      openAccountsLoader: () async => const [],
    );
  });

  Widget buildTestableWidget(Widget child) {
    return MaterialApp(
      home: Scaffold(
        body: ChangeNotifierProvider<CashShiftViewModel>.value(
          value: viewModel,
          child: child,
        ),
      ),
    );
  }

  group('DeviceShiftsDialog (Issue #940)', () {
    testWidgets('renders empty state when there are no open shifts on terminal',
        (tester) async {
      when(() => mockSessionDao.getActiveSessionForUserAndTerminal(any(), any()))
          .thenAnswer((_) async => null);
      when(() => mockSessionDao.getOpenSessionsForTerminal(any()))
          .thenAnswer((_) async => []);

      await viewModel.init();

      await tester.pumpWidget(
        buildTestableWidget(
          const DeviceShiftsDialog(usersById: {}),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Turnos Abiertos en este Dispositivo'), findsOneWidget);
      expect(
          find.text('No hay turnos abiertos en este dispositivo'), findsOneWidget);
    });

    testWidgets(
        'lists open shifts distinguishing active operator from orphaned shifts',
        (tester) async {
      final activeShift = CashierSessionEntity(
        id: 'shift-active',
        userId: 'current-user-1',
        cashierName: 'Dueño Administrador',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 20.0,
        expectedNio: 1000.0,
        expectedUsd: 20.0,
        isClosed: false,
      );
      final orphanShift = CashierSessionEntity(
        id: 'shift-orphan',
        userId: 'other-user',
        cashierName: 'Cajero Anterior',
        terminalId: 'term-main',
        openedAt: 1715900000000,
        openingBalanceNio: 500.0,
        openingBalanceUsd: 10.0,
        expectedNio: 500.0,
        expectedUsd: 10.0,
        isClosed: false,
        notes: 'Turno abandonado',
      );

      when(() => mockSessionDao.getActiveSessionForUserAndTerminal(any(), any()))
          .thenAnswer((_) async => activeShift);
      when(() => mockMovementDao.getMovementsByShiftId(any()))
          .thenAnswer((_) async => []);
      when(() => mockSessionDao.getOpenSessionsForTerminal('term-main'))
          .thenAnswer((_) async => [activeShift, orphanShift]);

      await viewModel.init();

      await tester.pumpWidget(
        buildTestableWidget(
          const DeviceShiftsDialog(usersById: {
            'current-user-1': 'Dueño Administrador',
            'other-user': 'Cajero Anterior',
          }),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Dueño Administrador'), findsOneWidget);
      expect(find.text('Turno Activo Actual'), findsOneWidget);

      expect(find.text('Cajero Anterior'), findsOneWidget);
      expect(find.text('Turno Huérfano / Otro Operador'), findsOneWidget);
      expect(find.text('Cierre Administrativo con Motivo'), findsOneWidget);
    });

    testWidgets(
        'AdministrativeCloseShiftDialog enforces mandatory reason validation',
        (tester) async {
      final orphanShift = CashierSessionEntity(
        id: 'shift-orphan-2',
        userId: 'other-user',
        cashierName: 'Cajero Ausente',
        terminalId: 'term-main',
        openedAt: 1715900000000,
        openingBalanceNio: 500.0,
        openingBalanceUsd: 10.0,
        expectedNio: 500.0,
        expectedUsd: 10.0,
        isClosed: false,
      );

      await tester.pumpWidget(
        buildTestableWidget(
          AdministrativeCloseShiftDialog(
            shift: orphanShift,
            cashierDisplayName: 'Cajero Ausente',
            viewModel: viewModel,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cierre Administrativo de Turno'), findsOneWidget);
      expect(find.text('Confirmar y Emitir Corte Z'), findsOneWidget);

      // Attempt to submit with empty reason
      await tester.tap(find.text('Confirmar y Emitir Corte Z'));
      await tester.pumpAndSettle();

      expect(
          find.text('El motivo es obligatorio para auditar el cierre.'),
          findsOneWidget);
    });

    testWidgets(
        'CashShiftView displays orphan warning banner in empty state when orphans exist',
        (tester) async {
      final orphanShift = CashierSessionEntity(
        id: 'shift-orphan-3',
        userId: 'cashier-left',
        cashierName: 'Operador Anterior',
        terminalId: 'term-main',
        openedAt: 1715900000000,
        openingBalanceNio: 600.0,
        openingBalanceUsd: 0.0,
        expectedNio: 600.0,
        expectedUsd: 0.0,
        isClosed: false,
      );

      when(() => mockSessionDao.getActiveSessionForUserAndTerminal(any(), any()))
          .thenAnswer((_) async => null);
      when(() => mockSessionDao.getOpenSessionsForTerminal('term-main'))
          .thenAnswer((_) async => [orphanShift]);

      await viewModel.init();

      await tester.pumpWidget(
        buildTestableWidget(
          const CashShiftView(),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Existen 1 turno(s) abierto(s) por otro operador'),
        findsOneWidget,
      );
      expect(find.text('Gestionar Turnos del Dispositivo'), findsOneWidget);
    });
  });
}
