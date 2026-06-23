import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/catalog/catalog_value.dart';
import 'insumo_view_model.dart';
import '../../../../domain/models/inventory/product.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../design_system/design_system.dart';
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
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'INSUMOS (MATERIA PRIMA)'),
              Tab(text: 'PRODUCTOS (VENTA)'),
            ],
          ),
        ),
        body: TabBarView(children: [_buildInsumosTab(), _buildProductsTab()]),
      ),
    );
  }

  Widget _buildInsumosTab() {
    return Consumer<InsumoViewModel>(
      builder: (context, vm, child) {
        if (vm.isLoading)
          return const Center(child: CircularProgressIndicator());
        if (vm.insumos.isEmpty) {
          return DsEmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'Sin insumos registrados',
            description:
                'Registrá tu primera materia prima para empezar a controlar stock, compras y recetas.',
            actionLabel: 'REGISTRAR PRIMER INSUMO',
            onAction: () => _showInsumoForm(context),
          );
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: DsPrimaryButton(
                  label: 'REGISTRAR INSUMO',
                  icon: Icons.add,
                  expand: true,
                  onPressed: () => _showInsumoForm(context),
                ),
              ),
            ),
            Expanded(
              child: ListView.separated(
                itemCount: vm.insumos.length,
                separatorBuilder: (context, _) =>
                    const Divider(height: 1, thickness: 1),
                itemBuilder: (context, index) {
                  final insumo = vm.insumos[index];
                  return _InsumoListRow(
                    insumo: insumo,
                    onTap: () => _showInsumoDetail(context, insumo),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildProductsTab() {
    return Consumer<InsumoViewModel>(
      builder: (context, vm, child) {
        if (vm.isLoading)
          return const Center(child: CircularProgressIndicator());
        if (vm.products.isEmpty) {
          return DsEmptyState(
            icon: Icons.local_mall_outlined,
            title: 'Sin productos registrados',
            description:
                'Los productos son los ítems que vendés en el POS. Podés crear productos preparados (llevan receta) o de reventa directa.',
            actionLabel: 'REGISTRAR PRIMER PRODUCTO',
            onAction: () => _showProductForm(context),
          );
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: DsPrimaryButton(
                  label: 'REGISTRAR PRODUCTO',
                  icon: Icons.add,
                  expand: true,
                  onPressed: () => _showProductForm(context),
                ),
              ),
            ),
            Expanded(
              child: ListView.separated(
                itemCount: vm.products.length,
                separatorBuilder: (context, _) =>
                    const Divider(height: 1, thickness: 1),
                itemBuilder: (context, index) {
                  final product = vm.products[index];
                  return _ProductListRow(
                    product: product,
                    onTap: () => _showProductOptionsEditor(context, product),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  void _showInsumoDetail(BuildContext context, Insumo insumo) {
    final vm = context.read<InsumoViewModel>();

    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return Dialog(
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 24,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(4),
            side: BorderSide(
              color: Theme.of(dialogContext).colorScheme.primary,
              width: 2,
            ),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720, maxHeight: 720),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _DetailHeader(
                  label: 'INSUMO',
                  id: insumo.id,
                  title: insumo.name,
                  onEdit: () {
                    Navigator.pop(dialogContext);
                    _showInsumoForm(context, insumo: insumo);
                  },
                  onClose: () => Navigator.pop(dialogContext),
                ),
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _InsumoAttributeGrid(insumo: insumo),
                        const SizedBox(height: 16),
                        _PresentationsSection(
                          viewModel: vm,
                          insumoId: insumo.id,
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          alignment: WrapAlignment.start,
                          children: [
                            DsSecondaryButton(
                              label: 'VER COMPRAS',
                              onPressed: () {
                                Navigator.pop(dialogContext);
                                Navigator.pushNamed(
                                  context,
                                  '/inventory/purchases',
                                );
                              },
                            ),
                            DsSecondaryButton(
                              label: 'VER KARDEX',
                              onPressed: () {
                                Navigator.pop(dialogContext);
                                Navigator.pushNamed(
                                  context,
                                  '/inventory/kardex',
                                );
                              },
                            ),
                            DsSecondaryButton(
                              label: 'VER RECETAS',
                              onPressed: () {
                                Navigator.pop(dialogContext);
                                Navigator.pushNamed(
                                  context,
                                  '/inventory/recipes',
                                );
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
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

  void _showInsumoForm(BuildContext context, {Insumo? insumo}) {
    final vm = context.read<InsumoViewModel>();
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController(text: insumo?.name ?? '');
    final parController = TextEditingController(
      text: insumo?.parLevel?.toString() ?? '',
    );
    final stockMinController = TextEditingController(
      text: insumo?.stockMin?.toString() ?? '',
    );
    final stockMaxController = TextEditingController(
      text: insumo?.stockMax?.toString() ?? '',
    );
    final stockController = TextEditingController(
      text: insumo?.stock.toString() ?? '0',
    );
    final uomOptions = _buildUomOptions(vm.uomOptions, insumo?.consumptionUom);
    String selectedUom =
        insumo?.consumptionUom ??
        (uomOptions.isNotEmpty ? uomOptions.first : '');
    String? selectedWarehouseId = insumo?.warehouseId;
    bool isPerishable = insumo?.isPerishable ?? false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          title: Text(insumo == null ? 'Nuevo Insumo' : 'Editar Insumo'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: nameController,
                      decoration: const InputDecoration(labelText: 'Nombre'),
                      validator: (v) =>
                          v == null || v.isEmpty ? 'Requerido' : null,
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: selectedUom,
                      decoration: const InputDecoration(
                        labelText: 'Unidad de medida',
                        helperText:
                            'Unidad base en la que se controla el stock.',
                      ),
                      items: uomOptions
                          .map(
                            (u) => DropdownMenuItem(value: u, child: Text(u)),
                          )
                          .toList(growable: false),
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => selectedUom = val);
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: stockController,
                      decoration: const InputDecoration(
                        labelText: 'Stock actual',
                        helperText:
                            'Para materia prima recién registrada suele ser 0.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: parController,
                      decoration: const InputDecoration(
                        labelText: 'Nivel de reorden (PAR)',
                        helperText:
                            'Stock mínimo que dispara alerta de reposición.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: stockMinController,
                      decoration: const InputDecoration(
                        labelText: 'Stock mínimo',
                        helperText: 'Umbral inferior (PRD §3).',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: stockMaxController,
                      decoration: const InputDecoration(
                        labelText: 'Stock máximo',
                        helperText: 'Tope sugerido para evitar sobrestock.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: selectedWarehouseId,
                      decoration: const InputDecoration(labelText: 'Almacén'),
                      items: vm.warehouses
                          .map(
                            (w) => DropdownMenuItem(
                              value: w.id,
                              child: Text(w.name),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (val) =>
                          setState(() => selectedWarehouseId = val),
                    ),
                    const SizedBox(height: 8),
                    SwitchListTile(
                      title: const Text('¿Es perecedero?'),
                      subtitle: const Text(
                        'Habilita control de lotes y vencimiento',
                      ),
                      value: isPerishable,
                      onChanged: (val) => setState(() => isPerishable = val),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() ?? false) {
                  vm.saveInsumo(
                    id: insumo?.id,
                    name: nameController.text,
                    consumptionUom: selectedUom,
                    stock: double.tryParse(stockController.text) ?? 0,
                    averageCost: insumo?.averageCost ?? 0,
                    parLevel: double.tryParse(parController.text),
                    stockMin: double.tryParse(stockMinController.text),
                    stockMax: double.tryParse(stockMaxController.text),
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

  void _showProductForm(BuildContext context, {Product? product}) {
    final vm = context.read<InsumoViewModel>();
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController(text: product?.name ?? '');
    final skuController = TextEditingController(text: product?.sku ?? '');
    final barcodeController = TextEditingController(
      text: product?.barcode ?? '',
    );
    final categoryController = TextEditingController(
      text: product?.category ?? '',
    );
    final stockController = TextEditingController(
      text: product?.stock.toString() ?? '0',
    );
    final costController = TextEditingController(
      text: product?.averageCost.toString() ?? '0',
    );
    final priceController = TextEditingController(
      text: product?.sellPrice.toString() ?? '0',
    );
    final uomOptions = _buildUomOptions(vm.uomOptions, product?.uom);
    String selectedUom =
        product?.uom ?? (uomOptions.isNotEmpty ? uomOptions.first : '');
    bool isPrepared = product?.isPrepared ?? true;
    // Sales product type comes from the administrable SALES_PRODUCT_TYPE
    // catalog (e.g. PREPARADO / REVENTA). It maps back to the persisted
    // isPrepared flag until the Product schema migrates to a type-code column.
    final typeOptions = _buildProductTypeOptions(
      vm,
      product?.isPrepared ?? isPrepared,
    );
    String selectedProductType = typeOptions.isNotEmpty
        ? typeOptions.first.code
        : '';
    final categoryNameOptions = _buildCategoryOptions(vm, product?.category);

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          title: Text(product == null ? 'Nuevo Producto' : 'Editar Producto'),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: nameController,
                      decoration: const InputDecoration(labelText: 'Nombre'),
                      validator: (v) =>
                          v == null || v.isEmpty ? 'Requerido' : null,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: skuController,
                            decoration: const InputDecoration(labelText: 'SKU'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: barcodeController,
                            decoration: const InputDecoration(
                              labelText: 'Código de barras',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: categoryController.text.isEmpty
                          ? null
                          : (categoryNameOptions.contains(
                                  categoryController.text,
                                )
                                ? categoryController.text
                                : null),
                      decoration: const InputDecoration(
                        labelText: 'Categoría',
                        helperText:
                            'Categorías administrables. Gestionalas desde el Admin.',
                      ),
                      items: categoryNameOptions
                          .map(
                            (c) => DropdownMenuItem<String>(
                              value: c,
                              child: Text(c),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => categoryController.text = val);
                        }
                      },
                    ),
                    if (categoryController.text.isNotEmpty &&
                        !categoryNameOptions.contains(
                          categoryController.text,
                        )) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Categoría actual "${categoryController.text}" no está en el catálogo.',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                          fontSize: 12,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: selectedUom,
                      decoration: const InputDecoration(
                        labelText: 'Unidad de venta',
                        helperText: 'Unidad con la que se vende en el POS.',
                      ),
                      items: uomOptions
                          .map(
                            (u) => DropdownMenuItem(value: u, child: Text(u)),
                          )
                          .toList(growable: false),
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => selectedUom = val);
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: stockController,
                      decoration: const InputDecoration(
                        labelText: 'Stock inicial',
                        helperText:
                            'Para reventa, suele ser la cantidad física actual.',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: costController,
                      decoration: const InputDecoration(
                        labelText: 'Costo promedio (NIO)',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: priceController,
                      decoration: const InputDecoration(
                        labelText: 'Precio de venta (NIO)',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validator: (v) {
                        final n = double.tryParse(v ?? '');
                        if (n == null || n < 0) return 'Precio inválido';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: const Color(0xFF767777),
                          width: 1,
                        ),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'TIPO DE PRODUCTO',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            initialValue: typeOptions.isNotEmpty
                                ? selectedProductType
                                : null,
                            decoration: const InputDecoration(
                              labelText: 'Tipo',
                              helperText:
                                  'PREPARADO descuenta insumos vía BOM; REVENTA es directa.',
                            ),
                            items: typeOptions
                                .map(
                                  (t) => DropdownMenuItem<String>(
                                    value: t.code,
                                    child: Text(t.name),
                                  ),
                                )
                                .toList(growable: false),
                            onChanged: (val) {
                              if (val != null) {
                                setState(() {
                                  selectedProductType = val;
                                  isPrepared = vm.isPreparedForTypeCode(val);
                                });
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() ?? false) {
                  vm.saveProduct(
                    id: product?.id,
                    name: nameController.text,
                    sku: skuController.text.isEmpty ? null : skuController.text,
                    barcode: barcodeController.text.isEmpty
                        ? null
                        : barcodeController.text,
                    category: categoryController.text.isEmpty
                        ? null
                        : categoryController.text,
                    isPrepared: vm.isPreparedForTypeCode(selectedProductType),
                    uom: selectedUom,
                    stock: double.tryParse(stockController.text) ?? 0,
                    averageCost: double.tryParse(costController.text) ?? 0,
                    sellPrice: double.tryParse(priceController.text) ?? 0,
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

  List<String> _buildUomOptions(List<String> catalog, String? current) {
    final options = <String>[...catalog];
    if (current != null && current.isNotEmpty && !options.contains(current)) {
      options.insert(0, current);
    }
    // Defensive: a DropdownButtonFormField needs at least one item. In
    // production the catalog is seeded/synced so this branch is never hit; it
    // only guards against an unprovisioned local catalog.
    return options.isEmpty ? const [''] : options;
  }

  /// Sales product type options from the administrable catalog, ordered so the
  /// product's current type appears first (so the dropdown opens on it).
  List<CatalogValue> _buildProductTypeOptions(
    InsumoViewModel vm,
    bool currentIsPrepared,
  ) {
    final catalog = vm.productTypeCatalog;
    if (catalog.isEmpty) return const <CatalogValue>[];
    final currentCode = vm.defaultProductTypeCode(currentIsPrepared);
    final sorted = <CatalogValue>[...catalog]
      ..sort((a, b) {
        if (a.code == currentCode) return -1;
        if (b.code == currentCode) return 1;
        return a.sortOrder.compareTo(b.sortOrder);
      });
    return sorted;
  }

  /// Sales product category display names from the administrable catalog. If
  /// the product already holds a legacy category not in the catalog, it is
  /// injected first so it still renders (and is flagged in the UI).
  List<String> _buildCategoryOptions(InsumoViewModel vm, String? current) {
    final names = vm.productCategoryNames;
    if (current == null || current.isEmpty) return names;
    if (names.contains(current)) return names;
    return <String>[current, ...names];
  }
}

class _InsumoListRow extends StatelessWidget {
  const _InsumoListRow({required this.insumo, required this.onTap});

  final Insumo insumo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final stockStatus = _stockStatus(insumo);
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    insumo.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Stock ${insumo.stock.toStringAsFixed(2)} ${insumo.consumptionUom}'
                    '${insumo.parLevel != null ? ' · PAR ${insumo.parLevel!.toStringAsFixed(2)}' : ''}',
                    style: TextStyle(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 12,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
            DsStatusChip(label: stockStatus.label, tone: stockStatus.tone),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

class _ProductListRow extends StatelessWidget {
  const _ProductListRow({required this.product, required this.onTap});

  final Product product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final stockTone = product.stock <= 0
        ? DsChipTone.danger
        : DsChipTone.primary;
    final stockLabel = product.stock <= 0 ? 'SIN STOCK' : 'ACTIVO';
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    product.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'SKU ${product.sku ?? "N/A"} · C\$${product.sellPrice.toStringAsFixed(2)}'
                    '${product.category != null ? ' · ${product.category}' : ''}',
                    style: TextStyle(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 12,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
            DsStatusChip(
              label: product.isPrepared ? 'PREPARADO' : 'REVENTA',
              tone: product.isPrepared
                  ? DsChipTone.primary
                  : DsChipTone.neutral,
            ),
            const SizedBox(width: 8),
            DsStatusChip(label: stockLabel, tone: stockTone),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: colorScheme.outline),
          ],
        ),
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({
    required this.label,
    required this.id,
    required this.title,
    required this.onClose,
    this.onEdit,
  });

  final String label;
  final String id;
  final String title;
  final VoidCallback onClose;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 8, 16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$label · ID ${id.length > 8 ? id.substring(0, 8) : id}',
                  style: TextStyle(
                    color: colorScheme.onSurfaceVariant,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.0,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (onEdit != null)
            TextButton.icon(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('EDITAR'),
            ),
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.close),
            tooltip: 'Cerrar',
          ),
        ],
      ),
    );
  }
}

class _InsumoAttributeGrid extends StatelessWidget {
  const _InsumoAttributeGrid({required this.insumo});

  final Insumo insumo;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        border: Border.all(color: const Color(0xFF767777), width: 1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Wrap(
        spacing: 24,
        runSpacing: 12,
        children: [
          _Attr(label: 'Stock actual', value: insumo.stock.toStringAsFixed(2)),
          _Attr(label: 'Unidad', value: insumo.consumptionUom),
          _Attr(
            label: 'PAR',
            value: insumo.parLevel?.toStringAsFixed(2) ?? '—',
          ),
          _Attr(
            label: 'Stock mínimo',
            value: insumo.stockMin?.toStringAsFixed(2) ?? '—',
          ),
          _Attr(
            label: 'Stock máximo',
            value: insumo.stockMax?.toStringAsFixed(2) ?? '—',
          ),
          _Attr(
            label: 'Costo promedio',
            value: 'C\$${insumo.averageCost.toStringAsFixed(2)}',
          ),
          _Attr(label: 'Perecedero', value: insumo.isPerishable ? 'Sí' : 'No'),
        ],
      ),
    );
  }
}

class _Attr extends StatelessWidget {
  const _Attr({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: colorScheme.onSurfaceVariant,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.0,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _PresentationsSection extends StatefulWidget {
  const _PresentationsSection({
    required this.viewModel,
    required this.insumoId,
  });

  final InsumoViewModel viewModel;
  final String insumoId;

  @override
  State<_PresentationsSection> createState() => _PresentationsSectionState();
}

class _PresentationsSectionState extends State<_PresentationsSection> {
  @override
  void initState() {
    super.initState();
    widget.viewModel.addListener(_onChange);
  }

  @override
  void dispose() {
    widget.viewModel.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final list = widget.viewModel.conversionsFor(widget.insumoId);
    return DsSectionCard(
      title: 'PRESENTACIONES',
      icon: Icons.scale,
      trailing: TextButton.icon(
        onPressed: () => _showPresentationForm(context),
        icon: const Icon(Icons.add, size: 18),
        label: const Text('AGREGAR'),
      ),
      child: list.isEmpty
          ? const Text(
              'Sin presentaciones. Las compras requieren al menos una presentación para registrar la unidad de compra.',
              style: TextStyle(
                fontStyle: FontStyle.italic,
                color: Color(0xFF414849),
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: list
                  .map(
                    (c) => _PresentationRow(
                      conversion: c,
                      onEdit: () =>
                          _showPresentationForm(context, conversion: c),
                      onDelete: () => _confirmDelete(context, c),
                    ),
                  )
                  .toList(growable: false),
            ),
    );
  }

  Future<void> _showPresentationForm(
    BuildContext context, {
    UomConversion? conversion,
  }) async {
    final vm = widget.viewModel;
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController(
      text: conversion?.unitName ?? '',
    );
    final factorController = TextEditingController(
      text: conversion?.factor.toString() ?? '1',
    );
    bool isDefault = conversion?.isDefault ?? false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          title: Text(
            conversion == null ? 'Nueva presentación' : 'Editar presentación',
          ),
          content: SizedBox(
            width: 480,
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: nameController,
                    decoration: const InputDecoration(
                      labelText: 'Unidad',
                      helperText: 'Ej: Caja, Saco 25kg, Unidad',
                    ),
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Requerido' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: factorController,
                    decoration: const InputDecoration(
                      labelText: 'Unidades base por unidad de compra',
                      helperText:
                          '1 unidad de compra = N unidades base de inventario. Ej: 1 lb = 0.4536 kg.',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    validator: (v) {
                      final n = double.tryParse(v ?? '');
                      if (n == null || n <= 0) return 'Factor inválido';
                      return null;
                    },
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    title: const Text('Marcar como default'),
                    subtitle: const Text(
                      'Se sugiere al registrar compras de este insumo.',
                    ),
                    value: isDefault,
                    onChanged: (val) => setState(() => isDefault = val),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() ?? false) {
                  vm.saveConversion(
                    UomConversion(
                      id:
                          conversion?.id ??
                          DateTime.now().millisecondsSinceEpoch.toString(),
                      insumoId: widget.insumoId,
                      unitName: nameController.text,
                      factor: double.parse(factorController.text),
                      isDefault: isDefault,
                    ),
                  );
                  Navigator.pop(dialogContext);
                }
              },
              child: const Text('GUARDAR'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    UomConversion conversion,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        title: const Text('Eliminar presentación'),
        content: Text(
          '¿Eliminar "${conversion.unitName}"? Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('CANCELAR'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('ELIMINAR'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await widget.viewModel.deleteConversion(widget.insumoId, conversion.id);
    }
  }
}

class _PresentationRow extends StatelessWidget {
  const _PresentationRow({
    required this.conversion,
    required this.onEdit,
    required this.onDelete,
  });

  final UomConversion conversion;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Text(
                      conversion.unitName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (conversion.isDefault) ...[
                      const SizedBox(width: 8),
                      const DsStatusChip(
                        label: 'DEFAULT',
                        tone: DsChipTone.primary,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '1 unidad de compra = ${conversion.factor.toStringAsFixed(4)} unidades base',
                  style: TextStyle(
                    color: colorScheme.onSurfaceVariant,
                    fontSize: 12,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 18),
            onPressed: onEdit,
          ),
          IconButton(
            icon: Icon(
              Icons.delete_outline,
              size: 18,
              color: colorScheme.error,
            ),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

class _StockStatus {
  const _StockStatus(this.label, this.tone);

  final String label;
  final DsChipTone tone;
}

_StockStatus _stockStatus(Insumo insumo) {
  if (insumo.stock <= 0)
    return const _StockStatus('SIN STOCK', DsChipTone.danger);
  if (insumo.parLevel != null && insumo.stock < insumo.parLevel!) {
    return const _StockStatus('BAJO PAR', DsChipTone.warning);
  }
  return const _StockStatus('OK', DsChipTone.success);
}
