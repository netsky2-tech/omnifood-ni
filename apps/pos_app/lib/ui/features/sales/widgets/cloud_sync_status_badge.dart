import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../../core/localization/label_map.dart';
import '../../../../data/services/sync_service.dart';
import '../../../../data/services/network_connectivity_service.dart';
import '../../../design_system/nhilos_tokens.dart';
import '../../../design_system/responsive_layout.dart';

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
  int _pendingAuditCount = 0;

  /// R-16: age of the oldest unconfirmed pending item in the outbox (from
  /// [SyncService.getOldestPendingItemAge]). The badge's stall signal: when
  /// the device is online and this exceeds
  /// [SyncService.pendingStallThreshold], the sync pipeline is stopped even
  /// if the cached `status` still says idle/success from a previous pass.
  Duration? _oldestPendingAge;
  late AnimationController _rotationController;

  /// §44/§46: motion must be suppressed for operators with reduced-motion
  /// enabled. Read from the platform accessibility settings.
  bool _reduceMotion = false;

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduce == _reduceMotion) return;
    _reduceMotion = reduce;
    if (_reduceMotion) {
      _rotationController.stop();
      _rotationController.reset();
    }
  }

  void _subscribe() {
    try {
      final syncService = context.read<SyncService>();
      _statusSub = syncService.onStatusChanged.listen((status) {
        if (status == CloudSyncStatus.syncing && !_reduceMotion) {
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
      // D-18: audit rows are counted separately from the outbox so the
      // degraded audit state can be surfaced without lying about pending
      // business documents. Fault-isolated like the outbox read.
      int auditCount = _pendingAuditCount;
      try {
        auditCount = await syncService.getPendingAuditCount();
      } catch (_) {
        // Keep the previous read on failure: a failed audit count must not
        // clear an already-visible degraded signal.
      }
      // R-16: the stall signal is read with the same fault isolation: a
      // failed age read keeps the previous value so a visible stall is
      // never silently cleared; a fresh read corrects it on the next tick.
      Duration? oldestPendingAge = _oldestPendingAge;
      try {
        oldestPendingAge = await syncService.getOldestPendingItemAge();
      } catch (_) {}
      if (mounted) {
        setState(() {
          _pendingCount = count;
          _pendingAuditCount = auditCount;
          _oldestPendingAge = oldestPendingAge;
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

    // D-18: audit degradation is a dedicated amber state, never the error
    // red and never the fully-synced green while audit rows are pending.
    final bool auditDegraded =
        status == CloudSyncStatus.auditDegraded ||
        (syncService?.isAuditStreamDegraded ?? false);

    // R-16: the last run's status is not the whole truth. `status` is only
    // mutated inside a run, so after a sleep (or a pass that "succeeded"
    // without confirming anything) it can report a stale idle/success. The
    // terminal can tell it is stuck from what it knows locally: while the
    // device is online and the oldest unconfirmed pending item is older
    // than the stall threshold, the sync pipeline is stopped — this can
    // never paint the badge green, whatever `status` claims.
    final bool stalled = isOnline &&
        status != CloudSyncStatus.offline &&
        status != CloudSyncStatus.syncing &&
        _oldestPendingAge != null &&
        _oldestPendingAge! > SyncService.pendingStallThreshold;
    // When the audit stream is the only thing pending, show its count on
    // the badge instead of the (zero) business outbox count.
    final int badgeCount = auditDegraded && _pendingCount == 0
        ? _pendingAuditCount
        : _pendingCount;

    Color iconColor;
    IconData iconData;
    String tooltip;

    if (!isOnline || status == CloudSyncStatus.offline) {
      // §35.4: no connection is "local sale protected", not a catastrophe.
      // Serene amber, never alarm red.
      iconColor = NhilosColors.warning;
      iconData = Icons.cloud_off;
      tooltip = 'Venta local protegida — $_pendingCount pendiente(s)';
    } else if (status == CloudSyncStatus.syncing) {
      iconColor = NhilosColors.brandPrimary;
      iconData = Icons.sync;
      tooltip = 'Sincronizando con la Nube...';
    } else if (stalled) {
      // R-16: work is not being confirmed even though the network is up.
      // Red is reserved for this and the error state: both mean business
      // documents are not reaching the cloud.
      iconColor = NhilosColors.danger;
      iconData = Icons.sync_disabled;
      tooltip = 'Sync detenido — trabajo sin confirmar hace '
          '${_oldestPendingAge!.inMinutes} min';
    } else if (status == CloudSyncStatus.error) {
      iconColor = NhilosColors.danger;
      iconData = Icons.sync_problem;
      tooltip = 'Error en sincronización - $_pendingCount pendientes';
    } else if (auditDegraded) {
      // D-18: audit-degraded pass — locally durable audit rows will reach
      // the cloud on a later pass; business documents are unaffected.
      iconColor = NhilosColors.warning;
      iconData = Icons.cloud_upload;
      tooltip = localize(
        'AUDIT_SYNC_DEGRADED_TOOLTIP',
        kAuditDegradedLabels,
      ).replaceFirst('{count}', '$_pendingAuditCount');
    } else if (_pendingCount > 0) {
      iconColor = NhilosColors.warning;
      iconData = Icons.cloud_upload;
      tooltip = '$_pendingCount documentos pendientes de sincronizar';
    } else {
      iconColor = NhilosColors.success;
      iconData = Icons.cloud_done;
      tooltip = 'Nube Sincronizada';
    }

    Widget iconWidget = Icon(iconData, color: iconColor);
    if (status == CloudSyncStatus.syncing && !_reduceMotion) {
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
          if (badgeCount > 0)
            // The counter is decorative on top of the tooltip: exclude it
            // from semantics so TalkBack reads one coherent label.
            Positioned(
              right: -4,
              top: -4,
              child: ExcludeSemantics(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(
                    color: iconColor,
                    borderRadius: NhilosRadii.badgeRadius,
                  ),
                  constraints: const BoxConstraints(
                    minWidth: 16,
                    minHeight: 16,
                  ),
                  child: Text(
                    badgeCount > 99 ? '99+' : '$badgeCount',
                    style: NhilosTextStyles.tabular(
                      base: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    textAlign: TextAlign.center,
                  ),
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
        // R-16: the dialog must not say "Nube Sincronizada al 100%" while
        // old unconfirmed work sits in the outbox, no matter what the
        // cached status claims.
        final bool stalled = isOnline &&
            status != CloudSyncStatus.offline &&
            status != CloudSyncStatus.syncing &&
            _oldestPendingAge != null &&
            _oldestPendingAge! > SyncService.pendingStallThreshold;
        // D-18: the dialog must tell the truth about the audit stream even
        // when it is not an error: degraded passes render the amber status
        // label, the pending-audit row, and an explanatory note.
        final bool auditDegraded =
            status == CloudSyncStatus.auditDegraded ||
            (syncService?.isAuditStreamDegraded ?? false);

        String statusLabel;
        Color statusColor;
        IconData statusIcon;
        if (!isOnline || status == CloudSyncStatus.offline) {
          statusLabel = 'Sin Conexión (Offline)';
          statusColor = NhilosColors.warning;
          statusIcon = Icons.cloud_off;
        } else if (status == CloudSyncStatus.syncing) {
          statusLabel = 'Sincronizando datos...';
          statusColor = NhilosColors.brandPrimary;
          statusIcon = Icons.sync;
        } else if (status == CloudSyncStatus.error) {
          statusLabel = 'Error en última sincronización';
          statusColor = NhilosColors.danger;
          statusIcon = Icons.sync_problem;
        } else if (stalled) {
          statusLabel = 'Sync detenido';
          statusColor = NhilosColors.danger;
          statusIcon = Icons.sync_disabled;
        } else if (auditDegraded) {
          statusLabel = localize(
            'AUDIT_SYNC_DEGRADED_STATUS',
            kAuditDegradedLabels,
          );
          statusColor = NhilosColors.warning;
          statusIcon = Icons.cloud_upload;
        } else if (_pendingCount > 0) {
          statusLabel = '$_pendingCount cambios locales pendientes';
          statusColor = NhilosColors.warning;
          statusIcon = Icons.cloud_upload;
        } else {
          statusLabel = 'Nube Sincronizada al 100%';
          statusColor = NhilosColors.success;
          statusIcon = Icons.cloud_done;
        }

        final bool handheld = ResponsiveBreakpoints.isHandheld(dialogContext);
        final double maxWidth = ResponsiveBreakpoints.value<double>(
          dialogContext,
          mobile: double.infinity,
          tablet: 480,
          desktop: 560,
        );

        return AlertDialog(
          shape: const RoundedRectangleBorder(
            borderRadius: NhilosRadii.modalRadius,
          ),
          insetPadding: EdgeInsets.symmetric(
            horizontal: handheld ? 16 : 40,
            vertical: 24,
          ),
          actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          title: Row(
            children: [
              Icon(
                isOnline ? Icons.cloud : Icons.cloud_off,
                color: statusColor,
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Estado de la Nube',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          content: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _StatusBanner(
                    color: statusColor,
                    icon: statusIcon,
                    label: statusLabel,
                  ),
                  const SizedBox(height: 16),
                  _DialogDetailRow(
                    label: 'Conectividad:',
                    value: isOnline
                        ? 'En Línea (Online)'
                        : 'Desconectado (Offline)',
                  ),
                  const SizedBox(height: 8),
                  _DialogDetailRow(
                    label: 'Pendientes en Outbox:',
                    value: '$_pendingCount documento(s)',
                  ),
                  const SizedBox(height: 8),
                  // D-18: the audit stream truth lives next to the outbox
                  // row, never inside the error detail box (audit is not a
                  // failure).
                  _DialogDetailRow(
                    label:
                        localize('AUDIT_SYNC_PENDING_ROW', kAuditDegradedLabels),
                    value: _pendingAuditCount == 1
                        ? localize(
                            'AUDIT_SYNC_PENDING_VALUE_ONE',
                            kAuditDegradedLabels,
                          )
                        : localize(
                            'AUDIT_SYNC_PENDING_VALUE_MANY',
                            kAuditDegradedLabels,
                          ).replaceFirst('{count}', '$_pendingAuditCount'),
                  ),
                  if (auditDegraded) ...[
                    const SizedBox(height: 8),
                    _DialogNote(
                      color: NhilosColors.warning,
                      background: NhilosColors.warningLight,
                      child: Text(
                        localize(
                          'AUDIT_SYNC_DEGRADED_DETAIL',
                          kAuditDegradedLabels,
                        ),
                        style: const TextStyle(
                          color: NhilosColors.warning,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  // R-16: the reason is shown when the state is stalled — the
                  // truth the incident's dialog failed to tell. "Último Sync
                  // Exitoso" below stays exactly as it was.
                  if (stalled) ...[
                    const SizedBox(height: 8),
                    _DialogNote(
                      color: NhilosColors.danger,
                      background: NhilosColors.dangerLight,
                      child: Text(
                        'Sync detenido: el trabajo más antiguo lleva '
                        '${_oldestPendingAge!.inMinutes} minutos sin '
                        'confirmarse aunque hay conexión. Fuerza una '
                        'sincronización o revisa la conexión.',
                        style: const TextStyle(
                          color: NhilosColors.danger,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  _DialogDetailRow(
                    label: 'Último Sync Exitoso:',
                    value: lastSyncStr,
                  ),
                  if (lastError != null && lastError.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Detalle de Error:',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: NhilosColors.danger,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    _DialogNote(
                      color: NhilosColors.danger,
                      background: NhilosColors.dangerLight,
                      child: Text(
                        // Known discrete sync error codes render as Spanish
                        // labels (issue #587); composed summaries and
                        // arbitrary exception dumps pass through unchanged —
                        // the detail box is diagnostic. Split at ';' so the
                        // domain list suffix doesn't prevent the code from
                        // being localized.
                        _localizeSyncError(lastError),
                        style: const TextStyle(
                          color: NhilosColors.danger,
                          fontSize: 12,
                          height: 1.35,
                        ),
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                  // #613 Unit B — informational inert-recipe verdict line.
                  // Best-effort read: null (nothing to report, or the verdict
                  // read failed) renders nothing and leaves the dialog
                  // exactly as before. This never changes the badge colour or
                  // status and never blocks the sale path (owner decision 5).
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
            ),
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

}

/// §42.1/§26.2: inline semantic banner for the dialog's headline state.
/// Tint + border + icon, never a neutral box.
class _StatusBanner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String label;

  const _StatusBanner({
    required this.color,
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: NhilosRadii.cardRadius,
        border: Border.all(color: color.withValues(alpha: 0.40)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// §42.7: warning/danger notes use the 8 dp chip radius, tint + border.
class _DialogNote extends StatelessWidget {
  final Color color;
  final Color background;
  final Widget child;

  const _DialogNote({
    required this.color,
    required this.background,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: NhilosRadii.chipRadius,
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: child,
    );
  }
}

/// §34.1/§42.6: label + value row that can never paint past the dialog edge.
/// The value keeps tabular figures so counts and timestamps stay steady.
class _DialogDetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DialogDetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final body = Theme.of(context).textTheme.bodyMedium;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Text(
            label,
            style: body?.copyWith(
              fontWeight: FontWeight.w600,
              color: NhilosColors.textPrimary,
              height: 1.3,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          flex: 2,
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: NhilosTextStyles.tabular(
              base: body?.copyWith(
                color: NhilosColors.textSecondary,
                height: 1.3,
              ),
            ),
          ),
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
          borderRadius: NhilosRadii.chipRadius,
          child: ConstrainedBox(
            // §46: the disclosure row is a touch target; keep it >= 48 dp.
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              child: Row(
                children: [
                  const Icon(
                    Icons.info_outline,
                    color: NhilosColors.warning,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      line,
                      style: const TextStyle(
                        color: NhilosColors.warning,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: NhilosColors.warning,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_expanded) ...[
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: NhilosColors.warningLight,
              borderRadius: NhilosRadii.chipRadius,
              border: Border.all(
                color: NhilosColors.warning.withValues(alpha: 0.30),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final name in widget.report.productNames)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1),
                    child: Text(
                      name,
                      style: const TextStyle(
                        color: NhilosColors.warning,
                        fontSize: 12,
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  localize(
                    'AUTHORITY_INERT_RECIPES_PRODUCTS_HINT',
                    kAuthorityInertRecipeLabels,
                  ),
                  style: const TextStyle(
                    color: NhilosColors.warning,
                    fontSize: 12,
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
