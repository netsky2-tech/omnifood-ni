import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'physical_count_view_model.dart';

class PhysicalCountView extends StatefulWidget {
  const PhysicalCountView({super.key});

  @override
  State<PhysicalCountView> createState() => _PhysicalCountViewState();
}

class _PhysicalCountViewState extends State<PhysicalCountView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PhysicalCountViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Conteo Físico / Ajustes')),
      body: Consumer<PhysicalCountViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading &&
              viewModel.availableInsumos.isEmpty &&
              viewModel.history.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

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
                          'Conteos físicos BOH',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Esta pantalla aplica movimientos compensatorios reales en el Kardex local de esta terminal. No simula conciliación global ni confirma sync remoto todavía.',
                        ),
                        if (viewModel.statusMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(viewModel.statusMessage!),
                        ],
                        if (viewModel.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            viewModel.errorMessage!,
                            style: TextStyle(color: Theme.of(context).colorScheme.error),
                          ),
                        ],
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: viewModel.availableInsumos.isEmpty || viewModel.isLoading
                              ? null
                              : () => _showCreateCountDialog(context, viewModel),
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('NUEVO CONTEO / AJUSTE'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: viewModel.history.isEmpty
                      ? const _EmptyPhysicalCountState()
                      : ListView.separated(
                          itemCount: viewModel.history.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final entry = viewModel.history[index];
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            entry.insumoName,
                                            style: Theme.of(context).textTheme.titleMedium,
                                          ),
                                        ),
                                        const Chip(label: Text('Aplicado localmente')),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Esperado: ${entry.expectedQuantity.toStringAsFixed(2)} ${entry.uom}'.trim(),
                                    ),
                                    Text(
                                      'Contado: ${entry.countedQuantity.toStringAsFixed(2)} ${entry.uom}'.trim(),
                                    ),
                                    Text(
                                      'Variación: ${entry.variance.toStringAsFixed(2)} ${entry.uom}'.trim(),
                                    ),
                                    Text('Motivo: ${entry.reason}'),
                                    if (entry.notes.isNotEmpty) Text('Notas: ${entry.notes}'),
                                    const SizedBox(height: 8),
                                    Text('Aplicado: ${entry.appliedAtLabel}'),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showCreateCountDialog(
    BuildContext context,
    PhysicalCountViewModel viewModel,
  ) async {
    final countedController = TextEditingController();
    final reasonController = TextEditingController();
    final notesController = TextEditingController();
    String? insumoId;
    String? validationMessage;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) {
          final theoretical = insumoId == null ? null : viewModel.theoreticalQuantityFor(insumoId!);
          final counted = double.tryParse(countedController.text.trim());
          final variance = theoretical == null || counted == null
              ? null
              : viewModel.calculateVariance(
                  theoreticalQuantity: theoretical,
                  countedQuantity: counted,
                );

          return AlertDialog(
            title: const Text('Nuevo conteo físico'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    decoration: const InputDecoration(labelText: 'Insumo / item'),
                    items: viewModel.availableInsumos
                        .map(
                          (insumo) => DropdownMenuItem<String>(
                            value: insumo.id,
                            child: Text(insumo.name),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: (value) => setState(() => insumoId = value),
                  ),
                  const SizedBox(height: 12),
                  _ReadOnlyMetricField(
                    label: 'Cantidad teórica / esperada',
                    value: theoretical == null ? '' : theoretical.toStringAsFixed(2),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: countedController,
                    decoration: const InputDecoration(labelText: 'Cantidad contada'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  _ReadOnlyMetricField(
                    label: 'Variación',
                    value: variance == null ? '' : variance.toStringAsFixed(2),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: reasonController,
                    decoration: const InputDecoration(labelText: 'Motivo'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    minLines: 2,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Notas'),
                  ),
                  if (validationMessage != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      validationMessage!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: viewModel.isLoading ? null : () => Navigator.pop(dialogContext),
                child: const Text('CANCELAR'),
              ),
              ElevatedButton(
                onPressed: viewModel.isLoading
                    ? null
                    : () async {
                        final parsedCount = double.tryParse(countedController.text.trim());
                        if (insumoId == null || parsedCount == null || reasonController.text.trim().isEmpty) {
                          setState(() {
                            validationMessage =
                                'Seleccioná un insumo, ingresá una cantidad válida y completá el motivo.';
                          });
                          return;
                        }

                        final theoreticalQuantity = viewModel.theoreticalQuantityFor(insumoId!);
                        if (viewModel.calculateVariance(
                              theoreticalQuantity: theoreticalQuantity,
                              countedQuantity: parsedCount,
                            ) ==
                            0) {
                          setState(() {
                            validationMessage = 'No hay diferencia que requiera ajuste compensatorio.';
                          });
                          return;
                        }

                        await viewModel.applyPhysicalCount(
                          insumoId: insumoId!,
                          countedQuantity: parsedCount,
                          reason: reasonController.text,
                          notes: notesController.text,
                        );

                        if (dialogContext.mounted) {
                          FocusScope.of(dialogContext).unfocus();
                          Navigator.pop(dialogContext);
                        }
                      },
                child: const Text('APLICAR AJUSTE'),
              ),
            ],
          );
        },
      ),
    );

  }
}

class _EmptyPhysicalCountState extends StatelessWidget {
  const _EmptyPhysicalCountState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.fact_check_outlined, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            'Todavía no hay conteos físicos aplicados en esta terminal.',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Usá el CTA superior para registrar el primer ajuste compensatorio local.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ReadOnlyMetricField extends StatelessWidget {
  const _ReadOnlyMetricField({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: Text(value),
    );
  }
}
