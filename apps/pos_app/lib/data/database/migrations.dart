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

final migration15_16 = Migration(15, 16, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS recipe_version_documents (
      id TEXT NOT NULL PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      yield_quantity REAL NOT NULL,
      technical_shrink_pct REAL NOT NULL,
      created_at TEXT NOT NULL,
      version_note TEXT,
      published_at TEXT,
      components_json TEXT NOT NULL,
      is_synced INTEGER NOT NULL DEFAULT 0
    )
  ''');
  await database.execute('''
    CREATE TABLE IF NOT EXISTS production_order_documents (
      id TEXT NOT NULL PRIMARY KEY,
      recipe_version_id TEXT NOT NULL,
      recipe_product_id TEXT NOT NULL,
      recipe_product_name TEXT NOT NULL,
      produced_insumo_id TEXT NOT NULL,
      produced_insumo_name TEXT NOT NULL,
      planned_quantity REAL NOT NULL,
      actual_quantity REAL NOT NULL,
      produced_batch_number TEXT NOT NULL,
      produced_expiration_date TEXT NOT NULL,
      operation_date TEXT NOT NULL,
      status TEXT NOT NULL,
      variance_reason TEXT,
      closed_at TEXT,
      movement_references_json TEXT NOT NULL,
      is_synced INTEGER NOT NULL DEFAULT 0
    )
  ''');
});

final migration16_17 = Migration(16, 17, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS count_session_documents (
      id TEXT NOT NULL PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      warehouse_name TEXT NOT NULL,
      cutoff_at TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      notes TEXT,
      posted_at TEXT,
      movement_references_json TEXT NOT NULL,
      is_synced INTEGER NOT NULL DEFAULT 0
    )
  ''');
  await database.execute('''
    CREATE TABLE IF NOT EXISTS count_lines (
      id TEXT NOT NULL PRIMARY KEY,
      session_id TEXT NOT NULL,
      insumo_id TEXT NOT NULL,
      insumo_name TEXT NOT NULL,
      uom TEXT NOT NULL,
      theoretical_quantity REAL NOT NULL,
      approved_entry_index INTEGER,
      entries_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES count_session_documents(id) ON DELETE CASCADE
    )
  ''');
});

final migration17_18 = Migration(17, 18, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS forensic_alerts (
      id TEXT NOT NULL PRIMARY KEY,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      actor_label TEXT,
      acted_at TEXT,
      source_movement_id TEXT,
      source_document_id TEXT,
      source_document_type TEXT,
      metadata_json TEXT,
      is_synced INTEGER NOT NULL DEFAULT 0
    )
  ''');
});

final migration18_19 = Migration(18, 19, (database) async {
  await database.execute('ALTER TABLE insumos ADD COLUMN stock_min REAL');
  await database.execute('ALTER TABLE insumos ADD COLUMN stock_max REAL');
});

final migration19_20 = Migration(19, 20, (database) async {
  await database.execute('ALTER TABLE products ADD COLUMN category TEXT');
  await database.execute('ALTER TABLE products ADD COLUMN is_prepared INTEGER NOT NULL DEFAULT 0');
  await database.execute('ALTER TABLE products ADD COLUMN created_at TEXT');
});

final allMigrations = [
  migration10_11,
  migration11_12,
  migration12_13,
  migration13_14,
  migration14_15,
  migration15_16,
  migration16_17,
  migration17_18,
  migration18_19,
  migration19_20,
];
