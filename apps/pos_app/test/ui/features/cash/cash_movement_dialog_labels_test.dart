import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/cash_movement_dialog.dart';

class _MockCashierSessionDao extends Mock implements CashierSessionDao {}

class _MockCashMovementDao extends Mock implements CashMovementDao {}

/// D-14/#12: the movement type dropdown must show the localized Spanish
/// label and NEVER the raw enum code. The dropdown `value:` codes
/// (CASH_IN / PETTY_CASH / SAFE_DROP / CASH_OUT) are the persistence
/// contract and stay untouched — only the displayed text changes.
void main() {
  testWidgets(
    'D-14: movement type dropdown shows Spanish labels without the raw code',
    (tester) async {
      final viewModel = CashShiftViewModel(
        sessionDao: _MockCashierSessionDao(),
        movementDao: _MockCashMovementDao(),
      );

      await tester.pumpWidget(
        ChangeNotifierProvider<CashShiftViewModel>.value(
          value: viewModel,
          child: const MaterialApp(
            home: Scaffold(body: CashMovementDialog()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // The selected item already renders the localized label.
      expect(find.text('🟢 Ingreso Menudo'), findsWidgets);

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();

      expect(find.text('🟢 Ingreso Menudo'), findsWidgets);
      expect(find.text('🔴 Gasto Menor'), findsOneWidget);
      expect(find.text('🟡 Retiro a Bóveda'), findsOneWidget);
      expect(find.text('🔴 Egreso Efectivo'), findsOneWidget);

      // No raw enum code leaks anywhere in the dialog.
      expect(find.textContaining('CASH_IN'), findsNothing);
      expect(find.textContaining('PETTY_CASH'), findsNothing);
      expect(find.textContaining('SAFE_DROP'), findsNothing);
      expect(find.textContaining('CASH_OUT'), findsNothing);
    },
  );
}
