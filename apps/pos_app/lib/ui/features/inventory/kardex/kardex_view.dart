import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../design_system/design_system.dart';
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
      if (mounted) {
        _searchController.clear();
        context.read<KardexViewModel>().clearSearch();
        context.read<KardexViewModel>().loadInitialData();
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
    final colorScheme = Theme.of(context).colorScheme;
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Kardex BOH')),
      body: Consumer<KardexViewModel>(
        builder: (context, viewModel, child) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Compact / Expandable Explanatory Card
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    side: BorderSide(color: colorScheme.outlineVariant),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Theme(
                    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      leading: Icon(Icons.info_outline, color: colorScheme.primary, size: 20),
                      title: Text(
                        'Historial local de movimientos inventariables',
                        style: TextStyle(
                          fontSize: isHandheld ? 13 : 15,
                          fontWeight: FontWeight.bold,
                          color: colorScheme.onSurface,
                        ),
                      ),
                      initiallyExpanded: !isHandheld,
                      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      children: [
                        const Text(
                          'Fuente operativa: SQLite local como verdad de esta terminal POS, enriquecida con documentos BOH y estados de sincronización cuando existen.',
                          style: TextStyle(fontSize: 12),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Los costos históricos se muestran cuando el documento origen está disponible; los movimientos legados sin metadata conservan N/D de forma explícita.',
                          style: TextStyle(fontSize: 12),
                        ),
                        if (viewModel.errorMessage != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            viewModel.errorMessage!,
                            style: TextStyle(color: colorScheme.error, fontSize: 12),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // 2. Search Field
                TextField(
                  controller: _searchController,
                  onChanged: viewModel.setSearchQuery,
                  decoration: InputDecoration(
                    labelText: 'Buscar insumo o motivo',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: viewModel.searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              viewModel.clearSearch();
                            },
                          )
                        : null,
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
                if (viewModel.searchQuery.isNotEmpty ||
                    viewModel.selectedInsumoId != null ||
                    viewModel.startDate != null)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () {
                        _searchController.clear();
                        viewModel.clearSearch();
                        viewModel.setSelectedInsumo(null);
                        viewModel.clearDateRange();
                      },
                      child: const Text('Limpiar búsqueda'),
                    ),
                  ),
                const SizedBox(height: 8),

                // 3. Filters
                Row(
                  children: [
                    if (viewModel.availableInsumos.isNotEmpty)
                      Expanded(
                        child: DropdownButtonFormField<String?>(
                          value: viewModel.selectedInsumoId,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Filtrar Insumo',
                            isDense: true,
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          items: [
                            const DropdownMenuItem<String?>(
                              value: null,
                              child: Text('Todos los insumos'),
                            ),
                            ...viewModel.availableInsumos.map(
                              (i) => DropdownMenuItem<String?>(
                                value: i.id,
                                child: Text(
                                  i.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ],
                          onChanged: viewModel.setSelectedInsumo,
                        ),
                      ),
                    if (viewModel.availableInsumos.isNotEmpty)
                      const SizedBox(width: 8),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.date_range, size: 18),
                      label: Text(
                        viewModel.startDate != null && viewModel.endDate != null
                            ? '${viewModel.startDate!.day}/${viewModel.startDate!.month} - ${viewModel.endDate!.day}/${viewModel.endDate!.month}'
                            : 'Fechas',
                      ),
                      onPressed: () async {
                        final picked = await showDateRangePicker(
                          context: context,
                          firstDate: DateTime(2025, 1, 1),
                          lastDate: DateTime(2030, 12, 31),
                          initialDateRange: viewModel.startDate != null &&
                                  viewModel.endDate != null
                              ? DateTimeRange(
                                  start: viewModel.startDate!,
                                  end: viewModel.endDate!,
                                )
                              : null,
                        );
                        if (picked != null) {
                          viewModel.setDateRange(picked.start, picked.end);
                        }
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // 4. Type Chips
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
                const SizedBox(height: 12),

                // 5. Entries Content (Responsive Cards for mobile, DataTable for desktop)
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
                              : (isHandheld
                                  ? ListView.separated(
                                      itemCount: viewModel.visibleEntries.length,
                                      separatorBuilder: (context, _) => const SizedBox(height: 8),
                                      itemBuilder: (context, index) {
                                        final entry = viewModel.visibleEntries[index];
                                        return Card(
                                          margin: EdgeInsets.zero,
                                          child: ListTile(
                                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                            title: Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    entry.referenceLabel,
                                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                ),
                                                _buildCostingChip(context, entry),
                                              ],
                                            ),
                                            subtitle: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                const SizedBox(height: 4),
                                                Text(
                                                  '${entry.typeLabel.toUpperCase()} • ${entry.dateLabel}',
                                                  style: TextStyle(color: colorScheme.outline, fontSize: 11),
                                                ),
                                                const SizedBox(height: 4),
                                                Row(
                                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                                  children: [
                                                    Expanded(
                                                      child: Text(
                                                        'Cant: ${entry.quantityLabel} | Stock: ${entry.stockAfterLabel}',
                                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                                        overflow: TextOverflow.ellipsis,
                                                      ),
                                                    ),
                                                    const SizedBox(width: 8),
                                                    Text(
                                                      'Valor: ${entry.totalValueLabel}',
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        fontWeight: FontWeight.bold,
                                                        color: colorScheme.primary,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ],
                                            ),
                                            onTap: () => _showDetailSheet(context, entry),
                                          ),
                                        );
                                      },
                                    )
                                  : SingleChildScrollView(
                                      scrollDirection: Axis.horizontal,
                                      child: SingleChildScrollView(
                                        child: DataTable(
                                          columns: const [
                                            DataColumn(label: Text('Fecha')),
                                            DataColumn(label: Text('Tipo')),
                                            DataColumn(label: Text('Estado Costeo')),
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
                                                    DataCell(_buildCostingChip(context, entry), onTap: () => _showDetailSheet(context, entry)),
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
                                    )),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCostingChip(BuildContext context, KardexEntryViewData entry) {
    final colorScheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg) = switch (entry.estadoCosteo) {
      10 => (Colors.amber.shade100, Colors.amber.shade900), // Provisional
      20 => (Colors.blue.shade100, Colors.blue.shade900), // En proceso
      30 => (Colors.green.shade100, Colors.green.shade900), // Regularizado
      40 => (Colors.red.shade100, Colors.red.shade900), // Bloqueado
      _ => (colorScheme.surfaceContainerHighest, colorScheme.onSurfaceVariant),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        entry.costingStateLabel,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  Future<void> _showDetailSheet(
    BuildContext context,
    KardexEntryViewData entry,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SingleChildScrollView(
        child: Padding(
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
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                children: [
                  const Text('Estado de costeo:'),
                  _buildCostingChip(context, entry),
                ],
              ),
              if (entry.bloqueoMotivo != null)
                Text(
                  'Motivo de bloqueo: ${entry.bloqueoMotivo}',
                  style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                ),
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
      child: SingleChildScrollView(
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
      ),
    );
  }
}
