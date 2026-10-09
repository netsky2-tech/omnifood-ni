/// SOHO-P3 S1b: pure enforcement rules for the owner-configured manual
/// discount cap projected from the fiscal configuration.
///
/// Canonical rejection rule (mirrored verbatim from the backend fiscal-config
/// contract): a manual discount is ALLOWED only when it is less than or equal
/// to EVERY configured cap — `discount <= maxDiscountAmount` AND
/// `discount <= (maxDiscountPercent / 100) x gross subtotal`. Equivalently the
/// effective cap is the MINIMUM of the configured caps; a cap of 0 forbids ANY
/// manual discount; when both are null/absent the discount is NOT limited.
///
/// The service is role-blind on purpose (DD-2): the supervisor override
/// authorizes WHO may discount, while the cap is the owner's policy on HOW
/// MUCH. Authorization and policy are orthogonal, so this evaluation never
/// receives a role.
class ManualDiscountDecision {
  /// Whether the (accumulated) manual discount is within every configured cap.
  final bool allowed;

  /// Operator-visible Spanish rejection message. Null when [allowed].
  final String? rejectionMessage;

  /// The effective (binding) cap in C$ — the minimum of the configured caps,
  /// with the percent cap converted using the order's gross subtotal.
  /// Null when [allowed].
  final double? effectiveCap;

  /// Which cap bound the rejection: true = the amount cap, false = the
  /// percent cap. When both caps are violated the SMALLER effective cap
  /// binds; on an exact tie the amount cap binds (deterministic). Null when
  /// [allowed].
  final bool? boundByAmount;

  const ManualDiscountDecision._allowed()
      : allowed = true,
        rejectionMessage = null,
        effectiveCap = null,
        boundByAmount = null;

  const ManualDiscountDecision._rejected({
    required this.rejectionMessage,
    required this.effectiveCap,
    required this.boundByAmount,
  }) : allowed = false;
}

class DiscountPolicyService {
  const DiscountPolicyService();

  /// Evaluates a manual discount request against the configured caps.
  ///
  /// [requestedAmount] is the new amount being requested and
  /// [accumulatedManualDiscount] is what the order already carries (DD-3):
  /// the cap is evaluated against the RESULTING accumulated manual discount
  /// (`accumulatedManualDiscount + requestedAmount`), never against each
  /// request in isolation, so two successive under-cap requests cannot
  /// together exceed the cap.
  ///
  /// [grossSubtotal] is the order's GROSS subtotal from the fiscal
  /// calculation (it does not depend on discounts, so there is no circular
  /// dependency). [maxDiscountAmount] and [maxDiscountPercent] follow the
  /// wire contract: null = NO CAP; amount may be 0 (forbids all manual
  /// discounts); percent is in (0, 100].
  ManualDiscountDecision evaluateManualDiscount({
    required double requestedAmount,
    double accumulatedManualDiscount = 0.0,
    required double grossSubtotal,
    double? maxDiscountAmount,
    double? maxDiscountPercent,
  }) {
    // The percent cap in C$: percentage of the GROSS subtotal. With an empty
    // cart (gross 0) any configured percent cap collapses to 0 — the sale
    // screen disables the discount affordance on an empty cart, and refusing
    // to discount an order with no gross is the honest reading of the rule.
    final double? percentCapValue = maxDiscountPercent == null
        ? null
        : maxDiscountPercent / 100.0 * grossSubtotal;

    // Effective cap = the MINIMUM of the configured caps (null = no cap).
    double? effectiveCap = maxDiscountAmount;
    if (percentCapValue != null &&
        (effectiveCap == null || percentCapValue < effectiveCap)) {
      effectiveCap = percentCapValue;
    }

    final double resultingDiscount =
        accumulatedManualDiscount + requestedAmount;
    if (effectiveCap == null || resultingDiscount <= effectiveCap) {
      return const ManualDiscountDecision._allowed();
    }

    // Determine which cap bound the rejection: the smaller effective cap;
    // on a tie the amount cap (deterministic).
    final bool boundByAmount =
        maxDiscountAmount != null && maxDiscountAmount <= (percentCapValue ?? double.infinity);

    final String message;
    if (boundByAmount && maxDiscountAmount == 0) {
      // A configured amount cap of 0 forbids manual discounts entirely.
      message =
          'Los descuentos manuales no están permitidos en este negocio (límite: C\$ 0.00).';
    } else if (boundByAmount) {
      message =
          'Descuento no permitido: el límite manual es C\$ ${maxDiscountAmount!.toStringAsFixed(2)} (política del negocio por monto).';
    } else {
      // Percent-bound: the percent cap was configured and is the binding one.
      final configuredPercent = maxDiscountPercent!;
      message =
          'Descuento no permitido: el límite manual es C\$ ${effectiveCap!.toStringAsFixed(2)} (${_formatPercent(configuredPercent)}% del subtotal, política del negocio por porcentaje).';
    }

    return ManualDiscountDecision._rejected(
      rejectionMessage: message,
      effectiveCap: effectiveCap,
      boundByAmount: boundByAmount,
    );
  }

  String _formatPercent(double percent) =>
      percent % 1 == 0 ? percent.toStringAsFixed(0) : percent.toString();
}
