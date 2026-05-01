import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'purchase_view_model.dart';

class PurchaseView extends StatefulWidget {
  const PurchaseView({super.key});

  @override
  State<PurchaseView> createState() => _PurchaseViewState();
}

class _PurchaseViewState extends State<PurchaseView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PurchaseViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Registro de Compras')),
      body: Consumer<PurchaseViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading) return const Center(child: CircularProgressIndicator());
          
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              children: [
                // Minimal form to trigger purchase logic
                ElevatedButton(
                  onPressed: () => _showPurchaseForm(context),
                  child: const Text('REGISTRAR NUEVA COMPRA'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showPurchaseForm(BuildContext context) {
    final vm = context.read<PurchaseViewModel>();
    String? selectedInsumoId;
    String? selectedSupplierId;
    String? selectedUomId;
    final qtyController = TextEditingController();
    final costController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Nueva Compra'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Insumo'),
                  items: vm.insumos.map((i) => DropdownMenuItem(value: i.id, child: Text(i.name))).toList(),
                  onChanged: (val) {
                    setState(() {
                      selectedInsumoId = val;
                      vm.loadInitialData(insumoId: val);
                    });
                  },
                ),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Presentación'),
                  items: vm.conversions.map((c) => DropdownMenuItem(value: c.id, child: Text(c.unitName))).toList(),
                  onChanged: (val) => setState(() => selectedUomId = val),
                ),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Proveedor'),
                  items: vm.suppliers.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name))).toList(),
                  onChanged: (val) => setState(() => selectedSupplierId = val),
                ),
                TextField(controller: qtyController, decoration: const InputDecoration(labelText: 'Cantidad'), keyboardType: TextInputType.number),
                TextField(controller: costController, decoration: const InputDecoration(labelText: 'Costo por Unidad'), keyboardType: TextInputType.number),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
            ElevatedButton(
              onPressed: () {
                if (selectedInsumoId != null && selectedSupplierId != null && selectedUomId != null) {
                  vm.recordPurchase(
                    insumoId: selectedInsumoId!,
                    supplierId: selectedSupplierId!,
                    uomConversionId: selectedUomId!,
                    quantity: double.tryParse(qtyController.text) ?? 0,
                    unitCost: double.tryParse(costController.text) ?? 0,
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
