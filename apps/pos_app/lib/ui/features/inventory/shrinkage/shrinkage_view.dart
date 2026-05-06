import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../../domain/models/inventory/insumo.dart';
import 'shrinkage_view_model.dart';

class ShrinkageView extends StatefulWidget {
  const ShrinkageView({super.key});

  @override
  State<ShrinkageView> createState() => _ShrinkageViewState();
}

class _ShrinkageViewState extends State<ShrinkageView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ShrinkageViewModel>().loadInsumos();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro de Mermas')),
      body: Consumer<ShrinkageViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading && vm.insumos.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => _showShrinkageForm(context),
                        icon: const Icon(Icons.add),
                        label: const Text('REGISTRAR NUEVA MERMA'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(),
              const Padding(
                padding: EdgeInsets.all(8.0),
                child: Text(
                  'Mermas Recientes',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
              Expanded(
                child: vm.recentMermas.isEmpty
                    ? const Center(child: Text('No hay mermas registradas'))
                    : ListView.builder(
                        itemCount: vm.recentMermas.length,
                        itemBuilder: (context, index) {
                          final mov = vm.recentMermas[index];
                          final insumo = vm.insumos.firstWhere(
                            (i) => i.id == mov.insumoId,
                            orElse: () => Insumo(
                              id: mov.insumoId,
                              name: 'Desconocido',
                              consumptionUom: '',
                              stock: 0,
                              averageCost: 0,
                            ),
                          );

                          return ListTile(
                            leading: const CircleAvatar(
                              backgroundColor: Colors.orange,
                              child: Icon(Icons.warning, color: Colors.white),
                            ),
                            title: Text('${insumo.name}: ${mov.quantity.abs()} ${insumo.consumptionUom}'),
                            subtitle: Text(mov.reason ?? 'Sin motivo'),
                            trailing: Text(
                              DateFormat('dd/MM HH:mm').format(mov.timestamp),
                              style: const TextStyle(fontSize: 12),
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showShrinkageForm(BuildContext context) {
    final vm = context.read<ShrinkageViewModel>();
    String? selectedInsumoId;
    final qtyController = TextEditingController();
    final reasonController = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogContext) => ChangeNotifierProvider.value(
        value: vm,
        child: StatefulBuilder(
          builder: (context, setState) => AlertDialog(
            title: const Text('Registrar Merma'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    decoration: const InputDecoration(labelText: 'Insumo'),
                    items: vm.insumos.map((i) => DropdownMenuItem(value: i.id, child: Text(i.name))).toList(),
                    onChanged: (val) => setState(() => selectedInsumoId = val),
                  ),
                  TextField(
                    controller: qtyController,
                    decoration: const InputDecoration(labelText: 'Cantidad'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  TextField(
                    controller: reasonController,
                    decoration: const InputDecoration(labelText: 'Motivo'),
                  ),
                  Consumer<ShrinkageViewModel>(
                    builder: (context, vm, child) {
                      if (vm.errorMessage != null) {
                        return Padding(
                          padding: const EdgeInsets.only(top: 8.0),
                          child: Text(
                            vm.errorMessage!,
                            style: const TextStyle(color: Colors.red, fontSize: 12),
                          ),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  vm.clearError();
                  Navigator.pop(context);
                },
                child: const Text('CANCELAR'),
              ),
              ElevatedButton(
                onPressed: () async {
                  final success = await vm.recordShrinkage(
                    insumoId: selectedInsumoId,
                    quantityStr: qtyController.text,
                    reason: reasonController.text,
                  );
                  if (success && context.mounted) {
                    Navigator.pop(context);
                  }
                },
                child: const Text('REGISTRAR'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
