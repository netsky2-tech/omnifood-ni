import 'package:pos_app/domain/models/user.dart';

import 'issue_date.dart';
import 'shift_membership.dart';

/// D-15: the void gate is a CONJUNCTION of three predicates (own invoice +
/// open current shift + same local calendar date). The denial REASON is part
/// of the contract: the UI renders each one differently, and each reason
/// maps to a different operator message.
///
/// Deliberately absent from this enum: a "deniedAlreadyCanceled" case.
/// Voiding a canceled invoice is an invariant violation, not an operator
/// facing policy denial — the UI hides the action for canceled invoices and
/// the repository rejects the re-entry with StateError. Adding it here would
/// invite the UI to render a policy message for a programming bug.
enum VoidDecision {
  allowed,

  /// The acting user is not the invoice's issuer and holds no broader gate.
  deniedOwnInvoice,

  /// D-14: previous-date void is prohibited outright and goes to the
  /// administrative flow. Categorical: evaluated before the shift predicates
  /// and independent of shift state.
  deniedCrossDay,

  /// Conservative denial when shift membership cannot be proven: the ticket
  /// predates shift tracking (null shiftId) or there is no comparable open
  /// session. Nearly unreachable in practice — pre-migration rows are
  /// historical, so the date test denies them first — denied anyway.
  deniedShiftUnknown,

  /// The invoice belongs to a proven, different shift than the open one.
  deniedOtherShift,

  /// The acting role holds no void capability at all (D-10: waiter never
  /// voids).
  deniedNotPermitted;

  bool get isAllowed => this == allowed;

  /// Neutral professional Spanish (usted) — the exact operator message.
  String get uiMessage => switch (this) {
        allowed => '',
        deniedOwnInvoice => 'Solo puede anular sus propias facturas.',
        deniedCrossDay =>
          'La anulación de días anteriores se realiza por el flujo administrativo.',
        deniedShiftUnknown =>
          'No se puede verificar el turno de esta factura. Solicite la anulación por el flujo administrativo.',
        deniedOtherShift =>
          'Solo puede anular facturas de su turno actual.',
        deniedNotPermitted => 'No tiene permiso para anular facturas.',
      };
}

/// Evaluates a void request against D-15. Pure and synchronous: both
/// classifiers (shift membership, local issue date) are pure functions, and
/// the caller resolves the comparable open session before invoking this
/// (scoped to the acting user + terminal). Permission flags are resolved by
/// the caller from [SalesPermission] so this domain file does not import UI.
///
/// Evaluation order (D-14 binding, JD-B-001/A-004): notPermitted →
/// crossDay (CATEGORICAL, every actor — D-14 prohibits voiding a previous-
/// date invoice outright; cross-day corrections are Backoffice credit
/// notes, so the broader void.any gate cannot override this predicate) →
/// void.any bypass (owner/manager keep bypassing the OWN-INVOICE and SHIFT
/// predicates for same-date invoices; their audit duty is preserved
/// downstream: hash-chained audit row + printed ANULADO copy) → ownInvoice
/// → shiftUnknown → otherShift → allowed.
VoidDecision evaluateVoidRequest({
  required bool actorCanVoidAny,
  required bool actorCanVoidOwnCurrentShift,
  required String? actorUserId,
  required String? invoiceUserId,
  required String? invoiceShiftId,
  required String? invoiceLocalIssueDate,
  required DateTime invoiceCreatedAt,
  required String? currentShiftId,
  required DateTime comparedTo,
}) {
  if (!actorCanVoidAny && !actorCanVoidOwnCurrentShift) {
    return VoidDecision.deniedNotPermitted;
  }
  // D-14 is categorical: previous-date void is prohibited for EVERY actor.
  // This predicate sits BEFORE the void.any bypass on purpose — the
  // Backoffice credit note (not a broader role) is the cross-day path.
  final dateCheck = classifyIssueDate(
    localIssueDate: invoiceLocalIssueDate,
    createdAt: invoiceCreatedAt,
    comparedTo: comparedTo,
  );
  if (dateCheck == IssueDateComparison.differentDate) {
    return VoidDecision.deniedCrossDay;
  }
  if (actorCanVoidAny) {
    return VoidDecision.allowed;
  }
  if (invoiceUserId == null || invoiceUserId != actorUserId) {
    return VoidDecision.deniedOwnInvoice;
  }
  final membership = classifyShiftMembership(
    invoiceShiftId: invoiceShiftId,
    currentShiftId: currentShiftId,
  );
  if (membership == ShiftMembership.unknown) {
    return VoidDecision.deniedShiftUnknown;
  }
  if (membership == ShiftMembership.differentShift) {
    return VoidDecision.deniedOtherShift;
  }
  return VoidDecision.allowed;
}

/// D-15/#525 AC-6/AC-7: the void reason is a controlled code list, mandatory
/// at the repository boundary; the operator may add free-text detail. The
/// code (not the detail) is the D-15 metrics hook — report it, do not build
/// a dashboard.
class VoidReasonCodes {
  static const errorDeCaptura = 'ERROR_DE_CAPTURA';
  static const clienteDesiste = 'CLIENTE_DESISTE';
  static const ticketDuplicado = 'TICKET_DUPLICADO';
  static const otro = 'OTRO';

  static const all = <String>[
    errorDeCaptura,
    clienteDesiste,
    ticketDuplicado,
    otro,
  ];
}

/// D-13/#547: reprint reason codes (mandatory, controlled) — the void
/// dialog pattern. Lives beside [VoidReasonCodes] because both are the
/// shared "controlled correction codes" module for the sales domain.
class ReprintReasonCodes {
  static const papelAtascado = 'PAPEL_ATASCADO';
  static const clientePerdioTicket = 'CLIENTE_PERDIO_TICKET';
  static const verificacion = 'VERIFICACION';
  static const otro = 'OTRO';

  static const all = <String>[
    papelAtascado,
    clientePerdioTicket,
    verificacion,
    otro,
  ];
}

/// D-13: named fail-closed denial for reprints of documents issued before
/// the fiscal header snapshot existed. There is NO fallback to live config:
/// reprinting under today's header would fabricate a legal document (the
/// 36.6241 failure mode applied to a legal document). No backfill either —
/// the historical values were never recorded.
const String reprintSnapshotUnavailableCode = 'REPRINT_SNAPSHOT_UNAVAILABLE';

/// Operator-facing Spanish message for [reprintSnapshotUnavailableCode].
const String reprintSnapshotUnavailableMessage =
    'Este documento es anterior al registro de cabecera fiscal; no puede reimprimirse fielmente.';
