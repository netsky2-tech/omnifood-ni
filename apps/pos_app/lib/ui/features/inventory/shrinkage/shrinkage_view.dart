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
              content: Column(
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
              TextField(
                controller: _qtyController,
                decoration: const InputDecoration(labelText: 'Cantidad'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
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
          actions: [
            TextButton(
              onPressed: vm.isLoading ? null : () => Navigator.pop(context),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: (vm.isLoading || selectedInsumo == null)
                  ? null
                  : () async {
                      await vm.recordShrinkage(
                        insumoId: selectedInsumo!.id,
                        quantity: double.tryParse(_qtyController.text) ?? 0,
                        shrinkageType: selectedShrinkageType,
                      );
                      if (context.mounted) Navigator.pop(context);
                    },
              child: vm.isLoading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('REGISTRAR'),
            ),
          ],
        ),
      ),
    ),
  ),
);
}
}
