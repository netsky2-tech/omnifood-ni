import 'package:flutter/material.dart';
import '../../../../domain/models/inventory/product.dart';
import 'package:uuid/uuid.dart';

class ItemOptionsEditor extends StatefulWidget {
  final Product product;
  final Function(List<ProductVariant> variants, List<Modifier> modifiers) onSave;

  const ItemOptionsEditor({
    super.key,
    required this.product,
    required this.onSave,
  });

  @override
  State<ItemOptionsEditor> createState() => _ItemOptionsEditorState();
}

class _ItemOptionsEditorState extends State<ItemOptionsEditor> {
  late List<ProductVariant> _variants;
  late List<Modifier> _modifiers;

  @override
  void initState() {
    super.initState();
    _variants = List.from(widget.product.variants);
    _modifiers = List.from(widget.product.availableModifiers);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Opciones: ${widget.product.name}'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'VARIANTES (Tallas/Tipos)'),
              Tab(text: 'MODIFICADORES (Extras)'),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.save),
              onPressed: () => widget.onSave(_variants, _modifiers),
              tooltip: 'Guardar cambios',
            ),
          ],
        ),
        body: TabBarView(
          children: [
            _buildProductVariantsTab(),
            _buildModifiersTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildProductVariantsTab() {
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.all(16.0),
          child: Text('Las variantes permiten definir diferentes versiones del producto (ej: Pequeño, Mediano, Grande) con ajustes de precio.'),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _variants.length,
            itemBuilder: (context, index) {
              final v = _variants[index];
              return ListTile(
                title: Text(v.name),
                subtitle: Text('Ajuste de precio: +\$${v.priceAdjustment.toStringAsFixed(2)}'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete, color: Colors.red),
                  onPressed: () => setState(() => _variants.removeAt(index)),
                ),
                onTap: () => _showProductVariantForm(variant: v, index: index),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: ElevatedButton.icon(
            icon: const Icon(Icons.add),
            label: const Text('AGREGAR VARIANTE'),
            onPressed: () => _showProductVariantForm(),
          ),
        ),
      ],
    );
  }

  Widget _buildModifiersTab() {
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.all(16.0),
          child: Text('Los modificadores son extras u opciones opcionales que el cliente puede elegir (ej: Extra Queso, Sin Cebolla).'),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _modifiers.length,
            itemBuilder: (context, index) {
              final m = _modifiers[index];
              return ListTile(
                title: Text(m.name),
                subtitle: Text('Precio extra: +\$${m.extraPrice.toStringAsFixed(2)}'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete, color: Colors.red),
                  onPressed: () => setState(() => _modifiers.removeAt(index)),
                ),
                onTap: () => _showModifierForm(modifier: m, index: index),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: ElevatedButton.icon(
            icon: const Icon(Icons.add),
            label: const Text('AGREGAR MODIFICADOR'),
            onPressed: () => _showModifierForm(),
          ),
        ),
      ],
    );
  }

  void _showProductVariantForm({ProductVariant? variant, int? index}) {
    final nameController = TextEditingController(text: variant?.name ?? '');
    final priceController = TextEditingController(text: variant?.priceAdjustment.toString() ?? '0.0');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(variant == null ? 'Nueva ProductVariante' : 'Editar ProductVariante'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Nombre (ej: Grande)'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: priceController,
              decoration: const InputDecoration(labelText: 'Ajuste de Precio', prefixText: '\$ '),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              final newProductVariant = ProductVariant(
                id: variant?.id ?? const Uuid().v4(),
                name: nameController.text,
                priceAdjustment: double.tryParse(priceController.text) ?? 0.0,
              );
              setState(() {
                if (index != null) {
                  _variants[index] = newProductVariant;
                } else {
                  _variants.add(newProductVariant);
                }
              });
              Navigator.pop(context);
            },
            child: const Text('ACEPTAR'),
          ),
        ],
      ),
    );
  }

  void _showModifierForm({Modifier? modifier, int? index}) {
    final nameController = TextEditingController(text: modifier?.name ?? '');
    final priceController = TextEditingController(text: modifier?.extraPrice.toString() ?? '0.0');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(modifier == null ? 'Nuevo Modificador' : 'Editar Modificador'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Nombre (ej: Extra Queso)'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: priceController,
              decoration: const InputDecoration(labelText: 'Precio Extra', prefixText: '\$ '),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              final newModifier = Modifier(
                id: modifier?.id ?? const Uuid().v4(),
                name: nameController.text,
                extraPrice: double.tryParse(priceController.text) ?? 0.0,
              );
              setState(() {
                if (index != null) {
                  _modifiers[index] = newModifier;
                } else {
                  _modifiers.add(newModifier);
                }
              });
              Navigator.pop(context);
            },
            child: const Text('ACEPTAR'),
          ),
        ],
      ),
    );
  }
}
