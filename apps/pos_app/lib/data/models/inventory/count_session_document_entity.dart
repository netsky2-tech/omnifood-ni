import 'package:floor/floor.dart';

@Entity(tableName: 'count_session_documents')
class CountSessionDocumentEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'warehouse_id')
  final String warehouseId;
  @ColumnInfo(name: 'warehouse_name')
  final String warehouseName;
  @ColumnInfo(name: 'cutoff_at')
  final String cutoffAt;
  final String status;
  @ColumnInfo(name: 'created_at')
  final String createdAt;
  @ColumnInfo(name: 'updated_at')
  final String updatedAt;
  final String? notes;
  @ColumnInfo(name: 'posted_at')
  final String? postedAt;
  @ColumnInfo(name: 'movement_references_json')
  final String movementReferencesJson;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  const CountSessionDocumentEntity({
    required this.id,
    required this.warehouseId,
    required this.warehouseName,
    required this.cutoffAt,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.movementReferencesJson,
    this.notes,
    this.postedAt,
    this.isSynced = false,
  });
}
