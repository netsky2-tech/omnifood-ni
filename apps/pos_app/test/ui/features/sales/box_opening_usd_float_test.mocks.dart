// D-21: hand-written Mockito mocks in the same shape build_runner emits,
// limited to the members these tests exercise. build_runner's full
// regeneration was skipped deliberately to avoid touching generated files
// outside this test's scope (it would rewrite ~107 generated outputs).
import 'dart:async';

import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart' as cash_session;
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart'
    as sale_vm;
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart' as cash_vm;

/// A class which mocks [sale_vm.SaleViewModel].
class MockSaleViewModel extends Mock implements sale_vm.SaleViewModel {
  @override
  Future<void> openSession(
    double? balance, {
    double? balanceUsd,
    cash_session.CashSessionModel? tipoModelo =
        cash_session.CashSessionModel.cajaCentral,
  }) =>
      (super.noSuchMethod(
        Invocation.method(
          #openSession,
          [balance],
          {#balanceUsd: balanceUsd, #tipoModelo: tipoModelo},
        ),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      ) as Future<void>);
}

/// A class which mocks [cash_vm.CashShiftViewModel].
class MockCashShiftViewModel extends Mock implements cash_vm.CashShiftViewModel {
  @override
  Future<void> init() =>
      (super.noSuchMethod(
        Invocation.method(#init, []),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      ) as Future<void>);
}
