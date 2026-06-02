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
                          'Estado local: sesión actual únicamente.',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Esta primera entrega muestra alertas capturadas localmente en la sesión. La persistencia BOH completa y la trazabilidad extendida llegarán en iteraciones siguientes.',
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
                                  ? () => viewModel.acknowledgeAlert(alert.id)
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
            'Todavía no hay alertas BOH activas en esta sesión.',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Cuando el flujo local detecte stock bajo u otras señales BOH, van a quedar visibles acá hasta que las reconozcas o cierres sesión.',
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
  });

  final ForensicAlert alert;
  final String status;
  final VoidCallback? onAcknowledge;

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
            if (metadata['currentStock'] != null) Text('Stock actual: ${metadata['currentStock']}'),
            if (metadata['parLevel'] != null) Text('PAR: ${metadata['parLevel']}'),
            if (metadata['originDocument'] != null) Text('Origen: ${metadata['originDocument']}'),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                onPressed: onAcknowledge,
                child: const Text('RECONOCER'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
