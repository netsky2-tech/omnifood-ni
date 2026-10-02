import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';
import 'package:provider/provider.dart';

// D-15 (owner decision, 2026-10-02): closing with a blind-count difference
// needs NO threshold and NO authorization — the requirement is that the
// difference is RECORDED (difference_nio, Z variance table, cloud), which
// already happens. The dialog, however, still computed
// `hasHighVariance = diff > 100 C$ / 5 USD` and stamped the fabricated
// supervisor id 'supervisor-auth' — the same defect class as D-13: a
// nonexistent actor dressed up as an authorization. Nobody authorizes
// anything in this flow, so supervisorId must always be null.
//
// This test pins the contract with a HIGH variance (the case that used to
// trigger the stamp): closeShiftWithBlindCount must be called with
// supervisorId: null.

class _MockCashShiftViewModel extends Mock implements CashShiftViewModel {}

class _MockSaleViewModel extends Mock implements SaleViewModel {}

void main() {
  late _MockCashShiftViewModel vm;
  late _MockSaleViewModel saleVm;

  setUpAll(() {
    registerFallbackValue(0.0);
    registerFallbackValue('');
  });

  setUp(() {
    vm = _MockCashShiftViewModel();
    saleVm = _MockSaleViewModel();

    final activeShift = CashierSessionEntity(
      id: 'shift-1',
      userId: 'user-cajero-1',
      openedAt: DateTime(2026, 1, 1).millisecondsSinceEpoch,
      openingBalance: 1125.0,
    );

    when(() => vm.activeShift).thenReturn(activeShift);
    when(() => vm.refreshSalesCash()).thenAnswer((_) async {});
    when(() => vm.effectiveExpectedNio).thenReturn(1125.0);
    when(() => vm.effectiveExpectedUsd).thenReturn(0.0);
    when(() => vm.lastClosedShift).thenReturn(null);
    when(() => vm.errorMessage).thenReturn(null);
    when(() => vm.isLoading).thenReturn(false);
    when(() => vm.closeShiftWithBlindCount(
          countedNio: any(named: 'countedNio'),
          countedUsd: any(named: 'countedUsd'),
          notes: any(named: 'notes'),
          supervisorId: any(named: 'supervisorId'),
        )).thenAnswer((_) async => true);
    when(() => saleVm.checkActiveSession()).thenAnswer((_) async {});
  });

  Future<void> pumpHost(WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<CashShiftViewModel>.value(value: vm),
          ChangeNotifierProvider<SaleViewModel>.value(value: saleVm),
        ],
        child: const MaterialApp(home: Scaffold(body: _OpenButton())),
      ),
    );
  }

  Future<void> openCloseDialog(WidgetTester tester) async {
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  group('D-15: close-with-difference records, never fabricates an authorizer', () {
    testWidgets(
        'high variance (C\$1125 difference) still closes with supervisorId null',
        (tester) async {
      await pumpHost(tester);
      await openCloseDialog(tester);

      // Counted 0 against an expected 1125 -> diff 1125, far above the old
      // 100 C$ threshold that used to stamp 'supervisor-auth'.
      await tester.enterText(
          find.byKey(const Key('close_shift_nio_counted_input')), '0');
      await tester.tap(find.text('Cerrar Turno (Corte Z)'));
      await tester.pumpAndSettle();

      verify(() => vm.closeShiftWithBlindCount(
            countedNio: 0.0,
            countedUsd: 0.0,
            notes: null,
            supervisorId: null,
          )).called(1);
    });

    testWidgets('small difference closes the same way (uniform contract)',
        (tester) async {
      await pumpHost(tester);
      await openCloseDialog(tester);

      await tester.enterText(
          find.byKey(const Key('close_shift_nio_counted_input')), '1100');
      await tester.tap(find.text('Cerrar Turno (Corte Z)'));
      await tester.pumpAndSettle();

      verify(() => vm.closeShiftWithBlindCount(
            countedNio: 1100.0,
            countedUsd: 0.0,
            notes: null,
            supervisorId: null,
          )).called(1);
    });

    testWidgets('negative counts are still rejected', (tester) async {
      await pumpHost(tester);
      await openCloseDialog(tester);

      await tester.enterText(
          find.byKey(const Key('close_shift_nio_counted_input')), '-5');
      await tester.tap(find.text('Cerrar Turno (Corte Z)'));
      await tester.pumpAndSettle();

      expect(find.text('Los montos contados no pueden ser negativos.'),
          findsOneWidget);
      verifyNever(() => vm.closeShiftWithBlindCount(
            countedNio: any(named: 'countedNio'),
            countedUsd: any(named: 'countedUsd'),
            notes: any(named: 'notes'),
            supervisorId: any(named: 'supervisorId'),
          ));
    });
  });
}

class _OpenButton extends StatelessWidget {
  const _OpenButton();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ElevatedButton(
        onPressed: () => showDialog<void>(
          context: context,
          builder: (_) => const CloseShiftDialog(),
        ),
        child: const Text('open'),
      ),
    );
  }
}
