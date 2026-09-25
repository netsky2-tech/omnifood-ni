import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart';
import 'package:pos_app/ui/features/sales/sales_permissions.dart';

/// D-15: the void gate is a conjunction of three predicates (own invoice +
/// open current shift + same local calendar date). The denial REASON is part
/// of the contract: the UI renders each one differently.
void main() {
  group('SalesPermission resolver', () {
    test('owner and manager hold the full-void capability and reprint (D-13)',
        () {
      expect(resolveSalesPermissions(UserRole.owner),
          [SalesPermission.voidAnyInvoice, SalesPermission.reprintDocument]);
      expect(resolveSalesPermissions(UserRole.manager),
          [SalesPermission.voidAnyInvoice, SalesPermission.reprintDocument]);
    });

    test('cashier holds the own-current-shift capability and reprint (D-15/D-13)',
        () {
      expect(resolveSalesPermissions(UserRole.cashier), [
        SalesPermission.voidOwnCurrentShiftSale,
        SalesPermission.reprintDocument,
      ]);
    });

    test('reprint permission value and grant matrix (D-13: solo-operator kiosks)',
        () {
      expect(SalesPermission.reprintDocument, 'sales.reprint.document');
      expect(
          hasSalesPermission(UserRole.cashier, SalesPermission.reprintDocument),
          isTrue);
      expect(
          hasSalesPermission(UserRole.owner, SalesPermission.reprintDocument),
          isTrue);
      expect(
          hasSalesPermission(UserRole.manager, SalesPermission.reprintDocument),
          isTrue);
      expect(
          hasSalesPermission(UserRole.waiter, SalesPermission.reprintDocument),
          isFalse);
    });

    test('waiter and anonymous hold nothing', () {
      expect(resolveSalesPermissions(UserRole.waiter), isEmpty);
      expect(resolveSalesPermissions(null), isEmpty);
    });

    test('constants carry the directive namespace', () {
      expect(
        SalesPermission.voidOwnCurrentShiftSale,
        'sales.void.own_current_shift',
      );
      expect(SalesPermission.voidAnyInvoice, 'sales.void.any');
    });
  });

  VoidDecision evaluate({
    UserRole? actorRole = UserRole.cashier,
    String? actorUserId = 'cashier-1',
    String? invoiceUserId = 'cashier-1',
    String? invoiceShiftId = 'shift-1',
    String? invoiceLocalIssueDate = '2026-09-24',
    DateTime? invoiceCreatedAt,
    String? currentShiftId = 'shift-1',
    DateTime? comparedTo,
  }) =>
      evaluateVoidRequest(
        actorCanVoidAny: hasSalesPermission(
            actorRole, SalesPermission.voidAnyInvoice),
        actorCanVoidOwnCurrentShift: hasSalesPermission(
            actorRole, SalesPermission.voidOwnCurrentShiftSale),
        actorUserId: actorUserId,
        invoiceUserId: invoiceUserId,
        invoiceShiftId: invoiceShiftId,
        invoiceLocalIssueDate: invoiceLocalIssueDate,
        invoiceCreatedAt:
            invoiceCreatedAt ?? DateTime(2026, 9, 24, 0, 15),
        currentShiftId: currentShiftId,
        comparedTo: comparedTo ?? DateTime(2026, 9, 24, 0, 20),
      );

  group('evaluateVoidRequest — permission predicate', () {
    test('waiter and anonymous are denied regardless of the other predicates',
        () {
      expect(evaluate(actorRole: UserRole.waiter),
          VoidDecision.deniedNotPermitted);
      expect(evaluate(actorRole: null), VoidDecision.deniedNotPermitted);
    });

    test('notPermitted wins even when every other predicate would pass',
        () {
      expect(
        evaluate(actorRole: UserRole.waiter, invoiceUserId: 'waiter-1'),
        VoidDecision.deniedNotPermitted,
      );
    });
  });

  group('evaluateVoidRequest — owner/manager bypass (D-10/D-11, D-14 bound)', () {
    test('void.any bypasses ownInvoice and shift predicates for same-date invoices',
        () {
      expect(
        evaluate(
          actorRole: UserRole.manager,
          actorUserId: 'manager-1',
          invoiceUserId: 'cashier-1',
          invoiceShiftId: 'shift-old',
          invoiceLocalIssueDate: '2026-09-24',
          invoiceCreatedAt: DateTime(2026, 9, 24, 9, 0),
          currentShiftId: 'shift-1',
        ),
        VoidDecision.allowed,
      );
      expect(
        evaluate(
          actorRole: UserRole.owner,
          actorUserId: 'owner-1',
          invoiceUserId: 'cashier-1',
          invoiceShiftId: 'shift-other',
          invoiceLocalIssueDate: '2026-09-24',
          invoiceCreatedAt: DateTime(2026, 9, 24, 8, 0),
          currentShiftId: 'shift-1',
        ),
        VoidDecision.allowed,
      );
    });

    test('D-14 is categorical: owner with a cross-day invoice is deniedCrossDay',
        () {
      // JD-B-001/A-004: the bypass can no longer override the date predicate.
      expect(
        evaluate(
          actorRole: UserRole.owner,
          actorUserId: 'owner-1',
          invoiceUserId: 'cashier-1',
          invoiceShiftId: 'shift-1',
          invoiceLocalIssueDate: '2026-09-01',
          invoiceCreatedAt: DateTime(2026, 9, 1, 21, 0),
          currentShiftId: 'shift-1',
        ),
        VoidDecision.deniedCrossDay,
      );
    });
  });

  group('evaluateVoidRequest — own-invoice predicate (cashier path)', () {
    test('another user invoice is deniedOwnInvoice even in the same shift',
        () {
      expect(
        evaluate(invoiceUserId: 'cashier-2'),
        VoidDecision.deniedOwnInvoice,
      );
    });

    test('null invoice user is deniedOwnInvoice (cannot prove ownership)',
        () {
      expect(evaluate(invoiceUserId: null), VoidDecision.deniedOwnInvoice);
    });
  });

  group('evaluateVoidRequest — local calendar date predicate (D-12/D-14)',
      () {
    test('D-12 worked example: issued 23/09 21:40, void at 24/09 00:20',
        () {
      expect(
        evaluate(
          invoiceShiftId: 'shift-1',
          invoiceLocalIssueDate: '2026-09-23',
          invoiceCreatedAt: DateTime(2026, 9, 23, 21, 40),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        VoidDecision.deniedCrossDay,
      );
    });

    test('issued 24/09 00:15, void at 24/09 00:20 is allowed', () {
      expect(
        evaluate(
          invoiceShiftId: 'shift-1',
          invoiceLocalIssueDate: '2026-09-24',
          invoiceCreatedAt: DateTime(2026, 9, 24, 0, 15),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        VoidDecision.allowed,
      );
    });

    test('cross-day denies BEFORE the shift predicates (D-14 is categorical)',
        () {
      // A ticket from yesterday in a shift that cannot be proven: the
      // operator gets the D-14 admin-flow message, not the shift one.
      expect(
        evaluate(
          invoiceShiftId: null,
          invoiceLocalIssueDate: '2026-09-23',
          invoiceCreatedAt: DateTime(2026, 9, 23, 21, 40),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        VoidDecision.deniedCrossDay,
      );
    });
  });

  group('evaluateVoidRequest — shift predicate', () {
    test('legacy row without shift tracking is deniedShiftUnknown', () {
      // Nearly unreachable in practice: pre-migration rows are historical,
      // so the date test denies them first. Denied conservatively anyway.
      expect(
        evaluate(
          invoiceShiftId: null,
          invoiceLocalIssueDate: null,
          invoiceCreatedAt: DateTime(2026, 9, 24, 0, 15),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        VoidDecision.deniedShiftUnknown,
      );
    });

    test('no comparable open session is deniedShiftUnknown', () {
      expect(
        evaluate(currentShiftId: null),
        VoidDecision.deniedShiftUnknown,
      );
    });

    test('a different open shift is deniedOtherShift', () {
      expect(
        evaluate(
          invoiceShiftId: 'shift-old',
          currentShiftId: 'shift-new',
        ),
        VoidDecision.deniedOtherShift,
      );
    });
  });

  group('evaluateVoidRequest — the happy path', () {
    test('own invoice + same open shift + same local date is allowed', () {
      expect(evaluate(), VoidDecision.allowed);
    });
  });
}
