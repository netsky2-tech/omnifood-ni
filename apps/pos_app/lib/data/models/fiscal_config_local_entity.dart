import 'package:floor/floor.dart';

@Entity(tableName: 'fiscal_config_local')
class FiscalConfigLocalEntity {
  @primaryKey
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'revision')
  final int revision;

  @ColumnInfo(name: 'fingerprint')
  final String fingerprint;

  @ColumnInfo(name: 'payload')
  final String payload;

  @ColumnInfo(name: 'applied_at')
  final String appliedAt;

  const FiscalConfigLocalEntity({
    required this.tenantId,
    required this.revision,
    required this.fingerprint,
    required this.payload,
    required this.appliedAt,
  });
}
