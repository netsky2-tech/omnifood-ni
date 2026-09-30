import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../../core/localization/label_map.dart';
import '../../../../data/services/sync_service.dart';
import '../../../../data/services/network_connectivity_service.dart';

class CloudSyncStatusBadge extends StatefulWidget {
  const CloudSyncStatusBadge({super.key});

  @override
  State<CloudSyncStatusBadge> createState() => _CloudSyncStatusBadgeState();
}

class _CloudSyncStatusBadgeState extends State<CloudSyncStatusBadge>
    with SingleTickerProviderStateMixin {
  StreamSubscription<CloudSyncStatus>? _statusSub;
  StreamSubscription<bool>? _connectivitySub;
  Timer? _refreshTimer;
  int _pendingCount = 0;
  late AnimationController _rotationController;

  @override
  void initState() {
    super.initState();
    _rotationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _subscribe();
      _refreshPendingCount();
    });

    // Refresh pending count every 15 seconds
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _refreshPendingCount();
    });
  }

  void _subscribe() {
    try {
      final syncService = context.read<SyncService>();
      _statusSub = syncService.onStatusChanged.listen((status) {
        if (status == CloudSyncStatus.syncing) {
          _rotationController.repeat();
        } else {
          _rotationController.stop();
          _rotationController.reset();
        }
        _refreshPendingCount();
        if (mounted) setState(() {});
      });
    } catch (_) {}

    try {
      final connectivityService = context.read<NetworkConnectivityService>();
      _connectivitySub =
          connectivityService.onConnectivityChanged.listen((_) {
        _refreshPendingCount();
        if (mounted) setState(() {});
      });
    } catch (_) {}
  }

  Future<void> _refreshPendingCount() async {
    if (!mounted) return;
    try {
      final syncService = context.read<SyncService>();
      final count = await syncService.getPendingOutboxCount();
      if (mounted) {
        setState(() {
          _pendingCount = count;
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _statusSub?.cancel();
    _connectivitySub?.cancel();
    _refreshTimer?.cancel();
    _rotationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    SyncService? syncService;
    NetworkConnectivityService? connectivityService;

    try {
      syncService = context.watch<SyncService>();
    } catch (_) {}

    try {
      connectivityService = context.watch<NetworkConnectivityService>();
    } catch (_) {}

    bool isOnline = true;
    try {
      if (connectivityService != null) {
        isOnline = connectivityService.isOnline;
      }
    } catch (_) {
      isOnline = true;
    }

    CloudSyncStatus status = CloudSyncStatus.idle;
    try {
      if (syncService != null) {
        status = syncService.status;
      }
    } catch (_) {
      status = CloudSyncStatus.idle;
    }

    Color iconColor;
    IconData iconData;
    String tooltip;

    if (!isOnline || status == CloudSyncStatus.offline) {
      iconColor = Colors.blueGrey;
      iconData = Icons.cloud_off;
      tooltip = 'Sin conexión (Offline) - $_pendingCount pendientes';
    } else if (status == CloudSyncStatus.syncing) {
      iconColor = Colors.orange;
      iconData = Icons.sync;
      tooltip = 'Sincronizando con la Nube...';
    } else if (status == CloudSyncStatus.error) {
      iconColor = Colors.redAccent;
      iconData = Icons.sync_problem;
      tooltip = 'Error en sincronización - $_pendingCount pendientes';
    } else if (_pendingCount > 0) {
      iconColor = Colors.amber.shade700;
      iconData = Icons.cloud_upload;
      tooltip = '$_pendingCount documentos pendientes de sincronizar';
    } else {
      iconColor = Colors.green;
      iconData = Icons.cloud_done;
      tooltip = 'Nube Sincronizada';
    }

    Widget iconWidget = Icon(iconData, color: iconColor);
    if (status == CloudSyncStatus.syncing) {
      iconWidget = RotationTransition(
        turns: _rotationController,
        child: iconWidget,
      );
    }

    return IconButton(
      key: const Key('cloud_sync_status_badge_button'),
      tooltip: tooltip,
      onPressed: () => _showSyncDetailDialog(context, syncService, isOnline),
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          iconWidget,
          if (_pendingCount > 0)
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: iconColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                constraints: const BoxConstraints(
                  minWidth: 16,
                  minHeight: 16,
                ),
                child: Text(
                  _pendingCount > 99 ? '99+' : '$_pendingCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showSyncDetailDialog(
    BuildContext context,
    SyncService? syncService,
    bool isOnline,
  ) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        final lastSyncStr = syncService?.lastSyncTime != null
            ? DateFormat('dd/MM/yyyy HH:mm:ss').format(syncService!.lastSyncTime!)
            : 'Ninguna';
        final status = syncService?.status ?? CloudSyncStatus.idle;
        final lastError = syncService?.lastSyncError;

        String statusLabel;
        Color statusColor;
        if (!isOnline || status == CloudSyncStatus.offline) {
          statusLabel = 'Sin Conexión (Offline)';
          statusColor = Colors.blueGrey;
        } else if (status == CloudSyncStatus.syncing) {
          statusLabel = 'Sincronizando datos...';
          statusColor = Colors.orange;
        } else if (status == CloudSyncStatus.error) {
          statusLabel = 'Error en última sincronización';
          statusColor = Colors.red;
        } else if (_pendingCount > 0) {
          statusLabel = '$_pendingCount cambios locales pendientes';
          statusColor = Colors.amber.shade800;
        } else {
          statusLabel = 'Nube Sincronizada al 100%';
          statusColor = Colors.green;
        }

        return AlertDialog(
          title: Row(
            children: [
              Icon(
                isOnline ? Icons.cloud : Icons.cloud_off,
                color: statusColor,
              ),
              const SizedBox(width: 10),
              const Text('Estado de la Nube'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: statusColor, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          color: statusColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildDetailRow('Conectividad:', isOnline ? 'En Línea (Online)' : 'Desconectado (Offline)'),
              const SizedBox(height: 8),
              _buildDetailRow('Pendientes en Outbox:', '$_pendingCount documento(s)'),
              const SizedBox(height: 8),
              _buildDetailRow('Último Sync Exitoso:', lastSyncStr),
              if (lastError != null && lastError.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Detalle de Error:',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.red.shade700,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    // Known discrete sync error codes render as Spanish
                    // labels (issue #587); composed summaries and arbitrary
                    // exception dumps pass through unchanged — the detail
                    // box is diagnostic. Split at ';' so the domain list
                    // suffix doesn't prevent the code from being localized.
                    _localizeSyncError(lastError),
                    style: TextStyle(color: Colors.red.shade900, fontSize: 11),
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
              // #613 Unit B — informational inert-recipe verdict line.
              // Best-effort read: null (nothing to report, or the verdict
              // read failed) renders nothing and leaves the dialog exactly
              // as before. This never changes the badge colour or status
              // and never blocks the sale path (owner decision 5).
              FutureBuilder<AuthorityInertRecipeReport?>(
                future: syncService?.getInertRecipeVerdictReport() ??
                    Future<AuthorityInertRecipeReport?>.value(null),
                builder: (context, snapshot) {
                  final report = snapshot.data;
                  if (snapshot.hasError ||
                      report == null ||
                      report.verdictCount <= 0) {
                    return const SizedBox.shrink();
                  }
                  return _InertRecipesDetailSection(report: report);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cerrar'),
            ),
            ElevatedButton.icon(
              key: const Key('force_sync_button'),
              icon: const Icon(Icons.sync, size: 18),
              label: const Text('Forzar Sincronización'),
              onPressed: () {
                Navigator.pop(dialogContext);
                syncService?.triggerManualSync();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Sincronización forzada iniciada...'),
                    duration: Duration(seconds: 2),
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }

  /// Localizes a sync error that may carry a domain-list suffix after ';'.
  /// Only splits when the prefix contains a colon (error-code shape like
  /// `AUTH_BLOCKED: ...`); domain-name summaries like `AuditLogs; Sales`
  /// pass through verbatim.
  String _localizeSyncError(String error) {
    final semicolonIndex = error.indexOf(';');
    if (semicolonIndex > 0) {
      final code = error.substring(0, semicolonIndex).trim();
      // Error codes have a colon (AUTH_BLOCKED: ...); domain names don't.
      if (code.contains(':')) {
        final localized = localize(code, kSyncErrorLabels);
        if (localized != code) {
          final detail = error.substring(semicolonIndex + 1).trim();
          return detail.isEmpty ? localized : '$localized — $detail';
        }
      }
    }
    return localize(error, kSyncErrorLabels);
  }

  Widget _buildDetailRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 13),
        ),
      ],
    );
  }
}

/// #613 Unit B — collapsed informational line ("N recetas inertes en este
/// dispositivo") that expands, on tap, to the affected product names so the
/// operator can act in Catálogo. Purely informational: amber like the
/// pending state, never the error red, and rendered through [localize] from
/// [kAuthorityInertRecipeLabels] (no inline copy).
class _InertRecipesDetailSection extends StatefulWidget {
  final AuthorityInertRecipeReport report;

  const _InertRecipesDetailSection({required this.report});

  @override
  State<_InertRecipesDetailSection> createState() =>
      _InertRecipesDetailSectionState();
}

class _InertRecipesDetailSectionState
    extends State<_InertRecipesDetailSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final count = widget.report.verdictCount;
    final line = count == 1
        ? localize(
            'AUTHORITY_INERT_RECIPES_LINE_ONE',
            kAuthorityInertRecipeLabels,
          )
        : localize(
            'AUTHORITY_INERT_RECIPES_LINE_MANY',
            kAuthorityInertRecipeLabels,
          ).replaceFirst('{count}', '$count');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        InkWell(
          key: const Key('authority_inert_recipes_line'),
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Icon(Icons.info_outline,
                    color: Colors.amber.shade800, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    line,
                    style: TextStyle(
                      color: Colors.amber.shade800,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Icon(
                  _expanded
                      ? Icons.expand_less
                      : Icons.expand_more,
                  color: Colors.amber.shade800,
                  size: 18,
                ),
              ],
            ),
          ),
        ),
        if (_expanded) ...[
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final name in widget.report.productNames)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1),
                    child: Text(
                      name,
                      style: TextStyle(
                        color: Colors.amber.shade900,
                        fontSize: 11,
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  localize(
                    'AUTHORITY_INERT_RECIPES_PRODUCTS_HINT',
                    kAuthorityInertRecipeLabels,
                  ),
                  style: TextStyle(
                    color: Colors.amber.shade900,
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
