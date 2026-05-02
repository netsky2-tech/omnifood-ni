import 'package:floor/floor.dart';

@Entity(tableName: 'local_configs')
class LocalConfigEntity {
  @primaryKey
  final String key;
  final String value;
  final String? description;

  LocalConfigEntity({
    required this.key,
    required this.value,
    this.description,
  });
}
