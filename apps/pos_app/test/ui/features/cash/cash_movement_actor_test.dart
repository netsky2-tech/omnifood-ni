import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/cash_movement_dialog.dart';
import 'package:provider/provider.dart';

// D-13: the cash movement dialog used to stamp `authorizedByUserId:
// 'user-manager'` — a NON-EXISTENT user — on every PETTY_CASH/SAFE_DROP
// movement. There IS no authorization step in a food-park kiosk (the owner
// explicitly ruled out a PIN gate: the operator buys ice on the spot while
// the owner is absent), so nobody authorizes the movement and the field
// must be null. The REAL operator attribution already exists through
// `shift_id -> cashier_sessions.user_id`: a movement can only be recorded
// on the active shift of the acting user.
//
// These tests pin the contract: `authorizedByUserId` is ALWAYS null for
// every movement type (uniform contract — no type gets a fabricated
// identity), while validation behavior and close-on-success stay green.

class _MockCashShiftViewModel extends Mock implements CashShiftViewModel {}

void main() {
  late _MockCashShiftViewModel vm;

  setUpAll(() {
    registerFallbackValue(0.0); // double args
    registerFallbackValue(''); // String args
  });

  setUp(() {
    vm = _MockCashShiftViewModel();
    when(() => vm.recordMovement(
          type: any(named: 'type'),
          amountNio: any(named: 'amountNio'),
          amountUsd: any(named: 'amountUsd'),
          reason: any(named: 'reason'),
          authorizedByUserId: any(named: 'authorizedByUserId'),
        )).thenAnswer((_) async => true);
  });

  Future<void> pumpHost(WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<CashShiftViewModel>.value(
        value: vm,
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => const CashMovementDialog(),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Opens the dialog, selects [typeCode] in the dropdown, fills valid
  /// amount + reason, and taps 'Guardar Movimiento'.
  Future<void> submitMovement(
    WidgetTester tester,
    String typeCode,
    String typeLabel,
  ) async {
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining(typeLabel).last);
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('cash_movement_nio_input')), '100');
    await tester.enterText(
        find.byKey(const Key('cash_movement_reason_input')), 'Compra de hielo');
    await tester.tap(find.text('Guardar Movimiento'));
    await tester.pumpAndSettle();
  }

  group('D-13: cash movement actor attribution', () {
    testWidgets('PETTY_CASH: authorizedByUserId is null (no fabricated '
        'identity)', (tester) async {
      await pumpHost(tester);
      await submitMovement(tester, 'PETTY_CASH', 'Gasto Menor');

      verify(() => vm.recordMovement(
            type: 'PETTY_CASH',
            amountNio: 100.0,
            amountUsd: 0.0,
            reason: 'Compra de hielo',
            authorizedByUserId: null,
          )).called(1);
    });

    testWidgets('SAFE_DROP: authorizedByUserId is null (no fabricated '
        'identity)', (tester) async {
      await pumpHost(tester);
      await submitMovement(tester, 'SAFE_DROP', 'Retiro a Bóveda');

      verify(() => vm.recordMovement(
            type: 'SAFE_DROP',
            amountNio: 100.0,
            amountUsd: 0.0,
            reason: 'Compra de hielo',
            authorizedByUserId: null,
          )).called(1);
    });

    testWidgets('CASH_IN: authorizedByUserId stays null (uniform contract)',
        (tester) async {
      await pumpHost(tester);
      await submitMovement(tester, 'CASH_IN', 'Ingreso Menudo');

      verify(() => vm.recordMovement(
            type: 'CASH_IN',
            amountNio: 100.0,
            amountUsd: 0.0,
            reason: 'Compra de hielo',
            authorizedByUserId: null,
          )).called(1);
    });

    testWidgets('CASH_OUT: authorizedByUserId stays null (uniform contract)',
        (tester) async {
      await pumpHost(tester);
      await submitMovement(tester, 'CASH_OUT', 'Egreso Efectivo');

      verify(() => vm.recordMovement(
            type: 'CASH_OUT',
            amountNio: 100.0,
            amountUsd: 0.0,
            reason: 'Compra de hielo',
            authorizedByUserId: null,
          )).called(1);
    });
  });

  group('D-13: existing behavior stays green', () {
    testWidgets('validation: amount must be > 0, recordMovement not called',
        (tester) async {
      await pumpHost(tester);
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const Key('cash_movement_reason_input')), 'Compra de hielo');
      await tester.tap(find.text('Guardar Movimiento'));
      await tester.pumpAndSettle();

      expect(
          find.text('Debes ingresar un monto mayor a 0 en al menos una moneda.'),
          findsOneWidget);
      verifyNever(() => vm.recordMovement(
            type: any(named: 'type'),
            amountNio: any(named: 'amountNio'),
            amountUsd: any(named: 'amountUsd'),
            reason: any(named: 'reason'),
            authorizedByUserId: any(named: 'authorizedByUserId'),
          ));
    });

    testWidgets('validation: reason is required, recordMovement not called',
        (tester) async {
      await pumpHost(tester);
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const Key('cash_movement_nio_input')), '100');
      await tester.tap(find.text('Guardar Movimiento'));
      await tester.pumpAndSettle();

      expect(find.text('El motivo o justificación es obligatorio.'),
          findsOneWidget);
      verifyNever(() => vm.recordMovement(
            type: any(named: 'type'),
            amountNio: any(named: 'amountNio'),
            amountUsd: any(named: 'amountUsd'),
            reason: any(named: 'reason'),
            authorizedByUserId: any(named: 'authorizedByUserId'),
          ));
    });

    testWidgets('success closes the dialog', (tester) async {
      await pumpHost(tester);
      await submitMovement(tester, 'CASH_IN', 'Ingreso Menudo');

      expect(find.byType(CashMovementDialog), findsNothing);
      expect(find.text('Nuevo Movimiento de Caja'), findsNothing);
    });
  });
}
