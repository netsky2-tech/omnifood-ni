import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:pos_app/domain/models/inventory/count_session_document.dart';

typedef CountLineAction = Future<void> Function(String lineId);
typedef CountSessionAction = Future<void> Function();

class CountSessionDetailView extends StatelessWidget {
  const CountSessionDetailView({
    super.key,
    required this.session,
    required this.onRecordCount,
    required this.onRequestApproval,
    required this.onApprove,
    required this.onPost,
  });

  final CountSessionDocument session;
  final CountLineAction onRecordCount;
  final CountSessionAction onRequestApproval;
  final CountSessionAction onApprove;
  final CountSessionAction onPost;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('yyyy-MM-dd HH:mm');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.warehouseName,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text('Estado: ${session.status}'),
                Text('Corte: ${dateFormat.format(session.cutoffAt.toLocal())}'),
                if (session.postedAt != null)
                  Text('Aplicado: ${dateFormat.format(session.postedAt!.toLocal())}'),
                if (session.movementReferences.isNotEmpty)
                  Text('Referencias de ajuste: ${session.movementReferences.length}'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        ...session.lines.map(
          (line) => Card(
            child: ListTile(
              title: Text(line.insumoName),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Teórico: ${line.theoreticalQuantity.toStringAsFixed(2)} ${line.uom}',
                    style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                  ),
                  Text(
                    'Variación aprobada: '
                    '${(line.variance ?? 0).toStringAsFixed(2)} ${line.uom}',
                    style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                  ),
                  Text('Entradas: ${line.entries.length}'),
                ],
              ),
              trailing: TextButton(
                onPressed: () => onRecordCount(line.id),
                child: Text(line.entries.isEmpty ? 'Registrar conteo' : 'Recontar'),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (session.status == CountSessionStatus.open ||
            session.status == CountSessionStatus.counting ||
            session.status == CountSessionStatus.recount)
          ElevatedButton(
            onPressed: onRequestApproval,
            child: const Text('Enviar a aprobación'),
          ),
        if (session.status == CountSessionStatus.approvalPending)
          ElevatedButton(
            onPressed: onApprove,
            child: const Text('Aprobar conteo'),
          ),
        if (session.status == CountSessionStatus.approved)
          ElevatedButton(
            onPressed: onPost,
            child: const Text('Aplicar ajustes'),
          ),
      ],
    );
  }
}
