import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/repositories/sales/sales_repository.dart';

/// Warning-only informational banner displayed when local sales have been
/// completed with `APPLIED_INVENTORY_PENDING` outcome.
///
/// CRITICAL INVARIANT (Q80 Section D4):
/// Excluded from `SALE_READY`, activation, setup completion, and checkout
/// blocking predicates. Never blocks cashier checkout, DGI invoicing, or offline operations.
class InventoryEnrichmentWarningBanner extends StatefulWidget {
  final int? initialPendingCount;

  const InventoryEnrichmentWarningBanner({super.key, this.initialPendingCount});

  @override
  State<InventoryEnrichmentWarningBanner> createState() =>
      _InventoryEnrichmentWarningBannerState();
}

class _InventoryEnrichmentWarningBannerState
    extends State<InventoryEnrichmentWarningBanner> {
  int _pendingCount = 0;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _pendingCount = widget.initialPendingCount ?? 0;
    if (widget.initialPendingCount == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _refreshPendingCount();
      });
      _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
        _refreshPendingCount();
      });
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshPendingCount() async {
    if (!mounted) return;
    try {
      final repository = context.read<SalesRepository>();
      final count = await repository.getInventoryEnrichmentPendingCount();
      if (mounted && count != _pendingCount) {
        setState(() {
          _pendingCount = count;
        });
      }
    } catch (_) {
      // Best-effort warning refresh; never crash or block UI
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pendingCount <= 0) {
      return const SizedBox.shrink();
    }

    return Container(
      key: const Key('inventory_enrichment_warning_banner'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade400, width: 1),
      ),
      child: Row(
        children: [
          Icon(
            Icons.warning_amber_rounded,
            color: Colors.amber.shade800,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$_pendingCount ventas con inventario pendiente de enriquecer (operación de venta normal activa)',
              style: TextStyle(
                color: Colors.amber.shade900,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
