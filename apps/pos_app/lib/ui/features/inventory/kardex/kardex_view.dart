import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'kardex_view_model.dart';

class KardexView extends StatefulWidget {
  const KardexView({super.key});

  @override
  State<KardexView> createState() => _KardexViewState();
}

class _KardexViewState extends State<KardexView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<KardexViewModel>().loadInitialData();
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
      appBar: AppBar(title: const Text('Kardex BOH')),
      body: Consumer<KardexViewModel>(
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
                          'Historial local de movimientos inventariables',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Fuente operativa: SQLite local como verdad de esta terminal POS, enriquecida con documentos BOH y estados de sincronización cuando existen.',
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Los costos históricos se muestran cuando el documento origen está disponible; los movimientos legados sin metadata conservan N/D de forma explícita.',
                        ),
                        if (viewModel.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            viewModel.errorMessage!,
                            style: TextStyle(color: Theme.of(context).colorScheme.error),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _searchController,
                  onChanged: viewModel.setSearchQuery,
                  decoration: const InputDecoration(
                    labelText: 'Buscar insumo o motivo',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
                if (viewModel.searchQuery.isNotEmpty)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () {
                        _searchController.clear();
                        viewModel.clearSearch();
                      },
                      child: const Text('Limpiar búsqueda'),
                    ),
                  ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: KardexTypeFilter.values
                        .map(
                          (filter) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(viewModel.chipLabelFor(filter)),
                              selected: viewModel.typeFilter == filter,
                              onSelected: (_) => viewModel.setTypeFilter(filter),
                            ),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: viewModel.isLoading && viewModel.entries.isEmpty
                      ? const Center(child: CircularProgressIndicator())
                      : viewModel.entries.isEmpty
                          ? const _EmptyKardexState(
                              message:
                                  'Todavía no hay movimientos locales para mostrar en el Kardex de esta terminal.',
                            )
                          : viewModel.visibleEntries.isEmpty
                              ? const _EmptyKardexState(
                                  message:
                                      'No hay movimientos que coincidan con la búsqueda o el filtro actual.',
                                )
                              : SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: SingleChildScrollView(
                                    child: DataTable(
                                       columns: const [
                                         DataColumn(label: Text('Fecha')),
                                         DataColumn(label: Text('Tipo')),
                                         DataColumn(label: Text('Referencia')),
                                         DataColumn(label: Text('Documento')),
                                         DataColumn(label: Text('Cantidad')),
                                         DataColumn(label: Text('Stock final')),
                                         DataColumn(label: Text('Costo unit.')),
                                         DataColumn(label: Text('Valor')),
                                      ],
                                      rows: viewModel.visibleEntries
                                          .map(
                                            (entry) => DataRow(
                                              cells: [
                                                 DataCell(Text(entry.dateLabel), onTap: () => _showDetailSheet(context, entry)),
                                                 DataCell(Text(entry.typeLabel.toUpperCase()), onTap: () => _showDetailSheet(context, entry)),
                                                 DataCell(Text(entry.referenceLabel), onTap: () => _showDetailSheet(context, entry)),
                                                 DataCell(Text(entry.sourceDocumentLabel), onTap: () => _showDetailSheet(context, entry)),
                                                  DataCell(Text(entry.quantityLabel, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])), onTap: () => _showDetailSheet(context, entry)),
                                                  DataCell(Text(entry.stockAfterLabel, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])), onTap: () => _showDetailSheet(context, entry)),
                                                  DataCell(Text(entry.unitCostLabel, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])), onTap: () => _showDetailSheet(context, entry)),
                                                  DataCell(Text(entry.totalValueLabel, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])), onTap: () => _showDetailSheet(context, entry)),
                                              ],
                                            ),
                                          )
                                          .toList(growable: false),
                                    ),
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

  Future<void> _showDetailSheet(
    BuildContext context,
    KardexEntryViewData entry,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Detalle del movimiento', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text('ID: ${entry.id}'),
            Text('Referencia: ${entry.referenceLabel}'),
            Text('Tipo: ${entry.typeLabel}'),
            Text('Documento origen: ${entry.sourceDocumentLabel}'),
            Text('Fecha: ${entry.dateLabel}'),
            Text('Stock previo: ${entry.stockBeforeLabel}', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
            Text('Stock final: ${entry.stockAfterLabel}', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
            Text('Costo unitario: ${entry.unitCostLabel}', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
            Text('Valor total: ${entry.totalValueLabel}', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
            Text('Alertas relacionadas: ${entry.relatedAlertCount}', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
            Text('Detalle operativo: ${entry.reasonLabel}'),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _EmptyKardexState extends StatelessWidget {
  const _EmptyKardexState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inventory_outlined, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}
