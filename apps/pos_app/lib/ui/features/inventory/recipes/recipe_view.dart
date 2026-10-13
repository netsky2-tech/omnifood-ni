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
    final isHandheld = ResponsiveBreakpoints.isHandheld(context);

    if (isHandheld) {
      if (viewModel.selectedProduct == null) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Recetas'),
            backgroundColor: colorScheme.surface,
            elevation: 0,
            shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
          ),
          body: _buildProductList(context, viewModel, colorScheme),
        );
      } else {
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => viewModel.selectProduct(null),
            ),
            title: Text(
              viewModel.selectedProduct!.name,
              overflow: TextOverflow.ellipsis,
            ),
            backgroundColor: colorScheme.surface,
            elevation: 0,
            shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
          ),
          body: _buildRecipeVersionsWorkspace(context, viewModel),
        );
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recetas'),
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
            child: _buildProductList(context, viewModel, colorScheme),
          ),
          Expanded(
            child: viewModel.selectedProduct == null
                ? const DsEmptyState(
                    icon: Icons.menu_book_outlined,
                    title: 'Seleccioná un producto',
                    description:
                        'Elegí un producto del panel izquierdo para revisar sus recetas y comparar versiones.',
                  )
                : _buildRecipeVersionsWorkspace(context, viewModel),
          ),
        ],
      ),
    );
  }

  Widget _buildProductList(
    BuildContext context,
    RecipeViewModel viewModel,
    ColorScheme colorScheme,
  ) {
    return Column(
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
                              'No hay productos. El catálogo se administra desde el Dashboard web.',
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
                          trailing: ResponsiveBreakpoints.isHandheld(context)
                              ? const Icon(Icons.chevron_right, size: 20)
                              : null,
                          selected: isSelected,
                          selectedTileColor:
                              colorScheme.primaryContainer.withValues(alpha: 0.3),
                          onTap: () => viewModel.selectProduct(product),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  /// Strict read-only catalog notice (issue #899 S4): recipes are published
  /// from the Dashboard web; this terminal never edits them.
  Widget _buildCatalogReadOnlyBanner(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 20, color: colorScheme.primary),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'El catálogo se administra desde el Dashboard web. '
              'Esta terminal no edita productos, precios ni recetas.',
              style: TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  /// Strict read-only versions workspace (issue #899 S4): the terminal never
  /// authors or publishes recipes — that is done from the Dashboard web.
  /// Operators keep read access to the version timeline and comparisons.
  Widget _buildRecipeVersionsWorkspace(
    BuildContext context,
    RecipeViewModel viewModel,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildCatalogReadOnlyBanner(context),
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Versiones publicadas',
            child: viewModel.recipeVersions.isEmpty
                ? const Text('Sin versiones publicadas.')
                : Wrap(
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
    );
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
