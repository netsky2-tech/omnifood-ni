import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../../domain/models/inventory/recipe.dart';
import '../../../../../domain/models/inventory/insumo.dart';
import 'recipe_view_model.dart';

class RecipeView extends StatefulWidget {
  const RecipeView({super.key});

  @override
  State<RecipeView> createState() => _RecipeViewState();
}

class _RecipeViewState extends State<RecipeView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RecipeViewModel>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<RecipeViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestión de Recetas (BOM)'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: Row(
        children: [
          // Products List
          Container(
            width: 300,
            decoration: BoxDecoration(
              border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text('PRODUCTOS', style: TextStyle(fontWeight: FontWeight.bold, color: colorScheme.primary)),
                ),
                Expanded(
                  child: viewModel.isLoading && viewModel.products.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : ListView.builder(
                        itemCount: viewModel.products.length,
                        itemBuilder: (context, index) {
                          final product = viewModel.products[index];
                          final isSelected = viewModel.selectedProduct?.id == product.id;
                          return ListTile(
                            title: Text(product.name, style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                            selected: isSelected,
                            selectedTileColor: colorScheme.primaryContainer.withValues(alpha: 0.3),
                            onTap: () => viewModel.selectProduct(product),
                          );
                        },
                      ),
                ),
              ],
            ),
          ),
          
          // Recipe Editor
          Expanded(
            child: viewModel.selectedProduct == null
              ? const Center(child: Text('Seleccione un producto para ver su receta'))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Ingredientes para: ${viewModel.selectedProduct!.name}', 
                            style: Theme.of(context).textTheme.headlineMedium),
                          ElevatedButton.icon(
                            onPressed: () => _showAddIngredientDialog(context),
                            icon: const Icon(Icons.add),
                            label: const Text('AGREGAR INGREDIENTE'),
                          ),
                        ],
                      ),
                    ),
                    const Divider(),
                    Expanded(
                      child: viewModel.isLoading
                        ? const Center(child: CircularProgressIndicator())
                        : viewModel.currentRecipes.isEmpty
                          ? const Center(child: Text('Este producto no tiene ingredientes definidos.'))
                          : ListView.separated(
                              padding: const EdgeInsets.all(24),
                              itemCount: viewModel.currentRecipes.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 12),
                              itemBuilder: (context, index) {
                                final recipe = viewModel.currentRecipes[index];
                                final insumo = viewModel.insumos.firstWhere(
                                  (i) => i.id == recipe.ingredientId,
                                  orElse: () => const Insumo(id: '', name: 'Desconocido', consumptionUom: '', stock: 0, averageCost: 0),
                                );

                                return Card(
                                  child: ListTile(
                                    title: Text(insumo.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                    subtitle: Text('Cantidad: ${recipe.quantity} ${insumo.consumptionUom}'),
                                    trailing: IconButton(
                                      icon: Icon(Icons.delete, color: colorScheme.error),
                                      onPressed: () => viewModel.removeIngredient(recipe.id),
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
          ),
        ],
      ),
    );
  }

  void _showAddIngredientDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const AddIngredientDialog(),
    );
  }
}

class AddIngredientDialog extends StatefulWidget {
  const AddIngredientDialog({super.key});

  @override
  State<AddIngredientDialog> createState() => _AddIngredientDialogState();
}

class _AddIngredientDialogState extends State<AddIngredientDialog> {
  String? _selectedInsumoId;
  final _quantityController = TextEditingController(text: '1.0');

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<RecipeViewModel>();

    return AlertDialog(
      title: const Text('Agregar Ingrediente'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: 'Insumo'),
              initialValue: _selectedInsumoId,
              items: viewModel.insumos.map((i) => DropdownMenuItem(
                value: i.id,
                child: Text(i.name),
              )).toList(),
              onChanged: (val) => setState(() => _selectedInsumoId = val),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _quantityController,
              decoration: const InputDecoration(
                labelText: 'Cantidad',
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: _selectedInsumoId == null
            ? null
            : () {
                final qty = double.tryParse(_quantityController.text) ?? 1.0;
                viewModel.addIngredient(
                  ingredientId: _selectedInsumoId!,
                  type: IngredientType.insumo,
                  quantity: qty,
                );
                Navigator.pop(context);
              },
          child: const Text('AGREGAR'),
        ),
      ],
    );
  }
}
