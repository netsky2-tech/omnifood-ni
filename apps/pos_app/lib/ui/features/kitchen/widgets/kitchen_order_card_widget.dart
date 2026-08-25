import 'package:flutter/material.dart';
import '../../../../domain/models/kitchen/kitchen_order.dart';
import '../../../../domain/models/kitchen/kitchen_order_item.dart';
import '../../../../domain/services/kitchen/kitchen_order_service.dart';

class KitchenOrderCardWidget extends StatelessWidget {
  final KitchenOrder order;
  final KitchenSlaStatus slaStatus;
  final int elapsedMinutes;
  final VoidCallback? onStartPreparation;
  final VoidCallback? onMarkReady;
  final VoidCallback? onBump;
  final Function(String itemId)? onToggleItem;

  const KitchenOrderCardWidget({
    super.key,
    required this.order,
    required this.slaStatus,
    required this.elapsedMinutes,
    this.onStartPreparation,
    this.onMarkReady,
    this.onBump,
    this.onToggleItem,
  });

  Color _getSlaBackgroundColor() {
    switch (slaStatus) {
      case KitchenSlaStatus.normal:
        return Colors.green.shade800;
      case KitchenSlaStatus.warning:
        return Colors.orange.shade800;
      case KitchenSlaStatus.critical:
        return Colors.red.shade900;
    }
  }

  String _getSlaText() {
    switch (slaStatus) {
      case KitchenSlaStatus.normal:
        return '$elapsedMinutes min';
      case KitchenSlaStatus.warning:
        return '$elapsedMinutes min (Alerta)';
      case KitchenSlaStatus.critical:
        return '$elapsedMinutes min (DEMORA)';
    }
  }

  Color _getStationColor() {
    return order.station == 'BARRA' ? Colors.deepPurple.shade700 : Colors.blue.shade800;
  }

  @override
  Widget build(BuildContext context) {
    final isReady = order.status == 'LISTO';
    final isPrep = order.status == 'EN_PREPARACION';

    return Container(
      width: 300,
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B), // Slate 800
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: slaStatus == KitchenSlaStatus.critical
              ? Colors.red.shade600
              : isReady
                  ? Colors.green.shade400
                  : const Color(0xFF334155),
          width: slaStatus == KitchenSlaStatus.critical || isReady ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // --- HEADER ---
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A), // Slate 900
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Table identifier
                    Expanded(
                      child: Text(
                        order.tableName ?? order.tableNumber ?? 'Para Llevar',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Station badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: _getStationColor(),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        order.station,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Waiter name
                    Expanded(
                      child: order.waiterName != null
                          ? Text(
                              'Mesero: ${order.waiterName}',
                              style: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 12,
                              ),
                              overflow: TextOverflow.ellipsis,
                            )
                          : const SizedBox.shrink(),
                    ),
                    const SizedBox(width: 8),
                    // SLA Timer badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _getSlaBackgroundColor(),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.timer_outlined, size: 12, color: Colors.white),
                          const SizedBox(width: 4),
                          Text(
                            _getSlaText(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // --- NOTES IF PRESENT ---
          if (order.notes != null && order.notes!.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              color: Colors.amber.shade900.withOpacity(0.3),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 14, color: Colors.amberAccent),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Nota: ${order.notes}',
                      style: const TextStyle(
                        color: Colors.amberAccent,
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // --- ITEMS LIST ---
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Column(
              children: order.items.map((item) => _buildItemRow(item)).toList(),
            ),
          ),

          const Divider(height: 1, color: Color(0xFF334155)),

          // --- FOOTER / ACTIONS ---
          Padding(
            padding: const EdgeInsets.all(8),
            child: _buildActionButton(isReady, isPrep),
          ),
        ],
      ),
    );
  }

  Widget _buildItemRow(KitchenOrderItem item) {
    final itemDone = item.status == 'LISTO';

    return InkWell(
      onTap: onToggleItem != null ? () => onToggleItem!(item.id) : null,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
        margin: const EdgeInsets.symmetric(vertical: 2),
        decoration: BoxDecoration(
          color: itemDone ? Colors.green.shade900.withOpacity(0.2) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Quantity badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: itemDone ? Colors.green.shade700 : const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${item.quantity.toInt()}x',
                    style: TextStyle(
                      color: itemDone ? Colors.white : Colors.amberAccent,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Product name
                Expanded(
                  child: Text(
                    item.productName,
                    style: TextStyle(
                      color: itemDone ? Colors.green.shade300 : Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      decoration: itemDone ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
                // Status icon
                Icon(
                  itemDone ? Icons.check_circle : Icons.radio_button_unchecked,
                  size: 18,
                  color: itemDone ? Colors.greenAccent : const Color(0xFF64748B),
                ),
              ],
            ),
            // Modifiers
            if (item.modifiers.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 36, top: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: item.modifiers
                      .map(
                        (mod) => Text(
                          '• $mod',
                          style: const TextStyle(
                            color: Colors.amber,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
            // Item Notes
            if (item.notes != null && item.notes!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 36, top: 2),
                child: Text(
                  'Nota: ${item.notes}',
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton(bool isReady, bool isPrep) {
    if (order.status == 'PENDIENTE') {
      return ElevatedButton.icon(
        onPressed: onStartPreparation,
        icon: const Icon(Icons.play_arrow, size: 18),
        label: const Text('Iniciar Preparación'),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.blue.shade600,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    } else if (isPrep) {
      return ElevatedButton.icon(
        onPressed: onMarkReady,
        icon: const Icon(Icons.check, size: 18),
        label: const Text('Marcar Todo Listo'),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.green.shade600,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    } else if (isReady) {
      return ElevatedButton.icon(
        onPressed: onBump,
        icon: const Icon(Icons.delivery_dining, size: 18),
        label: const Text('Despachar (Bump)'),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.amber.shade700,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
