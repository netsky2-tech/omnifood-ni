import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/sales/shift_membership.dart';

void main() {
  group('classifyShiftMembership', () {
    test('returns sameShift when the invoice belongs to the current shift',
        () async {
      expect(
        classifyShiftMembership(
          invoiceShiftId: 'shift-1',
          currentShiftId: 'shift-1',
        ),
        ShiftMembership.sameShift,
      );
    });

    test(
        'returns differentShift when the invoice belongs to another shift id',
        () async {
      expect(
        classifyShiftMembership(
          invoiceShiftId: 'shift-1',
          currentShiftId: 'shift-2',
        ),
        ShiftMembership.differentShift,
      );
    });

    test(
        'returns differentShift for the cashier\'s own earlier shift (id comparison)',
        () async {
      // Same cashier, previous shift: the id differs, so the sale is not in
      // his current shift. Policy for this case belongs to the guard (B1a-2).
      expect(
        classifyShiftMembership(
          invoiceShiftId: 'shift-old',
          currentShiftId: 'shift-new',
        ),
        ShiftMembership.differentShift,
      );
    });

    test('returns unknown when the invoice predates shift membership',
        () async {
      // Historical rows can never be backfilled (D-9): a null shiftId is a
      // missing fact, not evidence of a different shift.
      expect(
        classifyShiftMembership(
          invoiceShiftId: null,
          currentShiftId: 'shift-1',
        ),
        ShiftMembership.unknown,
      );
    });

    test('returns unknown when no comparable open session exists', () async {
      expect(
        classifyShiftMembership(
          invoiceShiftId: 'shift-1',
          currentShiftId: null,
        ),
        ShiftMembership.unknown,
      );
    });

    test('returns unknown when both facts are missing', () async {
      expect(
        classifyShiftMembership(
          invoiceShiftId: null,
          currentShiftId: null,
        ),
        ShiftMembership.unknown,
      );
    });

    test('treats empty strings as missing facts, not as different shifts',
        () async {
      expect(
        classifyShiftMembership(
          invoiceShiftId: '',
          currentShiftId: 'shift-1',
        ),
        ShiftMembership.unknown,
      );
      expect(
        classifyShiftMembership(
          invoiceShiftId: 'shift-1',
          currentShiftId: '',
        ),
        ShiftMembership.unknown,
      );
    });
  });
}
