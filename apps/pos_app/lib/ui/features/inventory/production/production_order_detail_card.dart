import 'package:flutter/material.dart';

import '../../../../../domain/models/inventory/production_order_document.dart';

class ProductionOrderDetailCard extends StatelessWidget {
  const ProductionOrderDetailCard({
    super.key,
    required this.order,
  });

  final ProductionOrderDocument order;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(order.recipeProductName, style: Theme.of(context).textTheme.titleMedium),
                ),
                Chip(label: Text(order.isSynced ? 'Synced' : 'Pending')),
              ],
            ),
            const SizedBox(height: 8),
            Text('Versión ${order.recipeVersionId} • Lote ${order.producedBatchNumber}'),
            Text(
              'Plan ${order.plannedQuantity.toStringAsFixed(2)} • Real ${order.actualQuantity.toStringAsFixed(2)} • Variación ${order.varianceQuantity.toStringAsFixed(2)}',
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
            Text('Salida: ${order.producedInsumoName}'),
            if (order.varianceReason != null && order.varianceReason!.isNotEmpty)
              Text('Motivo: ${order.varianceReason}'),
            Text(
              'Movimientos ligados: ${order.movementReferences.length}',
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
          ],
        ),
      ),
    );
  }
}
