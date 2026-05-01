import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
          if (vm.isLoading) return const Center(child: CircularProgressIndicator());
          
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
    String? selectedInsumoId;
    final qtyController = TextEditingController();
    final reasonController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Registrar Merma'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(labelText: 'Insumo'),
                items: vm.insumos.map((i) => DropdownMenuItem(value: i.id, child: Text(i.name))).toList(),
                onChanged: (val) => setState(() => selectedInsumoId = val),
              ),
              TextField(controller: qtyController, decoration: const InputDecoration(labelText: 'Cantidad'), keyboardType: TextInputType.number),
              TextField(controller: reasonController, decoration: const InputDecoration(labelText: 'Motivo')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
            ElevatedButton(
              onPressed: () {
                if (selectedInsumoId != null) {
                  vm.recordShrinkage(
                    insumoId: selectedInsumoId!,
                    quantity: double.tryParse(qtyController.text) ?? 0,
                    reason: reasonController.text,
                  );
                  Navigator.pop(context);
                }
              },
              child: const Text('REGISTRAR'),
            ),
          ],
        ),
      ),
    );
  }
}
