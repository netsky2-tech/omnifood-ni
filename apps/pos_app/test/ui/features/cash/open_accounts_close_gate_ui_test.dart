import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/x_report_dialog.dart';

/// T8/T9 UI: the Control de Caja entry must surface the open-accounts hard
/// block (listing each account with line count and total, no continuation),
/// and the Corte X must LIST the open accounts without blocking.
///
/// Widget tests run in the FakeAsync zone, so a real Floor database cannot
/// answer here; the stub mirrors `_StubCashShiftViewModel` from
/// sale_view_security_flows_test.dart. The DATABASE-backed behaviour of the
/// gate (throws, writes nothing, burns no Z) is proven in
/// open_accounts_close_gate_test.dart.
class _StubSessionDao implements CashierSessionDao {
  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

class _StubMovementDao implements CashMovementDao {
  @override
  dynamic noSuchMethod(Invocation invocation) => UnimplementedError();
}

class _StubCashShiftViewModel extends CashShiftViewModel {
  _StubCashShiftViewModel({this.stubbedOpenAccounts = const []})
      : super(
          sessionDao: _StubSessionDao(),
          movementDao: _StubMovementDao(),
        );

  final List<HoldTicket> stubbedOpenAccounts;

  @override
  Future<void> init() async {}

  @override
  CashierSessionEntity? get activeShift => CashierSessionEntity(
        id: 'shift-1',
        userId: 'user-cajero-1',
        terminalId: 'term-main',
        openedAt: 1716000000000,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 0.0,
        expectedNio: 1000.0,
        expectedUsd: 0.0,
        isClosed: false,
        syncStatus: 'pending',
      );

  @override
  bool get hasActiveShift => true;

  @override
  List<CashMovementEntity> get movements => const [];

  @override
  List<HoldTicket> get openAccounts => stubbedOpenAccounts;

  @override
  bool get hasOpenAccounts => stubbedOpenAccounts.isNotEmpty;

  @override
  int get openAccountsCount => stubbedOpenAccounts.length;

  @override
  double get openAccountsTotalNio => stubbedOpenAccounts.fold(
      0.0, (sum, t) => sum + t.items.fold(0.0, (s, i) => s + i.grossAmount));
}

HoldTicket _account({String name = 'Mesa 3'}) => HoldTicket(
      id: 'hold-1',
      name: name,
      createdAt: DateTime(2026, 2, 1),
      items: const [
        CartItem(
          productId: 'p-1',
          productName: 'Bebida',
          quantity: 1,
          unitPrice: 220.0,
          taxRate: 0.15,
        ),
        CartItem(
          productId: 'p-2',
          productName: 'Snack',
          quantity: 1,
          unitPrice: 220.0,
          taxRate: 0.15,
        ),
      ],
    );

void main() {
  group('T8: Control de Caja entry — open-accounts hard block', () {
    testWidgets(
        'shows the block naming account, line count and total, and offers no continuation',
        (tester) async {
      final vm = _StubCashShiftViewModel(
        stubbedOpenAccounts: [_account()],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider<CashShiftViewModel>.value(
          value: vm,
          child: const MaterialApp(home: CashShiftView()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cerrar Turno (Corte Z)'));
      await tester.pumpAndSettle();

      // The block dialog names each account with its line count and total.
      expect(
          find.text('Bloqueo de Corte Z — Cuentas Abiertas'), findsOneWidget);
      expect(find.textContaining('Mesa 3'), findsOneWidget);
      expect(find.textContaining('2 líneas'), findsOneWidget);
      expect(find.textContaining('C\$ 440.00'), findsOneWidget);
      expect(find.text('ENTENDIDO'), findsOneWidget);

      // No continuation: the blind-count dialog never opens.
      expect(find.text('Arqueo Ciego y Cierre de Turno'), findsNothing);

      // The only action acknowledges; no override, no "close anyway".
      await tester.tap(find.text('ENTENDIDO'));
      await tester.pumpAndSettle();
      expect(find.text('Arqueo Ciego y Cierre de Turno'), findsNothing);
      expect(vm.hasActiveShift, isTrue);
    });
  });

  group('T9: Corte X lists open accounts without blocking', () {
    Widget buildX(CashShiftViewModel vm) {
      return ChangeNotifierProvider<CashShiftViewModel>.value(
        value: vm,
        child: MaterialApp(
          home: Scaffold(
            body: XReportDialog(
              shift: vm.activeShift!,
              movements: vm.movements,
              effectiveExpectedNio: vm.effectiveExpectedNio,
              effectiveExpectedUsd: vm.effectiveExpectedUsd,
              openAccountsCount: vm.openAccountsCount,
              openAccountsTotalNio: vm.openAccountsTotalNio,
            ),
          ),
        ),
      );
    }

    testWidgets(
        'shows the open-account count and total line, and the shift stays open',
        (tester) async {
      final vm = _StubCashShiftViewModel(
        stubbedOpenAccounts: [_account()],
      );

      await tester.pumpWidget(buildX(vm));
      await tester.pumpAndSettle();

      expect(find.text('Cuentas abiertas'), findsOneWidget);
      expect(find.text('1 · C\$ 440.00'), findsOneWidget);

      // The X is read-only — its only action is 'Cerrar Lectura' and it has
      // no write surface; the shift remains open (also proven by the e2e at
      // cash_shift_e2e_flow_test.dart, X-reading step).
      expect(find.text('Cerrar Lectura'), findsOneWidget);
      expect(vm.hasActiveShift, isTrue);
      expect(vm.activeShift!.isClosed, isFalse);
    });

    testWidgets('renders no open-accounts line when there are none',
        (tester) async {
      final vm = _StubCashShiftViewModel();

      await tester.pumpWidget(buildX(vm));
      await tester.pumpAndSettle();

      expect(find.text('Cuentas abiertas'), findsNothing);
    });
  });
}
