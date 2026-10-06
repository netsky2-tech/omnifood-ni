import 'package:flutter/material.dart';
import '../../../../domain/models/inventory/product.dart';

/// Read-only options screen for a product. The terminal does not edit
/// options: modifier groups are administered from the web panel, so this
/// screen only shows the effective configuration already loaded into the
/// domain ([Product.availableModifierGroups]) and the product variants.
class ItemOptionsEditor extends StatelessWidget {
  final Product product;

  const ItemOptionsEditor({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Opciones: ${product.name}'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'VARIANTES (Tallas/Tipos)'),
              Tab(text: 'MODIFICADORES (Extras)'),
            ],
          ),
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
    final variants = product.variants;
    if (variants.isEmpty) {
      return const _ReadOnlyEmptyState(
        message: 'Este producto no tiene variantes.',
      );
    }
    return ListView.builder(
      itemCount: variants.length,
      itemBuilder: (context, index) {
        final variant = variants[index];
        return ListTile(
          title: Text(variant.name),
          subtitle:
              Text('Ajuste de precio: +C\$ ${_formatAmount(variant.priceAdjustment)}'),
        );
      },
    );
  }

  Widget _buildModifiersTab() {
    final groups = product.availableModifierGroups;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Material(
          color: Color(0xFFFFF8E1),
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Los modificadores se administran desde el panel web, en Gestión → Modificadores.',
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: groups.isEmpty
              ? const _ReadOnlyEmptyState(
                  message: 'Este producto todavía no tiene modificadores.',
                )
              : ListView.builder(
                  itemCount: groups.length,
                  itemBuilder: (context, index) {
                    final group = groups[index];
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                          child: Text(
                            group.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        ...group.options.map(
                          (option) => ListTile(
                            dense: true,
                            title: Text(option.name),
                            trailing: Text(
                              '+C\$ ${_formatAmount(option.priceDelta)}',
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
        ),
      ],
    );
  }

  /// Mirrors the sales screen formatting: whole numbers without decimals,
  /// fractional amounts as written (e.g. 15 -> "15", 20.5 -> "20.5").
  static String _formatAmount(double amount) =>
      amount % 1 == 0 ? amount.toInt().toString() : '$amount';
}

class _ReadOnlyEmptyState extends StatelessWidget {
  final String message;

  const _ReadOnlyEmptyState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inventory_2_outlined, size: 40),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ],
        ),
      ),
    );
  }
}
