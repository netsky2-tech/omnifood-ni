import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:provider/provider.dart';

import 'box_opening_usd_float_test.mocks.dart';

@GenerateNiceMocks([
  MockSpec<SaleViewModel>(),
  MockSpec<CashShiftViewModel>(),
])

/// D-21: the box-opening screen (`APERTURA DE CAJA`) must collect BOTH the
/// NIO and the USD initial float, mirroring `open_shift_dialog.dart`, and
/// forward both to `SaleViewModel.openSession`.
///
/// D-16 contract: controllers start EMPTY; '0.00' is only a hint.
void main() {
  late MockSaleViewModel mockViewModel;
  late MockCashShiftViewModel mockCashShiftViewModel;

  setUp(() {
    mockViewModel = MockSaleViewModel();
    mockCashShiftViewModel = MockCashShiftViewModel();
    when(mockViewModel.currentUserRole).thenReturn(UserRole.cashier);
  });

  Widget buildTestApp() {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SaleViewModel>.value(value: mockViewModel),
        ChangeNotifierProvider<CashShiftViewModel>.value(
          value: mockCashShiftViewModel,
        ),
      ],
      child: const MaterialApp(
        home: Scaffold(body: BoxOpeningContent()),
      ),
    );
  }

  testWidgets(
    'box opening shows both float inputs starting empty with 0.00 hints (D-16/D-21)',
    (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      final nioField = tester.widget<TextField>(
        find.byKey(const Key('box_opening_nio_input')),
      );
      final usdField = tester.widget<TextField>(
        find.byKey(const Key('box_opening_usd_input')),
      );

      expect(nioField.controller!.text, isEmpty);
      expect(usdField.controller!.text, isEmpty);
      expect(nioField.decoration!.hintText, '0.00');
      expect(usdField.decoration!.hintText, '0.00');
    },
  );

  testWidgets(
    'ABRIR CAJA forwards both NIO and USD floats to openSession (D-21)',
    (tester) async {
      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('box_opening_nio_input')),
        '1000',
      );
      await tester.enterText(
        find.byKey(const Key('box_opening_usd_input')),
        '80',
      );
      await tester.tap(find.text('ABRIR CAJA'));
      await tester.pumpAndSettle();

      verify(mockViewModel.openSession(1000, balanceUsd: 80)).called(1);
    },
  );
}
