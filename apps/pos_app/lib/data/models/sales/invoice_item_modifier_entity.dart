import 'package:floor/floor.dart';
import './invoice_item_entity.dart';

@Entity(
  tableName: 'invoice_item_modifiers',
  foreignKeys: [
    ForeignKey(
      childColumns: ['invoice_item_id'],
      parentColumns: ['id'],
      entity: InvoiceItemEntity,
    ),
  ],
)
class InvoiceItemModifierEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_item_id')
  final String invoiceItemId;
  final String name;
  @ColumnInfo(name: 'extra_price')
  final double extraPrice;
  @ColumnInfo(name: 'quantity')
  final int quantity;

  /// R28: the option this line carries. It used to be a FRESH UUID (the
  /// mapper generated one), so the option's identity was lost the moment the
  /// line was persisted: neither the terminal nor the cloud could tell which
  /// option was sold. Now the catalogue's option id is kept.
  @ColumnInfo(name: 'option_id')
  final String? optionId;

  /// The group the option belongs to.
  @ColumnInfo(name: 'group_id')
  final String? groupId;

  /// R28: the option's INVENTORY effect (NONE / ADD / REMOVE / SWAP /
  /// SCALE), null for a price-only line.
  @ColumnInfo(name: 'inventory_effect')
  final String? inventoryEffect;

  /// The insumo the effect acts ON: added (ADD) or substituted in (SWAP).
  @ColumnInfo(name: 'effect_insumo_id')
  final String? effectInsumoId;

  /// The insumo of the recipe component the effect affects.
  @ColumnInfo(name: 'effect_target_insumo_id')
  final String? effectTargetInsumoId;

  /// The quantity to apply per sold unit. Null = inherited from the recipe.
  @ColumnInfo(name: 'effect_quantity')
  final double? effectQuantity;

  /// The multiplier of a SCALE.
  @ColumnInfo(name: 'effect_factor')
  final double? effectFactor;

  InvoiceItemModifierEntity({
    required this.id,
    required this.invoiceItemId,
    required this.name,
    required this.extraPrice,
    this.quantity = 1,
    this.optionId,
    this.groupId,
    this.inventoryEffect,
    this.effectInsumoId,
    this.effectTargetInsumoId,
    this.effectQuantity,
    this.effectFactor,
  });
}
