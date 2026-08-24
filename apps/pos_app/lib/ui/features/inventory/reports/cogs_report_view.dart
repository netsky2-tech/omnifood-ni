import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'cogs_report_view_model.dart';

class CogsReportView extends StatefulWidget {
  const CogsReportView({super.key});

  @override
  State<CogsReportView> createState() => _CogsReportViewState();
}

class _CogsReportViewState extends State<CogsReportView> {
  final TextEditingController _searchController = TextEditingController();
  final DateFormat _dateFormat = DateFormat('dd/MM/yyyy');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CogsReportViewModel>().loadCogsReport();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _pickCustomDateRange(
    BuildContext context,
    CogsReportViewModel viewModel,
  ) async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2025, 1, 1),
      lastDate: DateTime(2030, 12, 31),
      initialDateRange: DateTimeRange(
        start: viewModel.fromDate,
        end: viewModel.toDate,
      ),
    );

    if (picked != null) {
      viewModel.setCustomDateRange(picked.start, picked.end);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Costo de Ventas (COGS) & Consumos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar reporte',
            onPressed: () =>
                context.read<CogsReportViewModel>().loadCogsReport(),
          ),
        ],
      ),
      body: Consumer<CogsReportViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading && viewModel.report == null) {
            return const Center(child: CircularProgressIndicator());
          }

          final colorScheme = Theme.of(context).colorScheme;

          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Date Range Filter Header
                Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.date_range, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              'Período: ${_dateFormat.format(viewModel.fromDate)} al ${_dateFormat.format(viewModel.toDate)}',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              ChoiceChip(
                                label: const Text('Hoy'),
                                selected:
                                    viewModel.dateFilter ==
                                    CogsDateRangeFilter.today,
                                onSelected: (_) => viewModel.setDateFilter(
                                  CogsDateRangeFilter.today,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Últimos 7 días'),
                                selected:
                                    viewModel.dateFilter ==
                                    CogsDateRangeFilter.last7Days,
                                onSelected: (_) => viewModel.setDateFilter(
                                  CogsDateRangeFilter.last7Days,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ChoiceChip(
                                label: const Text('Este Mes'),
                                selected:
                                    viewModel.dateFilter ==
                                    CogsDateRangeFilter.thisMonth,
                                onSelected: (_) => viewModel.setDateFilter(
                                  CogsDateRangeFilter.thisMonth,
                                ),
                              ),
                              const SizedBox(width: 8),
                              ActionChip(
                                avatar: const Icon(Icons.edit_calendar, size: 16),
                                label: const Text('Personalizado'),
                                onPressed: () =>
                                    _pickCustomDateRange(context, viewModel),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // 2. Summary KPI Cards
                Row(
                  children: [
                    Expanded(
                      child: _SummaryCard(
                        title: 'Total COGS',
                        value:
                            'C\$ ${viewModel.totalCogsNio.toStringAsFixed(2)}',
                        subtitle: 'Costo total consumido',
                        color: colorScheme.primary,
                        icon: Icons.monetization_on_outlined,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _SummaryCard(
                        title: 'Ventas Directas',
                        value:
                            'C\$ ${viewModel.salesCogsNio.toStringAsFixed(2)}',
                        subtitle: 'Consumo por recetas de venta',
                        color: Colors.green.shade800,
                        icon: Icons.point_of_sale_outlined,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _SummaryCard(
                        title: 'Mermas & Pérdidas',
                        value:
                            'C\$ ${viewModel.shrinkageCogsNio.toStringAsFixed(2)}',
                        subtitle: 'Desechos y caducidades',
                        color: Colors.orange.shade800,
                        icon: Icons.delete_sweep_outlined,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _SummaryCard(
                        title: 'Insumos Afectados',
                        value: '${viewModel.report?.items.length ?? 0}',
                        subtitle: 'Con movimiento en período',
                        color: colorScheme.secondary,
                        icon: Icons.category_outlined,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // 3. Search Bar
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
                const SizedBox(height: 12),

                // 4. Breakdown Table List
                Expanded(
                  child: Card(
                    child: viewModel.filteredItems.isEmpty
                        ? const Center(
                            child: Text(
                              'No hay consumos ni ventas registradas en el período seleccionado.',
                            ),
                          )
                        : ListView.separated(
                            itemCount: viewModel.filteredItems.length,
                            separatorBuilder: (context, index) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final item = viewModel.filteredItems[index];
                              return ListTile(
                                title: Text(
                                  item.insumoName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: Text(
                                  'Ventas: ${item.salesQuantity.toStringAsFixed(2)} ${item.consumptionUom} (C\$ ${item.salesCostNio.toStringAsFixed(2)})'
                                  '${item.shrinkageQuantity > 0 ? ' • Mermas: ${item.shrinkageQuantity.toStringAsFixed(2)} ${item.consumptionUom} (C\$ ${item.shrinkageCostNio.toStringAsFixed(2)})' : ''}',
                                ),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      'C\$ ${item.totalCostNio.toStringAsFixed(2)}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 14,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${item.costPercentage.toStringAsFixed(1)}% del total',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: colorScheme.primary,
                                      ),
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
