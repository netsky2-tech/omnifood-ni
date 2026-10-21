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

  /// ME-04: the TRUTH of the effect at sale time. 'APPLIED' (the stock
  /// moved) or 'PENDING' (the sale went through, the effect did not touch
  /// the stock). Null for a price-only line and for every line written by
  /// a terminal that predates this wire.
  @ColumnInfo(name: 'effect_status')
  final String? effectStatus;

  /// ME-04: why the effect did not apply (INCOMPLETE, UNIT_MISMATCH,
  /// INSUMSO_NOT_IN_CATALOG, COMPONENT_NOT_IN_RECIPE).
  @ColumnInfo(name: 'effect_skip_reason')
  final String? effectSkipReason;

  /// ME-04: where the applied quantity came from (DECLARED, INHERITED,
  /// OVERRIDE).
  @ColumnInfo(name: 'effect_quantity_source')
  final String? effectQuantitySource;

  /// ME-04: the supervisor who authorized a quantity override, with the
  /// credential used and the reason. Null when nobody had to authorize.
  @ColumnInfo(name: 'effect_authorized_by')
  final String? effectAuthorizedBy;

  @ColumnInfo(name: 'effect_authorization_method')
  final String? effectAuthorizationMethod;

  @ColumnInfo(name: 'effect_authorization_reason')
  final String? effectAuthorizationReason;

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
    this.effectStatus,
    this.effectSkipReason,
    this.effectQuantitySource,
    this.effectAuthorizedBy,
    this.effectAuthorizationMethod,
    this.effectAuthorizationReason,
  });
}
