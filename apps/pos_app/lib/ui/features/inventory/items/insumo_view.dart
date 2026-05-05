import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'insumo_view_model.dart';
import '../../../../domain/models/inventory/product.dart';
import 'item_options_editor.dart';

class InsumoView extends StatefulWidget {
  const InsumoView({super.key});

  @override
  State<InsumoView> createState() => _InsumoViewState();
}

class _InsumoViewState extends State<InsumoView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InsumoViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Gestión de Inventario'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'INSUMOS (Materia Prima)'),
              Tab(text: 'PRODUCTOS (Venta)'),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showInsumoForm(context),
            ),
          ],
        ),
        body: TabBarView(
          children: [
            _buildInsumosTab(),
            _buildProductsTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildInsumosTab() {
    return Consumer<InsumoViewModel>(
      builder: (context, vm, child) {
        if (vm.isLoading) return const Center(child: CircularProgressIndicator());
        if (vm.insumos.isEmpty) return const Center(child: Text('No hay insumos registrados.'));

        return ListView.builder(
          itemCount: vm.insumos.length,
          itemBuilder: (context, index) {
            final insumo = vm.insumos[index];
            return ListTile(
              title: Text(insumo.name),
              subtitle: Text('Stock: ${insumo.stock} ${insumo.consumptionUom}'),
              trailing: Text(insumo.isPerishable ? 'PERECEDERO' : 'MTO'),
              onTap: () => _showInsumoForm(context, insumo: insumo),
            );
          },
        );
      },
    );
  }

  Widget _buildProductsTab() {
    return Consumer<InsumoViewModel>(
      builder: (context, vm, child) {
        if (vm.isLoading) return const Center(child: CircularProgressIndicator());
        if (vm.products.isEmpty) return const Center(child: Text('No hay productos registrados.'));

        return ListView.builder(
          itemCount: vm.products.length,
          itemBuilder: (context, index) {
            final product = vm.products[index];
            return ListTile(
              title: Text(product.name),
              subtitle: Text('SKU: ${product.sku ?? "N/A"} | \$${product.sellPrice.toStringAsFixed(2)}'),
              trailing: Text('${product.variants.length} Var | ${product.availableModifiers.length} Mod'),
              onTap: () => _showProductOptionsEditor(context, product),
            );
          },
        );
      },
    );
  }

  void _showProductOptionsEditor(BuildContext context, Product product) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ItemOptionsEditor(
          product: product,
          onSave: (variants, modifiers) async {
            await context.read<InsumoViewModel>().saveProductOptions(
              productId: product.id,
              variants: variants,
              modifiers: modifiers,
            );
            if (context.mounted) Navigator.pop(context);
          },
        ),
      ),
    );
  }

  void _showInsumoForm(BuildContext context, {dynamic insumo}) {
    final vm = context.read<InsumoViewModel>();
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController(text: insumo?.name ?? '');
    final uomController = TextEditingController(text: insumo?.consumptionUom ?? '');
    final parController = TextEditingController(text: insumo?.parLevel?.toString() ?? '');
    // In actual app, default factor would be managed here or in a separate UOM dialog
    String? selectedWarehouseId = insumo?.warehouseId;
    bool isPerishable = insumo?.isPerishable ?? false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(insumo == null ? 'Nuevo Insumo' : 'Editar Insumo'),
          content: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Nombre'),
                    validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
                  ),
                  TextFormField(
                    controller: uomController,
                    decoration: const InputDecoration(labelText: 'UOM Consumo'),
                    validator: (v) => v == null || v.isEmpty ? 'Requerido' : null,
                  ),
                  TextFormField(
                    controller: parController,
                    decoration: const InputDecoration(labelText: 'Nivel PAR'),
                    keyboardType: TextInputType.number,
                  ),
                  TextFormField(
                    initialValue: '1.0',
                    decoration: const InputDecoration(labelText: 'Factor de Conversión (Default)'),
                    keyboardType: TextInputType.number,
                    validator: (v) {
                      final val = double.tryParse(v ?? '');
                      if (val == null || val <= 0) return 'Debe ser mayor a 0';
                      return null;
                    },
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: selectedWarehouseId,
                    decoration: const InputDecoration(labelText: 'Almacén'),
                    items: vm.warehouses.map((w) => DropdownMenuItem(value: w.id, child: Text(w.name))).toList(),
                    onChanged: (val) => setState(() => selectedWarehouseId = val),
                  ),
                  SwitchListTile(
                    title: const Text('¿Es Perecedero?'),
                    subtitle: const Text('Habilita control de lotes/vencimiento'),
                    value: isPerishable,
                    onChanged: (val) => setState(() => isPerishable = val),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() ?? false) {
                  vm.saveInsumo(
                    id: insumo?.id,
                    name: nameController.text,
                    consumptionUom: uomController.text,
                    stock: insumo?.stock ?? 0,
                    averageCost: insumo?.averageCost ?? 0,
                    parLevel: double.tryParse(parController.text),
                    warehouseId: selectedWarehouseId,
                    isPerishable: isPerishable,
                  );
                  Navigator.pop(context);
                }
              },
              child: const Text('GUARDAR'),
            ),
          ],
        ),
      ),
    );
  }
}
