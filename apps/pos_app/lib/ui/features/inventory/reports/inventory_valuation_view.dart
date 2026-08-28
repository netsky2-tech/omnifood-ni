import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../design_system/design_system.dart';
import 'inventory_valuation_view_model.dart';

class InventoryValuationView extends StatefulWidget {
  const InventoryValuationView({super.key});

  @override
  State<InventoryValuationView> createState() => _InventoryValuationViewState();
}

class _InventoryValuationViewState extends State<InventoryValuationView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<InventoryValuationViewModel>().setSearchQuery('');
        context.read<InventoryValuationViewModel>().loadValuationReport();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reporte de Existencias & Valorización'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar reporte',
            onPressed: () => context
                .read<InventoryValuationViewModel>()
                .loadValuationReport(),
          ),
        ],
      ),
      body: Consumer<InventoryValuationViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading && viewModel.report == null) {
            return const Center(child: CircularProgressIndicator());
          }

          final colorScheme = Theme.of(context).colorScheme;

          final card1 = _SummaryCard(
            title: 'Valorización Total',
            value: 'C\$ ${viewModel.totalValuationNio.toStringAsFixed(2)}',
            subtitle: '${viewModel.itemsWithStockCount} ítems con existencias',
            color: colorScheme.primary,
            icon: Icons.account_balance_wallet_outlined,
          );
          final card2 = _SummaryCard(
            title: 'Ítems Totales',
            value: '${viewModel.totalItemsCount}',
            subtitle: 'Insumos registrados',
            color: colorScheme.secondary,
            icon: Icons.inventory_2_outlined,
          );
          final card3 = _SummaryCard(
            title: 'Stock Bajo',
            value: '${viewModel.itemsLowStockCount}',
            subtitle: 'Bajo punto de reorden',
            color: Colors.orange.shade800,
            icon: Icons.warning_amber_rounded,
          );
          final card4 = _SummaryCard(
            title: 'Stock Negativo',
            value: '${viewModel.itemsNegativeStockCount}',
            subtitle: 'Pendientes de retrocálculo',
            color: colorScheme.error,
            icon: Icons.error_outline,
          );

          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Header Summary Cards (2x2 on handheld, 4x1 on desktop)
                if (isHandheld) ...[
                  Row(
                    children: [
                      Expanded(child: card1),
                      const SizedBox(width: 8),
                      Expanded(child: card2),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: card3),
                      const SizedBox(width: 8),
                      Expanded(child: card4),
                    ],
                  ),
                ] else ...[
                  Row(
                    children: [
                      Expanded(child: card1),
                      const SizedBox(width: 12),
                      Expanded(child: card2),
                      const SizedBox(width: 12),
                      Expanded(child: card3),
                      const SizedBox(width: 12),
                      Expanded(child: card4),
                    ],
                  ),
                ],
                const SizedBox(height: 16),

                // 2. Search and Filter Bar
                Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _searchController,
                          decoration: InputDecoration(
                            hintText: 'Buscar insumo por nombre o UOM...',
                            prefixIcon: const Icon(Icons.search),
                            suffixIcon: _searchController.text.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () {
                                      _searchController.clear();
                                      viewModel.setSearchQuery('');
                                    },
                                  )
                                : null,
                            isDense: true,
                            border: const OutlineInputBorder(),
                          ),
                          onChanged: viewModel.setSearchQuery,
                        ),
                        const SizedBox(height: 10),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              ChoiceChip(
                                label: const Text('Todos'),
                                selected:
                                    viewModel.filterMode ==
                                    ValuationFilterMode.all,
                                onSelected: (_) => viewModel.setFilterMode(
                                  ValuationFilterMode.all,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Con Stock'),
                                selected:
                                    viewModel.filterMode ==
                                    ValuationFilterMode.withStock,
                                onSelected: (_) => viewModel.setFilterMode(
                                  ValuationFilterMode.withStock,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Stock Bajo'),
                                selected:
                                    viewModel.filterMode ==
                                    ValuationFilterMode.lowStock,
                                onSelected: (_) => viewModel.setFilterMode(
                                  ValuationFilterMode.lowStock,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Stock Negativo'),
                                selected:
                                    viewModel.filterMode ==
                                    ValuationFilterMode.negativeStock,
                                onSelected: (_) => viewModel.setFilterMode(
                                  ValuationFilterMode.negativeStock,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // 3. Data Table List
                Expanded(
                  child: Card(
                    child: viewModel.filteredItems.isEmpty
                        ? const Center(
                            child: Text(
                              'No se encontraron insumos con los filtros seleccionados.',
                            ),
                          )
                        : ListView.separated(
                            itemCount: viewModel.filteredItems.length,
                            separatorBuilder: (context, index) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final item = viewModel.filteredItems[index];
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 2,
                                ),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        item.name,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 13,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (item.isPerishable) ...[
                                      const SizedBox(width: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 4,
                                          vertical: 1,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.blue.shade50,
                                          borderRadius:
                                              BorderRadius.circular(4),
                                          border: Border.all(
                                            color: Colors.blue.shade300,
                                          ),
                                        ),
                                        child: Text(
                                          'Perecedero',
                                          style: TextStyle(
                                            fontSize: 9,
                                            color: Colors.blue.shade900,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                subtitle: Text(
                                  'Existencia: ${item.stock.toStringAsFixed(2)} ${item.consumptionUom}'
                                  '${item.stockMin != null ? ' • Mín: ${item.stockMin!.toStringAsFixed(2)}' : ''}'
                                  ' • CPP: C\$ ${item.averageCostNio.toStringAsFixed(2)}',
                                  style: const TextStyle(fontSize: 11),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      'C\$ ${item.totalValuationNio.toStringAsFixed(2)}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 13,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    if (item.isNegativeStock)
                                      _StatusBadge(
                                        text: 'STOCK NEGATIVO',
                                        color: colorScheme.error,
                                      )
                                    else if (item.isLowStock)
                                      _StatusBadge(
                                        text: 'STOCK BAJO',
                                        color: Colors.orange.shade800,
                                      )
                                    else if (item.stock == 0)
                                      _StatusBadge(
                                        text: 'AGOTADO',
                                        color: Colors.grey.shade600,
                                      )
                                    else
                                      _StatusBadge(
                                        text: 'EN RANGO',
                                        color: Colors.green.shade700,
                                      ),
                                  ],
                                ),
                              );
                            },
                          ),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.color,
    required this.icon,
  });

  final String title;
  final String value;
  final String subtitle;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      color: color.withValues(alpha: 0.05),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title.toUpperCase(),
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: color,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.black54,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
