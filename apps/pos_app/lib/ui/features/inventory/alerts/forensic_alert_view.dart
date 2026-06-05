import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:provider/provider.dart';

import 'forensic_alert_view_model.dart';

class ForensicAlertView extends StatelessWidget {
  const ForensicAlertView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alertas BOH')),
      body: Consumer<ForensicAlertViewModel>(
        builder: (context, viewModel, child) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Bandeja persistente BOH.',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Las alertas se conservan entre reinicios, registran su ciclo de vida operativo y mantienen el enlace con el movimiento o documento origen.',
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          children: [
                            FilterChip(
                              label: const Text('Activas'),
                              selected: viewModel.filter == AlertStatusFilter.active,
                              onSelected: (_) => viewModel.setFilter(AlertStatusFilter.active),
                            ),
                            FilterChip(
                              label: const Text('Reconocidas'),
                              selected: viewModel.filter == AlertStatusFilter.acknowledged,
                              onSelected: (_) => viewModel.setFilter(AlertStatusFilter.acknowledged),
                            ),
                            FilterChip(
                              label: const Text('Todas'),
                              selected: viewModel.filter == AlertStatusFilter.all,
                              onSelected: (_) => viewModel.setFilter(AlertStatusFilter.all),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: viewModel.visibleAlerts.isEmpty
                      ? const _EmptyForensicAlertState()
                      : ListView.separated(
                          itemCount: viewModel.visibleAlerts.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final alert = viewModel.visibleAlerts[index];
                            final status = viewModel.statusFor(alert);
                            return _ForensicAlertCard(
                              alert: alert,
                              status: status,
                              onAcknowledge: status == 'Activa'
                                  ? () => _showLifecycleDialog(
                                      context,
                                      title: 'Reconocer alerta',
                                      confirmLabel: 'CONFIRMAR RECONOCIMIENTO',
                                      onConfirm: (note) => viewModel.acknowledgeAlert(
                                        alert.id,
                                        note: note,
                                        actorLabel: 'manager-1',
                                      ),
                                    )
                                  : null,
                              onResolve: status != 'Resuelta'
                                  ? () => _showLifecycleDialog(
                                      context,
                                      title: 'Resolver alerta',
                                      confirmLabel: 'CONFIRMAR RESOLUCIÓN',
                                      onConfirm: (note) => viewModel.resolveAlert(
                                        alert.id,
                                        note: note,
                                        actorLabel: 'manager-1',
                                      ),
                                    )
                                  : null,
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showLifecycleDialog(
    BuildContext context, {
    required String title,
    required String confirmLabel,
    required Future<void> Function(String note) onConfirm,
  }) {
    final controller = TextEditingController();
    return showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return Dialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(dialogContext).textTheme.titleLarge),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  decoration: const InputDecoration(labelText: 'Nota operativa'),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Cancelar'),
                ),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: () async {
                    await onConfirm(controller.text.trim());
                    if (dialogContext.mounted) {
                      Navigator.of(dialogContext).pop();
                    }
                  },
                  child: Text(confirmLabel),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _EmptyForensicAlertState extends StatelessWidget {
  const _EmptyForensicAlertState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.notifications_none, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            'Todavía no hay alertas BOH activas para esta tienda.',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Cuando el flujo local o el backend detecten señales BOH, van a quedar visibles acá hasta que se reconozcan, resuelvan o sean reemplazadas.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ForensicAlertCard extends StatelessWidget {
  const _ForensicAlertCard({
    required this.alert,
    required this.status,
    required this.onAcknowledge,
    required this.onResolve,
  });

  final ForensicAlert alert;
  final String status;
  final VoidCallback? onAcknowledge;
  final VoidCallback? onResolve;

  @override
  Widget build(BuildContext context) {
    final metadata = alert.metadata ?? const <String, dynamic>{};
    final createdAt = DateFormat('yyyy-MM-dd HH:mm').format(alert.createdAt.toLocal());

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(label: Text(alert.severity.toUpperCase())),
                Chip(label: Text(alert.alertType)),
                Chip(label: Text(status)),
              ],
            ),
            const SizedBox(height: 12),
            Text(alert.message, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text('Detectada: $createdAt'),
            if (metadata['item'] != null) Text('Ítem: ${metadata['item']}'),
            if (metadata['movementType'] != null) Text('Movimiento: ${metadata['movementType']}'),
            if (metadata['currentStock'] != null)
              Text(
                'Stock actual: ${metadata['currentStock']}',
                style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
              ),
            if (metadata['parLevel'] != null)
              Text(
                'PAR: ${metadata['parLevel']}',
                style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
              ),
            if (metadata['originDocument'] != null) Text('Origen: ${metadata['originDocument']}'),
            if (alert.sourceMovementId != null || metadata['sourceMovementId'] != null)
              Text('Movimiento origen: ${alert.sourceMovementId ?? metadata['sourceMovementId']}'),
            if (alert.sourceDocumentType != null || alert.sourceDocumentId != null)
              Text(
                'Documento origen: ${alert.sourceDocumentType ?? 'N/D'} · ${alert.sourceDocumentId ?? 'N/D'}',
              ),
            if (alert.note?.trim().isNotEmpty == true) Text(alert.note!.trim()),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (onResolve != null)
                  TextButton(
                    onPressed: onResolve,
                    child: const Text('RESOLVER'),
                  ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: onAcknowledge,
                  child: const Text('RECONOCER'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
