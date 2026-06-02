import 'package:floor/floor.dart';

final migration10_11 = Migration(10, 11, (database) async {
  await database.execute('ALTER TABLE inventory_movements ADD COLUMN batch_deductions TEXT');
});

final migration11_12 = Migration(11, 12, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS security_profiles (
      user_id TEXT NOT NULL PRIMARY KEY,
      pin_hash TEXT,
      totp_secret_seed TEXT,
      is_totp_enabled INTEGER NOT NULL DEFAULT 0,
      is_pin_enabled INTEGER NOT NULL DEFAULT 1
    )
  ''');
});

final migration12_13 = Migration(12, 13, (database) async {
  await database.execute("ALTER TABLE cashier_sessions ADD COLUMN tipo_modelo TEXT NOT NULL DEFAULT 'CAJA_CENTRAL'");
  await database.execute("UPDATE cashier_sessions SET tipo_modelo = 'CAJA_CENTRAL' WHERE tipo_modelo IS NULL OR tipo_modelo = ''");
});

final migration13_14 = Migration(13, 14, (database) async {
  await database.execute("ALTER TABLE audit_logs ADD COLUMN remote_ref_uuid TEXT");
  await database.execute("""
    UPDATE audit_logs
    SET remote_ref_uuid = lower(
      hex(randomblob(4)) || '-' ||
      hex(randomblob(2)) || '-' ||
      '4' || substr(hex(randomblob(2)), 2) || '-' ||
      'a' || substr(hex(randomblob(2)), 2) || '-' ||
      hex(randomblob(6))
    )
    WHERE remote_ref_uuid IS NULL OR remote_ref_uuid = ''
  """);
});

final migration14_15 = Migration(14, 15, (database) async {
  await database.execute("ALTER TABLE purchases ADD COLUMN invoice_date TEXT NOT NULL DEFAULT ''");
  await database.execute("ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT 'NIO'");
  await database.execute("ALTER TABLE purchases ADD COLUMN bcn_rate REAL NOT NULL DEFAULT 1");
  await database.execute("ALTER TABLE purchases ADD COLUMN unit_cost_nio REAL");
  await database.execute("ALTER TABLE purchases ADD COLUMN cpp_before_nio REAL");
  await database.execute("ALTER TABLE purchases ADD COLUMN projected_cpp_nio REAL");
  await database.execute("ALTER TABLE purchases ADD COLUMN lot_code TEXT");
  await database.execute("ALTER TABLE purchases ADD COLUMN received_date TEXT");
  await database.execute("ALTER TABLE purchases ADD COLUMN expiration_date TEXT");
  await database.execute("ALTER TABLE purchases ADD COLUMN requires_batch_tracking INTEGER NOT NULL DEFAULT 0");
  await database.execute("ALTER TABLE batches ADD COLUMN received_date TEXT");
  await database.execute("UPDATE purchases SET invoice_date = substr(timestamp, 1, 10) WHERE invoice_date = ''");
});

final allMigrations = [
  migration10_11,
  migration11_12,
  migration12_13,
  migration13_14,
  migration14_15,
];
