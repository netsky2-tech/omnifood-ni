import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'warehouse_view_model.dart';

class WarehouseView extends StatefulWidget {
  const WarehouseView({super.key});

  @override
  State<WarehouseView> createState() => _WarehouseViewState();
}

class _WarehouseViewState extends State<WarehouseView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WarehouseViewModel>().loadWarehouses();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestión de Almacenes'),
      ),
      body: Consumer<WarehouseViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (vm.warehouses.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'No hay almacenes registrados.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _showWarehouseForm(context),
                      icon: const Icon(Icons.add),
                      label: const Text('REGISTRAR PRIMER ALMACÉN'),
                    ),
                  ],
                ),
              ),
            );
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _showWarehouseForm(context),
                    icon: const Icon(Icons.add),
                    label: const Text('REGISTRAR ALMACÉN'),
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: vm.warehouses.length,
                  itemBuilder: (context, index) {
                    final warehouse = vm.warehouses[index];
                    return ListTile(
                      title: Text(warehouse.name),
                      subtitle: Text(warehouse.description ?? 'Sin descripción'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _showWarehouseForm(context, warehouse: warehouse),
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

  void _showWarehouseForm(BuildContext context, {dynamic warehouse}) {
    final nameController = TextEditingController(text: warehouse?.name ?? '');
    final descController = TextEditingController(text: warehouse?.description ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(warehouse == null ? 'Nuevo Almacén' : 'Editar Almacén'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Nombre')),
            TextField(controller: descController, decoration: const InputDecoration(labelText: 'Descripción')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              context.read<WarehouseViewModel>().saveWarehouse(
                id: warehouse?.id,
                name: nameController.text,
                description: descController.text,
              );
              Navigator.pop(context);
            },
            child: const Text('GUARDAR'),
          ),
        ],
      ),
    );
  }
}
