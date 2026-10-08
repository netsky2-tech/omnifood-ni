import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';

/// Persistent blocking banner inside the cart panel (#805 U4 + R-4).
///
/// Two reasons can occupy the banner, resolved via
/// [SaleViewModel.checkoutBlockReason]:
///
/// 1. The FX rate guard (`SaleViewModel.fxCheckoutBlockReason`): checkout is
///    blocked because a recorded exchange rate is missing or unverifiable.
///    The directive Spanish reason renders HERE — directly above the
///    EN ESPERA / COBRAR row — instead of only as a transient SnackBar that
///    the cart panel overlays. This reason is authoritative and
///    non-dismissible: the only cashier-side action is 'Reintentar'
///    (reload rates), because the FX fields are owner/manager-only; there is
///    deliberately no dismiss — a blocking condition must not be dismissible.
///
/// 2. A general checkout failure (`SaleViewModel._lastCheckoutError`,
///    e.g. missing recipe, fiscal sequence error, database exception):
///    rendered in the same slot so the error is never limited to the
///    transient SnackBar channel. It is dismissed via the 'Descartar'
///    action (or implicitly when the cart changes / the next sale succeeds).
class FxRateBlockBanner extends StatelessWidget {
  const FxRateBlockBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<SaleViewModel>();
    final reason = viewModel.checkoutBlockReason;
    if (reason == null) {
      return const SizedBox.shrink();
    }

    final isFxRateBlock = viewModel.fxCheckoutBlockReason != null;

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
            onPressed: isFxRateBlock
                ? () => viewModel.loadExchangeRates()
                : viewModel.clearCheckoutError,
            child: Text(
              isFxRateBlock ? 'Reintentar' : 'Descartar',
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
