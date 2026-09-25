/// B1a-4 (D-11): tri-state shift (turno) membership of an invoice relative to
/// the cashier's current open shift, for the void guard (B1a-2) to consume.
///
/// A boolean would collapse "unknown" into "different": invoices created
/// before shift membership existed, and sales made with no open session, have
/// a null shiftId — which is a missing fact, not evidence that the sale
/// belongs to a different shift. Deciding policy for unknown facts belongs to
/// the guard, not to this classifier, so it refuses to answer with two states.
library;

enum ShiftMembership {
  /// The invoice was made in the cashier's current open shift.
  sameShift,

  /// The invoice was made in a different shift (another cashier's, or the
  /// same cashier's earlier shift — the comparison is by session id).
  differentShift,

  /// No comparable facts: the invoice's shiftId is null (pre-migration row,
  /// or sale made with no open session), or there is no comparable open
  /// session. The guard must decide its own policy for this case.
  unknown,
}

/// Classifies whether [invoiceShiftId] belongs to the cashier's current shift
/// [currentShiftId]. Both parameters are nullable and empty strings are
/// treated as missing facts. Compare session ids, never user/terminal: the
/// caller resolves the comparable open session before invoking this.
ShiftMembership classifyShiftMembership({
  String? invoiceShiftId,
  String? currentShiftId,
}) {
  final invoiceShift = invoiceShiftId;
  if (invoiceShift == null || invoiceShift.isEmpty) {
    return ShiftMembership.unknown;
  }
  final currentShift = currentShiftId;
  if (currentShift == null || currentShift.isEmpty) {
    return ShiftMembership.unknown;
  }
  return invoiceShift == currentShift
      ? ShiftMembership.sameShift
      : ShiftMembership.differentShift;
}
