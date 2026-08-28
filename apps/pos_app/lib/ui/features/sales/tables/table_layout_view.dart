import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../data/database/app_database.dart';
import '../../../../domain/models/sales/restaurant_table.dart';
import '../../../../domain/models/sales/restaurant_area.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/models/sales/hold_ticket.dart';
import '../../../../presentation/features/sales/view_models/sale_view_model.dart';
import 'table_layout_view_model.dart';
import '../widgets/multi_currency_checkout_dialog.dart';

class TableLayoutView extends StatelessWidget {
  final TableLayoutViewModel? viewModel;
  const TableLayoutView({super.key, this.viewModel});

  @override
  Widget build(BuildContext context) {
    if (viewModel != null) {
      return TableLayoutContent(viewModel: viewModel);
    }
    final database = context.read<AppDatabase>();

    return ChangeNotifierProvider(
      create: (_) => TableLayoutViewModel(database: database),
      child: const TableLayoutContent(),
    );
  }
}

class TableLayoutContent extends StatelessWidget {
  final TableLayoutViewModel? viewModel;
  const TableLayoutContent({super.key, this.viewModel});

  @override
  Widget build(BuildContext context) {
    final vm = viewModel ?? context.watch<TableLayoutViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Control de Mesas y Áreas'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => vm.loadData(),
            tooltip: 'Actualizar Mesas',
          ),
        ],
      ),
      body: vm.isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Area Selector Tabs
                AreaFilterBarWidget(
                  areas: vm.areas,
                  selectedAreaId: vm.selectedAreaId,
                  onSelectArea: (id) => vm.selectArea(id),
                ),
                const Divider(height: 1),

                // Table Grid
                Expanded(
                  child: vm.filteredTables.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24.0),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.table_restaurant_outlined,
                                  size: 64,
                                  color: colorScheme.outline.withOpacity(0.5),
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  vm.areas.isEmpty
                                      ? 'No hay áreas ni mesas configuradas.'
                                      : 'No hay mesas configuradas para esta área.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: colorScheme.onSurfaceVariant,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'En Modo Food Park (QSR) los pedidos se atienden por mostrador con buzzer. Las mesas se gestionan en Modo Restaurante o Híbrido.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: colorScheme.outline,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : SingleChildScrollView(
                          padding: const EdgeInsets.all(16.0),
                          child: Wrap(
                            spacing: 16,
                            runSpacing: 16,
                            children: vm.filteredTables.map((table) {
                              return SizedBox(
                                width: 220,
                                child: TableCardWidget(
                                  table: table,
                                  totalAmount: vm.getTableTotal(table.id),
                                  activeTicket: vm.getTicketForTable(table.id),
                                  onTableTapped: () => _handleTableTapped(context, table, vm),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  void _handleTableTapped(
    BuildContext context,
    RestaurantTable table,
    TableLayoutViewModel viewModel,
  ) {
    if (table.status == 'DISPONIBLE') {
      _showOpenTableDialog(context, table);
    } else {
      _showTableActionsDialog(context, table, viewModel);
    }
  }

  void _showOpenTableDialog(BuildContext context, RestaurantTable table) {
    final nameController = TextEditingController(text: table.tableNumber);
    int guests = 2;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text('Abrir Comanda - ${table.tableNumber}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(labelText: 'Identificador / Cliente'),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Text('Número de Comensales:'),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: guests > 1 ? () => setState(() => guests--) : null,
                    ),
                    Text('$guests', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline),
                      onPressed: guests < 20 ? () => setState(() => guests++) : null,
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('CANCELAR')),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(dialogCtx);
                  // Set active cart with empty table comanda and navigate to sales screen
                  final saleVM = context.read<SaleViewModel>();
                  saleVM.clearCart();
                  Navigator.pop(context, {
                    'tableId': table.id,
                    'areaId': table.areaId,
                    'tableName': nameController.text.trim(),
                    'guestCount': guests,
                  });
                },
                child: const Text('ABRIR COMANDA'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showTableActionsDialog(
    BuildContext context,
    RestaurantTable table,
    TableLayoutViewModel viewModel,
  ) {
    final ticket = viewModel.getTicketForTable(table.id);
    final total = viewModel.getTableTotal(table.id);

    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: Text('${table.tableNumber} - Opciones'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (ticket != null) ...[
              Text('Comanda: ${ticket.name}', style: const TextStyle(fontWeight: FontWeight.bold)),
              if (ticket.waiterName != null) Text('Atiende: ${ticket.waiterName}'),
              Text('Comensales: ${table.activeGuests ?? ticket.guestCount}'),
              Text('Total acumulado: C\$ ${total.toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 16, color: Colors.green, fontWeight: FontWeight.bold)),
              const Divider(height: 24),
            ],
            ListTile(
              leading: const Icon(Icons.edit_note, color: Colors.blue),
              title: const Text('Continuar Comanda / Agregar Ítems'),
              onTap: () {
                Navigator.pop(dialogCtx);
                if (ticket != null) {
                  final saleVM = context.read<SaleViewModel>();
                  saleVM.recallTicket(ticket);
                  Navigator.pop(context);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.point_of_sale, color: Colors.green),
              title: const Text('Cobrar en Caja'),
              onTap: () {
                Navigator.pop(dialogCtx);
                if (ticket != null) {
                  final saleVM = context.read<SaleViewModel>();
                  saleVM.recallTicket(ticket);
                  showDialog(
                    context: context,
                    builder: (_) => const MultiCurrencyCheckoutDialog(),
                  );
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.swap_horiz, color: Colors.orange),
              title: const Text('Cambiar / Transferir de Mesa'),
              onTap: () {
                Navigator.pop(dialogCtx);
                _showTransferTableDialog(context, table, viewModel);
              },
            ),
            ListTile(
              leading: const Icon(Icons.merge_type, color: Colors.purple),
              title: const Text('Fusionar con otra Mesa'),
              onTap: () {
                Navigator.pop(dialogCtx);
                _showMergeTablesDialog(context, table, viewModel);
              },
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('CERRAR')),
        ],
      ),
    );
  }

  void _showTransferTableDialog(
    BuildContext context,
    RestaurantTable sourceTable,
    TableLayoutViewModel viewModel,
  ) {
    final availableTables = viewModel.tables
        .where((t) => t.status == 'DISPONIBLE' && t.id != sourceTable.id)
        .toList();

    if (availableTables.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No hay mesas disponibles para transferir.')),
      );
      return;
    }

    String selectedTargetId = availableTables.first.id;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text('Transferir ${sourceTable.tableNumber}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Seleccione la nueva mesa disponible:'),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedTargetId,
                  items: availableTables.map((t) {
                    return DropdownMenuItem(value: t.id, child: Text(t.tableNumber));
                  }).toList(),
                  onChanged: (val) => setState(() => selectedTargetId = val!),
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('CANCELAR')),
              ElevatedButton(
                onPressed: () async {
                  Navigator.pop(dialogCtx);
                  await viewModel.transferTableOrder(
                    sourceTableId: sourceTable.id,
                    targetTableId: selectedTargetId,
                  );
                },
                child: const Text('TRANSFERIR'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showMergeTablesDialog(
    BuildContext context,
    RestaurantTable sourceTable,
    TableLayoutViewModel viewModel,
  ) {
    final occupiedTables = viewModel.tables
        .where((t) => t.status == 'OCUPADA' && t.id != sourceTable.id)
        .toList();

    if (occupiedTables.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No hay otras mesas ocupadas para fusionar.')),
      );
      return;
    }

    String selectedTargetId = occupiedTables.first.id;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text('Fusionar ${sourceTable.tableNumber}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Los ítems de ${sourceTable.tableNumber} se unirán a la mesa destino:'),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedTargetId,
                  items: occupiedTables.map((t) {
                    return DropdownMenuItem(value: t.id, child: Text(t.tableNumber));
                  }).toList(),
                  onChanged: (val) => setState(() => selectedTargetId = val!),
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('CANCELAR')),
              ElevatedButton(
                onPressed: () async {
                  Navigator.pop(dialogCtx);
                  await viewModel.mergeTableOrders(
                    sourceTableId: sourceTable.id,
                    targetTableId: selectedTargetId,
                  );
                },
                child: const Text('FUSIONAR'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class AreaFilterBarWidget extends StatelessWidget {
  final List<RestaurantArea> areas;
  final String? selectedAreaId;
  final ValueChanged<String?> onSelectArea;

  const AreaFilterBarWidget({
    super.key,
    required this.areas,
    required this.selectedAreaId,
    required this.onSelectArea,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AreaChipItemWidget(
            label: 'Todas las Áreas',
            isSelected: selectedAreaId == null,
            onTap: () => onSelectArea(null),
          ),
          const SizedBox(width: 8),
          ...areas.map(
            (area) => Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: AreaChipItemWidget(
                label: area.name,
                isSelected: selectedAreaId == area.id,
                onTap: () => onSelectArea(area.id),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AreaChipItemWidget extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const AreaChipItemWidget({
    super.key,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? colorScheme.primaryContainer : colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? colorScheme.primary : colorScheme.outlineVariant,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected ? colorScheme.onPrimaryContainer : colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}

class TableCardWidget extends StatelessWidget {
  final RestaurantTable table;
  final double totalAmount;
  final HoldTicket? activeTicket;
  final VoidCallback onTableTapped;

  const TableCardWidget({
    super.key,
    required this.table,
    required this.totalAmount,
    required this.activeTicket,
    required this.onTableTapped,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isOccupied = table.status == 'OCUPADA';
    final cardColor = isOccupied ? Colors.red.shade50 : Colors.green.shade50;
    final borderColor = isOccupied ? Colors.red.shade400 : Colors.green.shade400;

    String? elapsedTime;
    if (isOccupied && table.openedAt != null) {
      final diff = DateTime.now().difference(table.openedAt!);
      elapsedTime = '${diff.inMinutes}m';
    }

    return Card(
      elevation: 2,
      color: cardColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: borderColor, width: 2),
      ),
      child: InkWell(
        onTap: onTableTapped,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(10.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      table.tableNumber,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isOccupied ? Colors.red.shade100 : Colors.green.shade100,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      table.status,
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        color: isOccupied ? Colors.red.shade900 : Colors.green.shade900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (isOccupied) ...[
                Row(
                  children: [
                    const Icon(Icons.people, size: 13, color: Colors.black54),
                    const SizedBox(width: 2),
                    Text('${table.activeGuests ?? 1} p.', style: const TextStyle(fontSize: 12)),
                    if (elapsedTime != null) ...[
                      const SizedBox(width: 6),
                      const Icon(Icons.timer_outlined, size: 13, color: Colors.black54),
                      const SizedBox(width: 2),
                      Text(elapsedTime, style: const TextStyle(fontSize: 12)),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'C\$ ${totalAmount.toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
              ] else ...[
                Row(
                  children: [
                    const Icon(Icons.chair_outlined, size: 14, color: Colors.green),
                    const SizedBox(width: 4),
                    Text('Cap: ${table.capacity}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
                  ],
                ),
                const SizedBox(height: 4),
                const Text('Toca para abrir', style: TextStyle(fontSize: 11, color: Colors.green)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
