import 'package:floor/floor.dart';

@Entity(tableName: 'kardex_corrections')
class KardexCorrectionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'origin_movement_id')
  final String originMovementId;
  @ColumnInfo(name: 'trigger_movement_id')
  final String triggerMovementId;
  @ColumnInfo(name: 'previous_unit_cost_nio')
  final double previousUnitCostNio;
  @ColumnInfo(name: 'recalculated_unit_cost_nio')
  final double recalculatedUnitCostNio;
  @ColumnInfo(name: 'delta_unit_cost_nio')
  final double deltaUnitCostNio;
  @ColumnInfo(name: 'total_delta_cost_nio')
  final double totalDeltaCostNio;
  @ColumnInfo(name: 'affected_quantity')
  final double affectedQuantity;
  @ColumnInfo(name: 'lineage_hash')
  final String lineageHash;
  @ColumnInfo(name: 'authorized_by_user_id')
  final String? authorizedByUserId;
  @ColumnInfo(name: 'authorized_by_role')
  final String? authorizedByRole;
  @ColumnInfo(name: 'authorization_method')
  final String? authorizationMethod;
  @ColumnInfo(name: 'created_at')
  final String createdAt;

  KardexCorrectionEntity({
    required this.id,
    required this.insumoId,
    required this.originMovementId,
    required this.triggerMovementId,
    required this.previousUnitCostNio,
    required this.recalculatedUnitCostNio,
    required this.deltaUnitCostNio,
    required this.totalDeltaCostNio,
    required this.affectedQuantity,
    required this.lineageHash,
    this.authorizedByUserId,
    this.authorizedByRole,
    this.authorizationMethod,
    required this.createdAt,
  });
}
