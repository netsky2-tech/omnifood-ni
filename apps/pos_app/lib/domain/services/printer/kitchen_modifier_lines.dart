import '../../models/sales/invoice_item.dart';

/// Single source of truth for how selected modifiers read on paper and on
/// the cart tile: `<quantity>x <name>`, e.g. '2x Extra Shot'. The count is
/// ALWAYS shown explicitly — the operator never guesses. The kitchen lines
/// carry no money (the ticket doesn't need it); the same label without the
/// [MOD] prefix drives the cart tile.
class KitchenModifierLines {
  const KitchenModifierLines._();

  /// Human label for one selected modifier: '2x Extra Shot'.
  static String quantityLabel(int quantity, String name) =>
      '${quantity}x $name';

  /// Kitchen ticket lines for one item, one per selected modifier.
  static List<String> forItem(InvoiceItem item) => item.selectedModifiers
      .map(
        (modifier) =>
            '[MOD] ${quantityLabel(modifier.quantity, modifier.name)}',
      )
      .toList();
}
