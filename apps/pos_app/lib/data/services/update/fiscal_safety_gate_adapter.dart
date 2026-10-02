import '../../../domain/ports/fiscal_safety_gate_port.dart';

/// Default adapter implementing [FiscalSafetyGatePort] by querying active cart,
/// in-flight sales, and cash register shift state.
///
/// Follows fail-closed semantics: if shift state cannot be determined, it
/// treats the shift as open to prevent restarting during an unverified state.
class FiscalSafetyGateAdapter implements FiscalSafetyGatePort {
  FiscalSafetyGateAdapter({
    bool Function()? hasActiveCart,
    bool Function()? isSaleInFlight,
    Future<bool> Function()? checkOpenShift,
  })  : _hasActiveCart = hasActiveCart ?? (() => false),
        _isSaleInFlight = isSaleInFlight ?? (() => false),
        _checkOpenShift = checkOpenShift ?? (() async => false);

  final bool Function() _hasActiveCart;
  final bool Function() _isSaleInFlight;
  final Future<bool> Function() _checkOpenShift;

  @override
  Future<FiscalSafetyVerdict> evaluateSafety() async {
    final reasons = <FiscalBlockReason>[];

    if (_hasActiveCart()) {
      reasons.add(FiscalBlockReason.cartNotEmpty);
    }

    if (_isSaleInFlight()) {
      reasons.add(FiscalBlockReason.saleInFlight);
    }

    try {
      final hasOpen = await _checkOpenShift();
      if (hasOpen) {
        reasons.add(FiscalBlockReason.shiftOpen);
      }
    } catch (_) {
      // Fail closed: if checking shift state threw an error, do not allow restart
      reasons.add(FiscalBlockReason.shiftOpen);
    }

    if (reasons.isEmpty) {
      return const FiscalGateClear();
    }
    return FiscalGateBlocked(reasons: reasons);
  }
}
