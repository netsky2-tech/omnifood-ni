import 'package:floor/floor.dart';

final migration10_11 = Migration(10, 11, (database) async {
  await database.execute('ALTER TABLE inventory_movements ADD COLUMN batch_deductions TEXT');
});

final allMigrations = [
  migration10_11,
];
