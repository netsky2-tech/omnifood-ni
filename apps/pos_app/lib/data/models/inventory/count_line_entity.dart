import 'package:floor/floor.dart';

import 'count_session_document_entity.dart';

@Entity(
  tableName: 'count_lines',
  foreignKeys: [
    ForeignKey(
      childColumns: ['session_id'],
      parentColumns: ['id'],
      entity: CountSessionDocumentEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
)
class CountLineEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'session_id')
  final String sessionId;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'insumo_name')
  final String insumoName;
  final String uom;
  @ColumnInfo(name: 'theoretical_quantity')
  final double theoreticalQuantity;
  @ColumnInfo(name: 'approved_entry_index')
  final int? approvedEntryIndex;
  @ColumnInfo(name: 'entries_json')
  final String entriesJson;

  const CountLineEntity({
    required this.id,
    required this.sessionId,
    required this.insumoId,
    required this.insumoName,
    required this.uom,
    required this.theoreticalQuantity,
    required this.entriesJson,
    this.approvedEntryIndex,
  });
}
