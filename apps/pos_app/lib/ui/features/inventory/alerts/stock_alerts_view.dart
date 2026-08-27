import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'stock_alerts_view_model.dart';

class StockAlertsView extends StatefulWidget {
  const StockAlertsView({super.key});

  @override
  State<StockAlertsView> createState() => _StockAlertsViewState();
}

class _StockAlertsViewState extends State<StockAlertsView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _searchController.clear();
        context.read<StockAlertsViewModel>().clearSearch();
        context.read<StockAlertsViewModel>().loadStockAlerts();
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alertas de Stock'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar alertas',
            onPressed: () {
              context.read<StockAlertsViewModel>().loadStockAlerts();
            },
          ),
        ],
      ),
      body: Consumer<StockAlertsViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading && vm.alerts.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          if (vm.errorMessage != null && vm.alerts.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      vm.errorMessage!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: vm.loadStockAlerts,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reintentar'),
                    ),
                  ],
                ),
              ),
            );
          }

          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top KPI Summary Cards
                _buildSummaryCards(context, vm),
                const SizedBox(height: 16),

                // Search Box
                TextField(
                  controller: _searchController,
                  onChanged: vm.setSearchQuery,
                  decoration: InputDecoration(
                    labelText: 'Buscar insumo en alerta...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: vm.searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              vm.clearSearch();
                            },
                          )
                        : null,
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),

                // Severity Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      FilterChip(
                        label: Text('Todas (${vm.totalAlertsCount})'),
                        selected: vm.severityFilter == null,
                        onSelected: (_) => vm.setSeverityFilter(null),
                      ),
                      const SizedBox(width: 8),
                      FilterChip(
                        label: Text('Críticas (${vm.criticalCount})'),
                        selected:
                            vm.severityFilter == StockAlertSeverity.critical,
                        selectedColor: Colors.red.shade100,
                        onSelected: (_) => vm.setSeverityFilter(
                          vm.severityFilter == StockAlertSeverity.critical
                              ? null
                              : StockAlertSeverity.critical,
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilterChip(
                        label: Text('Negativas (${vm.negativeCount})'),
                        selected:
                            vm.severityFilter == StockAlertSeverity.negativeStock,
                        selectedColor: Colors.deepOrange.shade100,
                        onSelected: (_) => vm.setSeverityFilter(
                          vm.severityFilter == StockAlertSeverity.negativeStock
                              ? null
                              : StockAlertSeverity.negativeStock,
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilterChip(
                        label: Text('Stock Bajo (${vm.warningCount})'),
                        selected:
                            vm.severityFilter == StockAlertSeverity.warning,
                        selectedColor: Colors.amber.shade100,
                        onSelected: (_) => vm.setSeverityFilter(
                          vm.severityFilter == StockAlertSeverity.warning
                              ? null
                              : StockAlertSeverity.warning,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Alert Items Table / Empty state
                Expanded(
                  child: vm.alerts.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.check_circle_outline,
                                size: 56,
                                color: Colors.green,
                              ),
                              SizedBox(height: 12),
                              Text(
                                'No hay alertas de stock activas.',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Todos los insumos se encuentran dentro de niveles operativos óptimos.',
                                style: TextStyle(color: Colors.grey),
                              ),
                            ],
                          ),
                        )
                      : vm.filteredAlerts.isEmpty
                          ? const Center(
                              child: Text(
                                'No se encontraron alertas con el filtro seleccionado.',
                              ),
                            )
                          : _buildAlertsList(context, vm.filteredAlerts),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSummaryCards(BuildContext context, StockAlertsViewModel vm) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth > 600;
        return GridView.count(
          crossAxisCount: isWide ? 4 : 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: isWide ? 2.5 : 2.0,
          children: [
            _buildCard(
              context,
              title: 'Total Alertas',
              value: '${vm.totalAlertsCount}',
              color: Colors.blueGrey,
              icon: Icons.notifications_active,
            ),
            _buildCard(
              context,
              title: 'Críticas',
              value: '${vm.criticalCount}',
              color: Colors.red,
              icon: Icons.cancel,
            ),
            _buildCard(
              context,
              title: 'Negativas',
              value: '${vm.negativeCount}',
              color: Colors.deepOrange,
              icon: Icons.trending_down,
            ),
            _buildCard(
              context,
              title: 'Stock Bajo',
              value: '${vm.warningCount}',
              color: Colors.amber.shade800,
              icon: Icons.warning_amber_rounded,
            ),
          ],
        );
      },
    );
  }

  Widget _buildCard(
    BuildContext context, {
    required String title,
    required String value,
    required Color color,
    required IconData icon,
  }) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withOpacity(0.15),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  Text(
                    value,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: color,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAlertsList(BuildContext context, List<StockAlertItem> alerts) {
    return ListView.separated(
      itemCount: alerts.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final alert = alerts[index];
        final badgeColor = switch (alert.severity) {
          StockAlertSeverity.negativeStock => Colors.deepOrange,
          StockAlertSeverity.critical => Colors.red,
          StockAlertSeverity.warning => Colors.amber.shade800,
        };
        final badgeLabel = switch (alert.severity) {
          StockAlertSeverity.negativeStock => 'NEGATIVO',
          StockAlertSeverity.critical => 'AGOTADO',
          StockAlertSeverity.warning => 'BAJO',
        };

        return Card(
          child: ListTile(
            leading: Chip(
              label: Text(
                badgeLabel,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 10,
                ),
              ),
              backgroundColor: badgeColor,
              padding: EdgeInsets.zero,
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    alert.insumoName,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Text(
                  '${alert.stock.toStringAsFixed(2)} ${alert.consumptionUom}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: alert.stock <= 0 ? Colors.red : null,
                  ),
                ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Text(alert.message),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (alert.minStock != null)
                      Text(
                        'Mín: ${alert.minStock!.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    if (alert.parLevel != null)
                      Text(
                        'Par: ${alert.parLevel!.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    Text(
                      'Sugerido reorden: +${alert.suggestedReorderQuantity.toStringAsFixed(2)} ${alert.consumptionUom}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.blueGrey,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
