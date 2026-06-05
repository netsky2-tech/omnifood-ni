import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../../domain/models/inventory/recipe.dart';
import '../../../design_system/design_system.dart';
import 'recipe_version_compare_view.dart';
import 'recipe_view_model.dart';

class RecipeView extends StatefulWidget {
  const RecipeView({super.key});

  @override
  State<RecipeView> createState() => _RecipeViewState();
}

class _RecipeViewState extends State<RecipeView> {
  final TextEditingController _yieldController = TextEditingController(text: '1');
  final TextEditingController _shrinkController = TextEditingController(text: '0');
  final TextEditingController _noteController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RecipeViewModel>().loadInitialData();
    });
  }

  @override
  void dispose() {
    _yieldController.dispose();
    _shrinkController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<RecipeViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recetas BOH'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: Row(
        children: [
          Container(
            width: 280,
            decoration: BoxDecoration(
              border: Border(right: BorderSide(color: colorScheme.outlineVariant)),
            ),
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'PRODUCTOS',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: viewModel.isLoading && viewModel.products.isEmpty
                      ? const Center(child: CircularProgressIndicator())
                      : viewModel.products.isEmpty
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.menu_book_outlined,
                                      size: 40,
                                      color: colorScheme.outline,
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'No hay productos. Creá un producto preparado en "Gestión de Inventario" y volvé acá para versionar su receta.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: colorScheme.onSurfaceVariant,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : ListView.separated(
                              itemCount: viewModel.products.length,
                              separatorBuilder: (context, _) =>
                                  const Divider(height: 1, thickness: 1),
                              itemBuilder: (context, index) {
                                final product = viewModel.products[index];
                                final isSelected =
                                    viewModel.selectedProduct?.id == product.id;
                                return ListTile(
                                  title: Text(product.name),
                                  subtitle: Text(
                                    isSelected ? 'Seleccionado' : 'Abrir timeline',
                                  ),
                                  selected: isSelected,
                                  selectedTileColor:
                                      colorScheme.primaryContainer.withValues(alpha: 0.3),
                                  onTap: () => viewModel.selectProduct(product),
                                );
                              },
                            ),
                ),
              ],
            ),
          ),
          Expanded(
            child: viewModel.selectedProduct == null
                ? DsEmptyState(
                    icon: Icons.menu_book_outlined,
                    title: 'Seleccioná un producto',
                    description:
                        'Elegí un producto del panel izquierdo para crear, versionar y comparar sus recetas.',
                  )
                : SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _SectionCard(
                          title: 'Autoría y publicación',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(viewModel.statusMessage ?? ''),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: viewModel.recipeVersions
                                    .map(
                                      (version) => Chip(
                                        label: Text(
                                          'V${version.versionNumber} • ${version.isSynced ? 'Synced' : 'Pending'}',
                                        ),
                                      ),
                                    )
                                    .toList(growable: false),
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _yieldController,
                                      decoration: const InputDecoration(labelText: 'Yield objetivo'),
                                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: _shrinkController,
                                      decoration: const InputDecoration(labelText: 'Merma técnica %'),
                                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _noteController,
                                decoration: const InputDecoration(labelText: 'Nota de versión'),
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: () => _showAddComponentDialog(context, viewModel),
                                    icon: const Icon(Icons.add),
                                    label: const Text('AGREGAR COMPONENTE'),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: FilledButton(
                                      onPressed: viewModel.isLoading
                                          ? null
                                          : () => _confirmPublish(context, viewModel),
                                      child: const Text('PUBLICAR VERSIÓN'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        _SectionCard(
                          title: 'Draft actual',
                          child: viewModel.draftComponents.isEmpty
                              ? const Text('No hay componentes en borrador.')
                              : ListView.separated(
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  itemCount: viewModel.draftComponents.length,
                                  separatorBuilder: (context, index) => const Divider(height: 1),
                                  itemBuilder: (context, index) {
                                    final component = viewModel.draftComponents[index];
                                    return ListTile(
                                      title: Text(component.ingredientName),
                                      subtitle: Text(
                                        '${component.ingredientType == IngredientType.product ? 'Sub-receta' : 'Insumo'} • Bruto ${component.grossQuantity.toStringAsFixed(2)} • Neto ${component.netQuantity.toStringAsFixed(2)} • Merma ${component.technicalShrinkPct.toStringAsFixed(1)}%',
                                      ),
                                      trailing: IconButton(
                                        icon: Icon(Icons.delete_outline, color: colorScheme.error),
                                        onPressed: () => viewModel.removeDraftComponentAt(index),
                                      ),
                                    );
                                  },
                                ),
                        ),
                        const SizedBox(height: 16),
                        _SectionCard(
                          title: 'Comparar versiones',
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: DropdownButtonFormField<String>(
                                      initialValue: viewModel.compareBaseId,
                                      decoration: const InputDecoration(labelText: 'Versión base'),
                                      items: viewModel.recipeVersions
                                          .map(
                                            (version) => DropdownMenuItem<String>(
                                              value: version.id,
                                              child: Text('V${version.versionNumber}'),
                                            ),
                                          )
                                          .toList(growable: false),
                                      onChanged: (value) {
                                        if (value != null && viewModel.compareTargetId != null) {
                                          viewModel.setComparison(
                                            baseId: value,
                                            targetId: viewModel.compareTargetId!,
                                          );
                                        }
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: DropdownButtonFormField<String>(
                                      initialValue: viewModel.compareTargetId,
                                      decoration: const InputDecoration(labelText: 'Versión objetivo'),
                                      items: viewModel.recipeVersions
                                          .map(
                                            (version) => DropdownMenuItem<String>(
                                              value: version.id,
                                              child: Text('V${version.versionNumber}'),
                                            ),
                                          )
                                          .toList(growable: false),
                                      onChanged: (value) {
                                        if (value != null && viewModel.compareBaseId != null) {
                                          viewModel.setComparison(
                                            baseId: viewModel.compareBaseId!,
                                            targetId: value,
                                          );
                                        }
                                      },
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              RecipeVersionCompareView(rows: viewModel.buildComparisonRows()),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmPublish(BuildContext context, RecipeViewModel viewModel) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Publicar versión crítica', style: Theme.of(dialogContext).textTheme.titleLarge),
              const SizedBox(height: 12),
              const Text(
                'Esta acción reemplaza la receta activa y conserva el historial para comparación BOH.',
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('CANCELAR'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () async {
                  await viewModel.publishDraftVersion(
                    yieldQuantity: double.tryParse(_yieldController.text.trim()) ?? 1,
                    technicalShrinkPct: double.tryParse(_shrinkController.text.trim()) ?? 0,
                    versionNote: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
                  );
                  if (dialogContext.mounted) {
                    Navigator.pop(dialogContext);
                  }
                },
                child: const Text('PUBLICAR'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAddComponentDialog(
    BuildContext context,
    RecipeViewModel viewModel,
  ) async {
    IngredientType ingredientType = IngredientType.insumo;
    String? ingredientId;
    String? ingredientName;
    String? referenceVersionId;
    final grossController = TextEditingController(text: '1');
    final shrinkController = TextEditingController(text: '0');

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) {
          final versionOptions = viewModel.recipeVersions
              .where((version) => version.productId == ingredientId)
              .toList(growable: false);
          return AlertDialog(
            title: const Text('Agregar componente'),
            content: SizedBox(
              width: 460,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<IngredientType>(
                    initialValue: ingredientType,
                    decoration: const InputDecoration(labelText: 'Tipo de componente'),
                    items: const [
                      DropdownMenuItem(value: IngredientType.insumo, child: Text('Insumo')),
                      DropdownMenuItem(value: IngredientType.product, child: Text('Sub-receta')),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        ingredientType = value;
                        ingredientId = null;
                        ingredientName = null;
                        referenceVersionId = null;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: ingredientId,
                    decoration: const InputDecoration(labelText: 'Componente'),
                    items: (ingredientType == IngredientType.insumo
                            ? viewModel.insumos
                                .map((item) => DropdownMenuItem<String>(value: item.id, child: Text(item.name)))
                            : viewModel.products
                                .where((item) => item.id != viewModel.selectedProduct?.id)
                                .map((item) => DropdownMenuItem<String>(value: item.id, child: Text(item.name))))
                        .toList(growable: false),
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        ingredientId = value;
                        ingredientName = ingredientType == IngredientType.insumo
                            ? viewModel.insumos.firstWhere((item) => item.id == value).name
                            : viewModel.products.firstWhere((item) => item.id == value).name;
                        referenceVersionId = null;
                      });
                    },
                  ),
                  if (ingredientType == IngredientType.product && ingredientId != null) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: referenceVersionId,
                      decoration: const InputDecoration(labelText: 'Versión de sub-receta'),
                      items: versionOptions
                          .map(
                            (version) => DropdownMenuItem<String>(
                              value: version.id,
                              child: Text('V${version.versionNumber}'),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) => setState(() => referenceVersionId = value),
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: grossController,
                    decoration: const InputDecoration(labelText: 'Cantidad bruta'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: shrinkController,
                    decoration: const InputDecoration(labelText: 'Merma técnica %'),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('CANCELAR'),
              ),
              FilledButton(
                onPressed: ingredientId == null
                    ? null
                    : () {
                        viewModel.addDraftComponent(
                          ingredientId: ingredientId!,
                          ingredientName: ingredientName ?? ingredientId!,
                          ingredientType: ingredientType,
                          grossQuantity: double.tryParse(grossController.text.trim()) ?? 1,
                          technicalShrinkPct: double.tryParse(shrinkController.text.trim()) ?? 0,
                          referenceVersionId: referenceVersionId,
                        );
                        Navigator.pop(dialogContext);
                      },
                child: const Text('AGREGAR'),
              ),
            ],
          );
        },
      ),
    );

    grossController.dispose();
    shrinkController.dispose();
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}
