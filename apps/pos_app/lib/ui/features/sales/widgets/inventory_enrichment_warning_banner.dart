import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../data/database/app_database.dart';
import '../../../../domain/repositories/sales/sales_repository.dart';
import '../../../../domain/services/inventory/authority_hydration_status.dart';

/// Warning-only informational banner displayed when local sales have been
/// completed with `APPLIED_INVENTORY_PENDING` outcome.
///
/// CRITICAL INVARIANT (Q80 Section D4):
/// Excluded from `SALE_READY`, activation, setup completion, and checkout
/// blocking predicates. Never blocks cashier checkout, DGI invoicing, or offline operations.
///
/// #519 U5: when the pending count is visible AND this terminal has never
/// completed a recipe-authority hydration (`notHydrated`), the banner says
/// so plainly: the sales shown as pending are pending because this terminal
/// never received its recipe authority, not because a recipe is genuinely
/// unpublished. Row presence is the primary evidence, so a terminal whose
/// authority tables are full stays silent even if its most recent pull was
/// refused. The message is informational only and does not change what
/// the pending count means, this banner's polling cadence, or any checkout
/// predicate — the Q80 exclusion above still holds verbatim.
class InventoryEnrichmentWarningBanner extends StatefulWidget {
  final int? initialPendingCount;

  /// Injectable classifier for tests. When null, the status is built from
  /// the provided [AppDatabase]; any failure degrades to the plain
  /// pending-count message and never crashes or blocks the screen.
  final AuthorityHydrationStatus? hydrationStatus;

  const InventoryEnrichmentWarningBanner({
    super.key,
    this.initialPendingCount,
    this.hydrationStatus,
  });

  @override
  State<InventoryEnrichmentWarningBanner> createState() =>
      _InventoryEnrichmentWarningBannerState();
}

class _InventoryEnrichmentWarningBannerState
    extends State<InventoryEnrichmentWarningBanner> {
  int _pendingCount = 0;
  AuthorityHydrationState? _hydrationState;
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
      // #519 U5: same best-effort refresh path and cadence as the count.
      final state = await _resolveHydrationState();
      if (mounted && (count != _pendingCount || state != _hydrationState)) {
        setState(() {
          _pendingCount = count;
          _hydrationState = state;
        });
      }
    } catch (_) {
      // Best-effort warning refresh; never crash or block UI
    }
  }

  Future<AuthorityHydrationState?> _resolveHydrationState() async {
    try {
      final status = widget.hydrationStatus ??
          AuthorityHydrationStatus(
            readConfig: (key) async => (await context
                  .read<AppDatabase>()
                  .localConfigDao
                  .getConfigByKey(key))
              ?.value,
            countAuthorityInsumos: (tenantId) => context
                .read<AppDatabase>()
                .authorityProjectionDao
                .countInsumosByTenant(tenantId),
          );
      return await status.classify();
    } catch (_) {
      // Absence of a readable status means absence of the notHydrated
      // message; the plain pending-count copy still renders.
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pendingCount <= 0) {
      return const SizedBox.shrink();
    }

    // #519 U5: notHydrated is its own state, never folded into "empty".
    // hydrated and hydratedEmpty keep the existing pending-count message.
    final isNotHydrated = _hydrationState == AuthorityHydrationState.notHydrated;
    final message = isNotHydrated
        ? '$_pendingCount ventas con inventario pendiente de enriquecer: '
            'este terminal todavía no ha recibido su autoridad de recetas, '
            'por lo que sus ventas no mueven inventario. Sincronice este '
            'terminal para recibirla.'
        : '$_pendingCount ventas con inventario pendiente de enriquecer (operación de venta normal activa)';

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
              message,
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
