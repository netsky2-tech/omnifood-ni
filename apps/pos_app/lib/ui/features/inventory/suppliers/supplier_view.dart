import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'supplier_view_model.dart';

class SupplierView extends StatefulWidget {
  const SupplierView({super.key});

  @override
  State<SupplierView> createState() => _SupplierViewState();
}

class _SupplierViewState extends State<SupplierView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SupplierViewModel>().loadSuppliers();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Directorio de Proveedores'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showSupplierForm(context),
          ),
        ],
      ),
      body: Consumer<SupplierViewModel>(
        builder: (context, vm, child) {
          if (vm.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (vm.suppliers.isEmpty) {
            return const Center(child: Text('No hay proveedores registrados.'));
          }

          return ListView.builder(
            itemCount: vm.suppliers.length,
            itemBuilder: (context, index) {
              final supplier = vm.suppliers[index];
              return ListTile(
                title: Text(supplier.name),
                subtitle: Text(supplier.phone ?? 'Sin teléfono'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _showSupplierForm(context, supplier: supplier),
              );
            },
          );
        },
      ),
    );
  }

  void _showSupplierForm(BuildContext context, {dynamic supplier}) {
    final nameController = TextEditingController(text: supplier?.name ?? '');
    final phoneController = TextEditingController(text: supplier?.phone ?? '');
    final contactController = TextEditingController(text: supplier?.contactPerson ?? '');
    final termsController = TextEditingController(text: supplier?.creditTerms ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(supplier == null ? 'Nuevo Proveedor' : 'Editar Proveedor'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Nombre')),
              TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Teléfono')),
              TextField(controller: contactController, decoration: const InputDecoration(labelText: 'Contacto')),
              TextField(controller: termsController, decoration: const InputDecoration(labelText: 'Condiciones de Crédito')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              context.read<SupplierViewModel>().saveSupplier(
                id: supplier?.id,
                name: nameController.text,
                phone: phoneController.text,
                contactPerson: contactController.text,
                creditTerms: termsController.text,
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
