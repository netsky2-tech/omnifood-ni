import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';

/// Persistent blocking banner for the FX rate guard (#805 U4).
///
/// When checkout is blocked because a recorded exchange rate is missing or
/// unverifiable, the directive Spanish reason is rendered HERE — inside the
/// cart panel, directly above the EN ESPERA / COBRAR row — instead of only
/// as a transient SnackBar that the cart panel overlays.
///
/// The banner is authoritative and non-dismissible: it reads the
/// non-consuming [SaleViewModel.fxCheckoutBlockReason] getter, so it stays
/// visible across rebuilds and never pushes into the transient SnackBar
/// channel (`SaleViewModel.errorMessage`), which remains reserved for the
/// other error paths. Retry/sync is the only cashier-side action, because
/// the FX fields are owner/manager-only; there is deliberately no dismiss
/// button — a blocking condition must not be dismissible.
class FxRateBlockBanner extends StatelessWidget {
  const FxRateBlockBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final reason = viewModel.fxCheckoutBlockReason;
    if (reason == null) {
      return const SizedBox.shrink();
    }

    // Blocking (error) surface, not informational amber: this must read as
    // "you cannot sell until this is fixed", matching the directive copy.
    return Container(
      key: const Key('fx_rate_block_banner'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade400, width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.error_outline,
            color: Colors.red.shade900,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              reason,
              style: TextStyle(
                color: Colors.red.shade900,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              minimumSize: const Size(0, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: () => viewModel.loadExchangeRates(),
            child: Text(
              'Reintentar',
              style: TextStyle(
                color: Colors.red.shade900,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
