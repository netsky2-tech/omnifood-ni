/// Verdict on whether the terminal may safely offer or perform an update restart.
sealed class FiscalSafetyVerdict {
  const FiscalSafetyVerdict();
}

/// The terminal is fiscally quiet: no cart, no transaction in progress, and no
/// open cashier shift. Safe to proceed with an application restart/update.
class FiscalGateClear extends FiscalSafetyVerdict {
  const FiscalGateClear();
}

/// The terminal is in an active commercial or fiscal state.
///
/// An update restart during this state risks losing an in-flight sale, or leaving
/// an open cashier shift without reconciliation.
class FiscalGateBlocked extends FiscalSafetyVerdict {
  const FiscalGateBlocked({
    required this.reasons,
  });

  final List<FiscalBlockReason> reasons;

  String get summary => reasons.map((r) => r.description).join('; ');
}

enum FiscalBlockReason {
  cartNotEmpty(
    'Hay productos en el carrito de venta. Complete o descarte el carrito antes de actualizar.',
  ),
  saleInFlight(
    'Hay una transacción de venta o cobro en curso.',
  ),
  shiftOpen(
    'Hay un turno o sesión de caja abierta. Cierre la caja antes de actualizar la aplicación.',
  );

  const FiscalBlockReason(this.description);
  final String description;
}

/// Hexagonal port: guards against restarting the POS process during an active
/// fiscal or commercial operation (Rule R7 / Section E).
abstract interface class FiscalSafetyGatePort {
  /// Evaluates whether the terminal is in a safe state to update.
  Future<FiscalSafetyVerdict> evaluateSafety();
}
