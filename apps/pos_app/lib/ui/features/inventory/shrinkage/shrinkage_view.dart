import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/models/inventory/insumo.dart';
import 'shrinkage_view_model.dart';

class ShrinkageView extends StatefulWidget {
  const ShrinkageView({super.key});

  @override
  State<ShrinkageView> createState() => _ShrinkageViewState();
}

class _ShrinkageViewState extends State<ShrinkageView> {
  final _qtyController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ShrinkageViewModel>().loadInsumos();
    });
  }

  @override
  void dispose() {
    _qtyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro de Mermas')),
      body: Consumer<ShrinkageViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading && vm.insumos.isEmpty) return const Center(child: CircularProgressIndicator());
          
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: ElevatedButton(
              onPressed: () => _showShrinkageForm(context),
              child: const Text('REGISTRAR MERMA'),
            ),
          );
        },
      ),
    );
  }

  void _showShrinkageForm(BuildContext context) {
    final vm = context.read<ShrinkageViewModel>();
    Insumo? selectedInsumo;
    String selectedShrinkageType = shrinkageTypes.first;
    _qtyController.clear();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => ChangeNotifierProvider<ShrinkageViewModel>.value(
        value: vm,
        child: Consumer<ShrinkageViewModel>(
          builder: (context, vm, child) => StatefulBuilder(
            builder: (context, setState) => AlertDialog(
              title: const Text('Registrar Merma'),
              content: SizedBox(
                width: 560,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Autocomplete<Insumo>(
                    displayStringForOption: (Insumo option) => option.name,
                    optionsBuilder: (TextEditingValue textEditingValue) {
                      if (textEditingValue.text == '') {
                        return const Iterable<Insumo>.empty();
                      }
                      return vm.insumos.where((Insumo option) {
                        return option.name.toLowerCase().contains(textEditingValue.text.toLowerCase());
                      });
                    },
                    onSelected: (Insumo selection) {
                      vm.previewAdjustment(selection.id);
                      setState(() => selectedInsumo = selection);
                    },
                    fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
                      return TextField(
                        controller: controller,
                        focusNode: focusNode,
                        decoration: const InputDecoration(labelText: 'Insumo (buscar...)'),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _qtyController,
                    decoration: const InputDecoration(labelText: 'Cantidad'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: selectedShrinkageType,
                    decoration: const InputDecoration(labelText: 'Tipo de merma'),
                    items: shrinkageTypes
                        .map((type) => DropdownMenuItem(value: type, child: Text(type)))
                        .toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() => selectedShrinkageType = value);
                    },
                  ),
                  if (vm.batchPreview.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const Text('Revisión FIFO antes del ajuste'),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: vm.selectedBatchId,
                      decoration: const InputDecoration(
                        labelText: 'Lote exacto a ajustar',
                      ),
                      items: vm.batchPreview
                          .map(
                            (batch) => DropdownMenuItem<String>(
                              value: batch.id,
                              child: Text(
                                '${batch.batchNumber} • ${_formatDate(batch.expirationDate)} • ${batch.remainingStock.toStringAsFixed(2)} u',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: vm.selectBatch,
                    ),
                    const SizedBox(height: 8),
                    ...vm.batchPreview.asMap().entries.map(
                      (entry) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('FIFO ${entry.key + 1}: ${entry.value.batchNumber}'),
                        subtitle: Text(
                          'Stock ${entry.value.remainingStock.toStringAsFixed(2)} • Valor C\$${entry.value.cost.toStringAsFixed(2)}',
                        ),
                      ),
                    ),
                  ],
                      if (vm.forensicNotice != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            vm.forensicNotice!,
                            style: const TextStyle(color: Colors.orange),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: vm.isLoading ? null : () => Navigator.pop(context),
                  child: const Text('CANCELAR'),
                ),
                ElevatedButton(
                  onPressed: (vm.isLoading ||
                          selectedInsumo == null ||
                          (vm.batchPreview.isNotEmpty && vm.selectedBatchId == null))
                      ? null
                      : () async {
                          final confirmed = await _confirmDestructiveAdjustment(
                            context,
                            vm,
                            selectedInsumo!,
                            double.tryParse(_qtyController.text) ?? 0,
                          );
                          if (!confirmed) {
                            return;
                          }

                          await vm.recordShrinkage(
                            insumoId: selectedInsumo!.id,
                            quantity: double.tryParse(_qtyController.text) ?? 0,
                            shrinkageType: selectedShrinkageType,
                          );
                          if (context.mounted) {
                            Navigator.pop(context);
                          }
                        },
                  child: vm.isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('REGISTRAR'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<bool> _confirmDestructiveAdjustment(
    BuildContext context,
    ShrinkageViewModel viewModel,
    Insumo insumo,
    double quantity,
  ) async {
    final selectedBatch = viewModel.selectedBatch;
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Dialog(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Confirmar ajuste destructivo',
                style: Theme.of(dialogContext).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text('Insumo: ${insumo.name}'),
              if (selectedBatch != null) ...[
                const SizedBox(height: 8),
                Text('Batch FIFO seleccionado: ${selectedBatch.batchNumber}'),
                Text(
                  'Valuación afectada: C\$${viewModel.projectedAdjustmentValue(quantity).toStringAsFixed(2)}',
                ),
              ],
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('CANCELAR AJUSTE'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('CONFIRMAR MERMA'),
              ),
            ],
          ),
        ),
      ),
    );

    return confirmed ?? false;
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }
}
