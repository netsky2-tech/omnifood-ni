import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/repositories/sales/sales_repository.dart';

/// Informational banner: the sales the CLOUD applied while declaring that
/// part of the stock was not backed.
///
/// WHY IT EXISTS (FD-01, openspec/changes/fiscal-no-se-congela-por-inventario):
/// the cloud used to REJECT a sale whose outflow the lots could not cover, and
/// that rejection blocked the fiscal stream — every later sale stopped landing
/// in the cloud and the terminal's fiscal sequence froze. Now the invoice is
/// ALWAYS applied and the difference is DECLARED, so this terminal has
/// nothing to block and the difference waits to be reconciled in the
/// backoffice.
///
/// This banner says so to the operator, in plain words: the sale went
/// through, and there is something to reconcile.
///
/// CRITICAL INVARIANT (same as the enrichment banner): it NEVER blocks
/// checkout, the DGI invoicing, the shift close, or any offline operation.
/// It is a message, not a control. It renders nothing when the count is zero
/// — a healthy inventory is a healthy inventory, and a screen that always has
/// something in it is a screen nobody reads.
class InventoryDivergenceBanner extends StatefulWidget {
  /// Injectable count for tests. When null, the count is read from the
  /// repository; any failure degrades to rendering nothing and never crashes.
  final int? initialCount;

  const InventoryDivergenceBanner({super.key, this.initialCount});

  @override
  State<InventoryDivergenceBanner> createState() =>
      _InventoryDivergenceBannerState();
}

class _InventoryDivergenceBannerState extends State<InventoryDivergenceBanner> {
  int _count = 0;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _count = widget.initialCount ?? 0;
    if (widget.initialCount == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _refreshCount();
      });
      _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
        _refreshCount();
      });
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshCount() async {
    if (!mounted) return;
    try {
      final repository = context.read<SalesRepository>();
      final count = await repository.getInventoryDivergenceCount();
      if (mounted && count != _count) {
        setState(() => _count = count);
      }
    } catch (_) {
      // Best-effort: never crash and never block the register.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_count <= 0) {
      return const SizedBox.shrink();
    }

    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: colorScheme.tertiaryContainer,
      child: Row(
        children: [
          Icon(
            Icons.info_outline,
            size: 18,
            color: colorScheme.onTertiaryContainer,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$_count ventas se registraron con diferencias de inventario '
              'por conciliar. La venta quedó facturada; la conciliación se '
              'hace en el backoffice.',
              style: TextStyle(
                fontSize: 12,
                color: colorScheme.onTertiaryContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
