import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'kitchen_display_view_model.dart';
import 'widgets/kitchen_order_card_widget.dart';

class KitchenDisplayView extends StatelessWidget {
  const KitchenDisplayView({super.key});

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<KitchenDisplayViewModel>();

    return Scaffold(
      backgroundColor: const Color(0xFF0B1120), // Dark Navy Background
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A), // Slate 900
        elevation: 2,
        title: const Row(
          children: [
            Icon(Icons.restaurant_menu, color: Colors.amber, size: 24),
            SizedBox(width: 10),
            Text(
              'KDS - Pantalla de Cocina / Barra',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            tooltip: 'Actualizar',
            onPressed: () => vm.loadOrders(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Station Filter Header Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: const Color(0xFF0F172A),
            child: _buildStationFilterBar(context, vm),
          ),
          const Divider(height: 1, color: Color(0xFF334155)),
          // Main Body Content
          Expanded(
            child: _buildBody(context, vm),
          ),
        ],
      ),
    );
  }

  Widget _buildStationFilterBar(BuildContext context, KitchenDisplayViewModel vm) {
    final stations = [
      {'key': 'TODAS', 'label': 'Todas', 'count': vm.pendingCount},
      {'key': 'COCINA', 'label': 'Cocina', 'count': vm.cocinaCount},
      {'key': 'BARRA', 'label': 'Barra', 'count': vm.barraCount},
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: stations.map((st) {
        final key = st['key'] as String;
        final label = st['label'] as String;
        final count = st['count'] as int;
        final isSelected = vm.selectedStation == key;

        return ChoiceChip(
          selected: isSelected,
          label: Text(
            count > 0 ? '$label ($count)' : label,
            style: TextStyle(
              color: isSelected ? Colors.black : Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
          selectedColor: Colors.amber,
          backgroundColor: const Color(0xFF1E293B),
          onSelected: (_) => vm.selectStation(key),
        );
      }).toList(),
    );
  }

  Widget _buildBody(BuildContext context, KitchenDisplayViewModel vm) {
    if (vm.isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.amber),
      );
    }

    if (vm.errorMessage != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
            const SizedBox(height: 12),
            Text(
              vm.errorMessage!,
              style: const TextStyle(color: Colors.white, fontSize: 16),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => vm.loadOrders(),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      );
    }

    if (vm.orders.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline, size: 64, color: Colors.green.shade400),
            const SizedBox(height: 16),
            Text(
              'No hay comandas pendientes en ${vm.selectedStation == "TODAS" ? "ninguna estación" : vm.selectedStation}.',
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Wrap(
        spacing: 12,
        runSpacing: 12,
        children: vm.orders.map((order) {
          final sla = vm.getSlaStatus(order.createdAt);
          final elapsed = vm.getElapsedMinutes(order.createdAt);

          return KitchenOrderCardWidget(
            key: ValueKey(order.id),
            order: order,
            slaStatus: sla,
            elapsedMinutes: elapsed,
            onStartPreparation: () => vm.startPreparation(order.id),
            onMarkReady: () => vm.markOrderReady(order.id),
            onBump: () => vm.bumpOrder(order.id),
            onToggleItem: (itemId) => vm.markItemReady(order.id, itemId),
          );
        }).toList(),
      ),
    );
  }
}
