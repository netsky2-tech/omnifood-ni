import 'package:floor/floor.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

Future<void> _createInventoryMovementAppendOnlyTriggers(
  sqflite.DatabaseExecutor database,
) async {
  await database.execute('''
    CREATE TRIGGER IF NOT EXISTS inventory_movements_block_update
    BEFORE UPDATE ON inventory_movements
    BEGIN
      SELECT RAISE(ABORT, 'inventory_movements is append-only');
    END;
  ''');

  await database.execute('''
    CREATE TRIGGER IF NOT EXISTS inventory_movements_block_delete
    BEFORE DELETE ON inventory_movements
    BEGIN
      SELECT RAISE(ABORT, 'inventory_movements is append-only');
    END;
  ''');
}

final inventoryMovementAppendOnlyCallback = Callback(
  onCreate: (database, _) async {
    await _createInventoryMovementAppendOnlyTriggers(database);
  },
  onOpen: (database) async {
    await _createInventoryMovementAppendOnlyTriggers(database);
  },
);

final migration10_11 = Migration(10, 11, (database) async {
  await database.execute(
    'ALTER TABLE inventory_movements ADD COLUMN batch_deductions TEXT',
  );
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
  await database.execute(
    "ALTER TABLE cashier_sessions ADD COLUMN tipo_modelo TEXT NOT NULL DEFAULT 'CAJA_CENTRAL'",
  );
  await database.execute(
    "UPDATE cashier_sessions SET tipo_modelo = 'CAJA_CENTRAL' WHERE tipo_modelo IS NULL OR tipo_modelo = ''",
  );
});

final migration13_14 = Migration(13, 14, (database) async {
  await database.execute(
    "ALTER TABLE audit_logs ADD COLUMN remote_ref_uuid TEXT",
  );
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
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN invoice_date TEXT NOT NULL DEFAULT ''",
  );
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT 'NIO'",
  );
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN bcn_rate REAL NOT NULL DEFAULT 1",
  );
  await database.execute("ALTER TABLE purchases ADD COLUMN unit_cost_nio REAL");
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN cpp_before_nio REAL",
  );
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN projected_cpp_nio REAL",
  );
  await database.execute("ALTER TABLE purchases ADD COLUMN lot_code TEXT");
  await database.execute("ALTER TABLE purchases ADD COLUMN received_date TEXT");
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN expiration_date TEXT",
  );
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN requires_batch_tracking INTEGER NOT NULL DEFAULT 0",
  );
  await database.execute("ALTER TABLE batches ADD COLUMN received_date TEXT");
  await database.execute(
    "UPDATE purchases SET invoice_date = substr(timestamp, 1, 10) WHERE invoice_date = ''",
  );
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
  await database.execute("ALTER TABLE products ADD COLUMN category TEXT");
  await database.execute(
    "ALTER TABLE products ADD COLUMN is_prepared INTEGER NOT NULL DEFAULT 0",
  );
  await database.execute("ALTER TABLE products ADD COLUMN created_at TEXT");
});

/// Creates the tenant-administrable master catalog table and seeds default
/// values so the tablet can operate offline on first provisioning. Every
/// seeded row is a normal editable row in `catalog_values` — nothing here is
/// hardcoded in the POS UI. Mirrors the backend `DEFAULT_CATALOG_SEED`.
final migration20_21 = Migration(20, 21, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS catalog_values (
      id TEXT NOT NULL PRIMARY KEY,
      catalog_type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  ''');
  await database.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_type_code
    ON catalog_values (catalog_type, code)
  ''');

  for (final entry in _defaultCatalogSeed) {
    await database.rawInsert(
      'INSERT OR IGNORE INTO catalog_values '
      '(id, catalog_type, code, name, is_active, sort_order) '
      'VALUES (?, ?, ?, ?, ?, ?)',
      <Object>[
        entry.id,
        entry.type,
        entry.code,
        entry.name,
        1,
        entry.sortOrder,
      ],
    );
  }
});

class _CatalogSeedEntry {
  const _CatalogSeedEntry({
    required this.id,
    required this.type,
    required this.code,
    required this.name,
    required this.sortOrder,
  });
  final String id;
  final String type;
  final String code;
  final String name;
  final int sortOrder;
}

const List<_CatalogSeedEntry> _defaultCatalogSeed = <_CatalogSeedEntry>[
  // UOM (shared by inventory + sales)
  _CatalogSeedEntry(
    id: 'seed-uom-kg',
    type: 'UOM',
    code: 'kg',
    name: 'Kilogramo',
    sortOrder: 0,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-g',
    type: 'UOM',
    code: 'g',
    name: 'Gramo',
    sortOrder: 1,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-lb',
    type: 'UOM',
    code: 'lb',
    name: 'Libra',
    sortOrder: 2,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-oz',
    type: 'UOM',
    code: 'oz',
    name: 'Onza',
    sortOrder: 3,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-l',
    type: 'UOM',
    code: 'l',
    name: 'Litro',
    sortOrder: 4,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-ml',
    type: 'UOM',
    code: 'ml',
    name: 'Mililitro',
    sortOrder: 5,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-gal',
    type: 'UOM',
    code: 'gal',
    name: 'Galón',
    sortOrder: 6,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-un',
    type: 'UOM',
    code: 'un',
    name: 'Unidad',
    sortOrder: 7,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-doc',
    type: 'UOM',
    code: 'doc',
    name: 'Docena',
    sortOrder: 8,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-caja',
    type: 'UOM',
    code: 'caja',
    name: 'Caja',
    sortOrder: 9,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-paquete',
    type: 'UOM',
    code: 'paquete',
    name: 'Paquete',
    sortOrder: 10,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-saco',
    type: 'UOM',
    code: 'saco',
    name: 'Saco',
    sortOrder: 11,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-servicio',
    type: 'UOM',
    code: 'servicio',
    name: 'Servicio',
    sortOrder: 12,
  ),
  _CatalogSeedEntry(
    id: 'seed-uom-hora',
    type: 'UOM',
    code: 'hora',
    name: 'Hora',
    sortOrder: 13,
  ),
  // Inventory categories
  _CatalogSeedEntry(
    id: 'seed-icat-abarrotes',
    type: 'INVENTORY_CATEGORY',
    code: 'ABARROTOS',
    name: 'Abarrotes',
    sortOrder: 0,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-lacteos',
    type: 'INVENTORY_CATEGORY',
    code: 'LACTEOS',
    name: 'Lácteos',
    sortOrder: 1,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-carnes',
    type: 'INVENTORY_CATEGORY',
    code: 'CARNES',
    name: 'Carnes',
    sortOrder: 2,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-verduras',
    type: 'INVENTORY_CATEGORY',
    code: 'VERDURAS',
    name: 'Verduras',
    sortOrder: 3,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-frutas',
    type: 'INVENTORY_CATEGORY',
    code: 'FRUTAS',
    name: 'Frutas',
    sortOrder: 4,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-granos',
    type: 'INVENTORY_CATEGORY',
    code: 'GRANOS',
    name: 'Granos',
    sortOrder: 5,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-bebidas',
    type: 'INVENTORY_CATEGORY',
    code: 'BEBIDAS',
    name: 'Bebidas',
    sortOrder: 6,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-insumos-pos',
    type: 'INVENTORY_CATEGORY',
    code: 'INSUMOS_POS',
    name: 'Insumos POS',
    sortOrder: 7,
  ),
  _CatalogSeedEntry(
    id: 'seed-icat-otros',
    type: 'INVENTORY_CATEGORY',
    code: 'OTROS',
    name: 'Otros',
    sortOrder: 8,
  ),
  // Inventory types
  _CatalogSeedEntry(
    id: 'seed-itype-materia-prima',
    type: 'INVENTORY_TYPE',
    code: 'MATERIA_PRIMA',
    name: 'Materia prima',
    sortOrder: 0,
  ),
  _CatalogSeedEntry(
    id: 'seed-itype-empaque',
    type: 'INVENTORY_TYPE',
    code: 'EMPAQUE',
    name: 'Empaque',
    sortOrder: 1,
  ),
  _CatalogSeedEntry(
    id: 'seed-itype-no-comestible',
    type: 'INVENTORY_TYPE',
    code: 'NO_COMESTIBLE',
    name: 'No comestible',
    sortOrder: 2,
  ),
  // Sales product categories
  _CatalogSeedEntry(
    id: 'seed-pcat-comida',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'COMIDA',
    name: 'Comida',
    sortOrder: 0,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-bebida-caliente',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'BEBIDA_CALIENTE',
    name: 'Bebida caliente',
    sortOrder: 1,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-bebida-fria',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'BEBIDA_FRIA',
    name: 'Bebida fría',
    sortOrder: 2,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-panaderia',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'PANADERIA',
    name: 'Panadería',
    sortOrder: 3,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-snack',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'SNACK',
    name: 'Snack',
    sortOrder: 4,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-retail',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'RETAIL',
    name: 'Retail',
    sortOrder: 5,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-limpieza',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'LIMPIEZA',
    name: 'Limpieza',
    sortOrder: 6,
  ),
  _CatalogSeedEntry(
    id: 'seed-pcat-otros',
    type: 'SALES_PRODUCT_CATEGORY',
    code: 'OTROS',
    name: 'Otros',
    sortOrder: 7,
  ),
  // Sales product types
  _CatalogSeedEntry(
    id: 'seed-ptype-preparado',
    type: 'SALES_PRODUCT_TYPE',
    code: 'PREPARADO',
    name: 'Preparado (lleva receta/BOM)',
    sortOrder: 0,
  ),
  _CatalogSeedEntry(
    id: 'seed-ptype-reventa',
    type: 'SALES_PRODUCT_TYPE',
    code: 'REVENTA',
    name: 'Reventa directa',
    sortOrder: 1,
  ),
];

/// Adds per-line `recipe_version_id` to `invoice_items` so historical sales
/// keep the recipe version used at sale time (PRD UC-05). Nullable because
/// legacy rows and non-prepared products do not carry a version binding.
final migration21_22 = Migration(21, 22, (database) async {
  final columns = await database.rawQuery('PRAGMA table_info(invoice_items)');
  final hasRecipeVersionId = columns.any(
    (column) => column['name'] == 'recipe_version_id',
  );
  if (!hasRecipeVersionId) {
    await database.execute(
      'ALTER TABLE invoice_items ADD COLUMN recipe_version_id TEXT',
    );
  }
});

final migration22_23 = Migration(22, 23, (database) async {
  await database.execute('''
    CREATE TABLE IF NOT EXISTS inventory_movement_sync_state_legacy (
      movement_id TEXT NOT NULL PRIMARY KEY,
      sync_status TEXT NOT NULL,
      last_attempted_at TEXT,
      synced_at TEXT,
      last_error TEXT
    )
  ''');

  await database.execute('DELETE FROM inventory_movement_sync_state_legacy');

  await database.execute('''
    INSERT OR REPLACE INTO inventory_movement_sync_state_legacy (
      movement_id,
      sync_status,
      last_attempted_at,
      synced_at,
      last_error
    )
    SELECT
      id,
      CASE
        WHEN is_synced = 1 THEN 'synced'
        WHEN is_synced = -1 THEN 'failed'
      END,
      NULL,
      NULL,
      NULL
    FROM inventory_movements
    WHERE is_synced IN (1, -1)
  ''');

  await database.execute('DROP TABLE IF EXISTS inventory_movement_sync_state');
  await database.execute('DROP TABLE IF EXISTS inventory_movements_new');

  await database.execute('''
    CREATE TABLE inventory_movements_new (
      id TEXT NOT NULL PRIMARY KEY,
      insumo_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      previous_stock REAL NOT NULL,
      new_stock REAL NOT NULL,
      timestamp TEXT NOT NULL,
      reason TEXT,
      user_id TEXT,
      batch_deductions TEXT
    )
  ''');

  await database.execute('''
    INSERT INTO inventory_movements_new (
      id,
      insumo_id,
      type,
      quantity,
      previous_stock,
      new_stock,
      timestamp,
      reason,
      user_id,
      batch_deductions
    )
    SELECT
      id,
      insumo_id,
      type,
      quantity,
      previous_stock,
      new_stock,
      timestamp,
      reason,
      user_id,
      batch_deductions
    FROM inventory_movements
  ''');

  await database.execute('DROP TABLE inventory_movements');
  await database.execute(
    'ALTER TABLE inventory_movements_new RENAME TO inventory_movements',
  );

  await database.execute('''
    CREATE TABLE IF NOT EXISTS inventory_movement_sync_state (
      movement_id TEXT NOT NULL PRIMARY KEY,
      sync_status TEXT NOT NULL,
      last_attempted_at TEXT,
      synced_at TEXT,
      last_error TEXT,
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id) ON DELETE CASCADE
    )
  ''');

  await database.execute('''
    INSERT OR REPLACE INTO inventory_movement_sync_state (
      movement_id,
      sync_status,
      last_attempted_at,
      synced_at,
      last_error
    )
    SELECT
      movement_id,
      sync_status,
      last_attempted_at,
      synced_at,
      last_error
    FROM inventory_movement_sync_state_legacy
  ''');

  await database.execute('DROP TABLE inventory_movement_sync_state_legacy');

  await _createInventoryMovementAppendOnlyTriggers(database);
});

final migration23_24 = Migration(23, 24, (database) async {
  await database.execute(
    "ALTER TABLE purchases ADD COLUMN invoice_number TEXT NOT NULL DEFAULT ''",
  );
});

final migration24_25 = Migration(24, 25, (database) async {
  await database.execute('ALTER TABLE purchases ADD COLUMN fx_rate_mode TEXT');
});

final migration25_26 = Migration(25, 26, (database) async {
  await database.execute(
    'ALTER TABLE purchases ADD COLUMN fiscal_authorization_code TEXT',
  );
});

final migration26_27 = Migration(26, 27, (database) async {
  final syncTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movement_sync_state'",
  );
  final movementTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'",
  );
  if (syncTable.isEmpty || movementTable.isEmpty) {
    return;
  }

  final columns = await database.rawQuery(
    'PRAGMA table_info(inventory_movement_sync_state)',
  );
  final existingColumnNames = columns
      .map((column) => column['name'] as String)
      .toSet();

  Future<void> addColumnIfMissing(String columnName, String definition) async {
    if (!existingColumnNames.contains(columnName)) {
      await database.execute(
        'ALTER TABLE inventory_movement_sync_state ADD COLUMN $definition',
      );
    }
  }

  await addColumnIfMissing('terminal_id', 'terminal_id TEXT');
  await addColumnIfMissing('flow_type', 'flow_type TEXT');
  await addColumnIfMissing('local_sequence', 'local_sequence INTEGER');
  await addColumnIfMissing('idempotency_key', 'idempotency_key TEXT');
  await addColumnIfMissing('last_result_code', 'last_result_code TEXT');

  // Legacy provenance fallback for rows created before durable sync metadata
  // existed. Runtime terminal identity still comes from the audit/device source.
  await database.execute('''
    INSERT OR IGNORE INTO inventory_movement_sync_state (
      movement_id,
      sync_status,
      terminal_id,
      flow_type,
      local_sequence,
      idempotency_key
    )
    SELECT
      id,
      'pending',
      'pos-standalone',
      'inventory',
      ROW_NUMBER() OVER (ORDER BY timestamp ASC, id ASC),
      'inventory:pos-standalone:' || id
    FROM inventory_movements
  ''');

  await database.execute('''
    UPDATE inventory_movement_sync_state
    SET
      terminal_id = COALESCE(NULLIF(terminal_id, ''), 'pos-standalone'),
      flow_type = COALESCE(NULLIF(flow_type, ''), 'inventory'),
      local_sequence = COALESCE(
        local_sequence,
        (
          SELECT ranked.sequence
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (ORDER BY timestamp ASC, id ASC) AS sequence
            FROM inventory_movements
          ) ranked
          WHERE ranked.id = inventory_movement_sync_state.movement_id
        )
      ),
      idempotency_key = COALESCE(
        NULLIF(idempotency_key, ''),
        'inventory:pos-standalone:' || movement_id
      )
    WHERE movement_id IN (SELECT id FROM inventory_movements)
  ''');

  await database.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_sync_state_stream_sequence
    ON inventory_movement_sync_state (terminal_id, flow_type, local_sequence)
    WHERE local_sequence IS NOT NULL
  ''');

  await database.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_sync_state_idempotency_key
    ON inventory_movement_sync_state (idempotency_key)
    WHERE idempotency_key IS NOT NULL
  ''');
});

final migration27_28 = Migration(27, 28, (database) async {
  final movementTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'",
  );
  if (movementTable.isEmpty) {
    return;
  }

  final columns = await database.rawQuery(
    'PRAGMA table_info(inventory_movements)',
  );
  final existingColumnNames = columns
      .map((column) => column['name'] as String)
      .toSet();

  Future<void> addColumnIfMissing(String columnName, String definition) async {
    if (!existingColumnNames.contains(columnName)) {
      await database.execute(
        'ALTER TABLE inventory_movements ADD COLUMN $definition',
      );
    }
  }

  await addColumnIfMissing('unit_cost_nio', 'unit_cost_nio REAL');
  await addColumnIfMissing('source_document_type', 'source_document_type TEXT');
  await addColumnIfMissing('source_document_id', 'source_document_id TEXT');
});

final migration28_29 = Migration(28, 29, (database) async {
  final table = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_order_documents'",
  );
  if (table.isEmpty) {
    return;
  }

  final columns = await database.rawQuery(
    'PRAGMA table_info(production_order_documents)',
  );
  final existingColumnNames = columns
      .map((column) => column['name'] as String)
      .toSet();

  Future<void> addColumnIfMissing(String columnName, String definition) async {
    if (!existingColumnNames.contains(columnName)) {
      await database.execute(
        'ALTER TABLE production_order_documents ADD COLUMN $definition',
      );
    }
  }

  await addColumnIfMissing(
    'outcome',
    "outcome TEXT NOT NULL DEFAULT 'COMPLETED'",
  );
  await addColumnIfMissing('failure_reason', 'failure_reason TEXT');
  await addColumnIfMissing('terminal_id', 'terminal_id TEXT');
  await addColumnIfMissing(
    'source_sequence',
    'source_sequence INTEGER NOT NULL DEFAULT 1',
  );
  await addColumnIfMissing(
    'idempotency_key',
    "idempotency_key TEXT NOT NULL DEFAULT ''",
  );
  await addColumnIfMissing(
    'payload_hash',
    "payload_hash TEXT NOT NULL DEFAULT ''",
  );
  await addColumnIfMissing(
    'total_consumed_cost_nio',
    'total_consumed_cost_nio REAL NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(
    'produced_unit_cost_nio',
    'produced_unit_cost_nio REAL NOT NULL DEFAULT 0',
  );

  await database.execute('''
    CREATE TABLE IF NOT EXISTS local_configs (
      key TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    )
  ''');

  const terminalDeviceIdKey = 'terminal_device_id';
  final terminalRows = await database.query(
    'local_configs',
    columns: ['value'],
    where: 'key = ?',
    whereArgs: [terminalDeviceIdKey],
    limit: 1,
  );
  var localTerminalId = terminalRows.isEmpty
      ? ''
      : (terminalRows.single['value'] as String?)?.trim() ?? '';
  if (localTerminalId.isEmpty) {
    final generatedRows = await database.rawQuery(
      "SELECT 'pos-local-' || lower(hex(randomblob(16))) AS value",
    );
    localTerminalId = generatedRows.single['value'] as String;
    await database.insert('local_configs', {
      'key': terminalDeviceIdKey,
      'value': localTerminalId,
      'description':
          'Stable offline-safe terminal identity generated on first install.',
    }, conflictAlgorithm: sqflite.ConflictAlgorithm.replace);
  }

  await database.rawUpdate(
    '''
    UPDATE production_order_documents
    SET terminal_id = ?
    WHERE terminal_id IS NULL OR terminal_id = ''
  ''',
    [localTerminalId],
  );

  await database.execute('''
    UPDATE production_order_documents
    SET
      source_sequence = (
        SELECT ranked.sequence
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY terminal_id
              ORDER BY operation_date ASC, id ASC
            ) AS sequence
          FROM production_order_documents
          WHERE is_synced = 0
        ) ranked
        WHERE ranked.id = production_order_documents.id
      ),
      idempotency_key = CASE
        WHEN idempotency_key = '' THEN 'production:' || terminal_id || ':' || id
        ELSE idempotency_key
      END,
      payload_hash = CASE
        WHEN payload_hash = '' THEN id || ':' || outcome || ':' || planned_quantity || ':' || actual_quantity
        ELSE payload_hash
      END
    WHERE is_synced = 0
  ''');

  await database.execute('''
    UPDATE production_order_documents
    SET
      source_sequence = (
        SELECT -ranked.sequence
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY terminal_id
              ORDER BY operation_date ASC, id ASC
            ) AS sequence
          FROM production_order_documents
          WHERE is_synced != 0
        ) ranked
        WHERE ranked.id = production_order_documents.id
      ),
      idempotency_key = CASE
        WHEN idempotency_key = '' THEN 'production:' || terminal_id || ':' || id
        ELSE idempotency_key
      END,
      payload_hash = CASE
        WHEN payload_hash = '' THEN id || ':' || outcome || ':' || planned_quantity || ':' || actual_quantity
        ELSE payload_hash
      END
    WHERE is_synced != 0
  ''');

  await database.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_order_documents_idempotency_key
    ON production_order_documents (idempotency_key)
  ''');

  await database.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_order_documents_terminal_source_sequence
    ON production_order_documents (terminal_id, source_sequence)
    WHERE source_sequence > 0
  ''');
});

final migration29_30 = Migration(29, 30, (database) async {
  Future<void> addColumnIfMissing(
    String tableName,
    String columnName,
    String definition,
  ) async {
    final table = await database.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName],
    );
    if (table.isEmpty) return;

    final columns = await database.rawQuery('PRAGMA table_info($tableName)');
    final existingColumnNames = columns
        .map((column) => column['name'] as String)
        .toSet();
    if (!existingColumnNames.contains(columnName)) {
      await database.execute('ALTER TABLE $tableName ADD COLUMN $definition');
    }
  }

  await addColumnIfMissing(
    'invoices',
    'origin_invoice_id',
    'origin_invoice_id TEXT',
  );
  await addColumnIfMissing(
    'invoices',
    'refund_reason_policy',
    'refund_reason_policy TEXT',
  );
  await addColumnIfMissing('invoices', 'terminal_id', 'terminal_id TEXT');
  await addColumnIfMissing(
    'invoices',
    'source_sequence',
    'source_sequence INTEGER',
  );
  await addColumnIfMissing(
    'invoices',
    'idempotency_key',
    'idempotency_key TEXT',
  );
  await addColumnIfMissing('invoices', 'payload_hash', 'payload_hash TEXT');

  Future<bool> tableExists(String tableName) async {
    final table = await database.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName],
    );
    return table.isNotEmpty;
  }

  await database.execute('''
    CREATE TABLE IF NOT EXISTS local_configs (
      key TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    )
  ''');

  const terminalDeviceIdKey = 'terminal_device_id';
  final terminalRows = await database.query(
    'local_configs',
    columns: ['value'],
    where: 'key = ?',
    whereArgs: [terminalDeviceIdKey],
    limit: 1,
  );
  var localTerminalId = terminalRows.isEmpty
      ? ''
      : (terminalRows.single['value'] as String?)?.trim() ?? '';
  if (localTerminalId.isEmpty) {
    final generatedRows = await database.rawQuery(
      "SELECT 'pos-local-' || lower(hex(randomblob(16))) AS value",
    );
    localTerminalId = generatedRows.single['value'] as String;
    await database.insert('local_configs', {
      'key': terminalDeviceIdKey,
      'value': localTerminalId,
      'description':
          'Stable offline-safe terminal identity generated on first install.',
    }, conflictAlgorithm: sqflite.ConflictAlgorithm.replace);
  }

  if (await tableExists('invoices')) {
    await database.rawUpdate(
      '''
      UPDATE invoices
      SET terminal_id = ?
      WHERE terminal_id IS NULL OR terminal_id = ''
    ''',
      [localTerminalId],
    );

    await database.execute('''
      UPDATE invoices
      SET
        source_sequence = (
          SELECT ranked.sequence
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY terminal_id
                ORDER BY created_at ASC, id ASC
              ) AS sequence
            FROM invoices
            WHERE sync_status = 'pending' AND type = 'regular'
          ) ranked
          WHERE ranked.id = invoices.id
        ),
        idempotency_key = CASE
          WHEN idempotency_key IS NULL OR idempotency_key = '' THEN 'sale:' || terminal_id || ':' || id
          ELSE idempotency_key
        END,
        payload_hash = CASE
          WHEN payload_hash IS NULL OR payload_hash = '' THEN id || ':' || invoice_number || ':' || total || ':' || created_at
          ELSE payload_hash
        END
      WHERE sync_status = 'pending' AND type = 'regular'
    ''');

    await database.execute('''
      UPDATE invoices
      SET
        source_sequence = (
          SELECT -ranked.sequence
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY terminal_id
                ORDER BY created_at ASC, id ASC
              ) AS sequence
            FROM invoices
            WHERE sync_status != 'pending' AND type = 'regular'
          ) ranked
          WHERE ranked.id = invoices.id
        ),
        idempotency_key = CASE
          WHEN idempotency_key IS NULL OR idempotency_key = '' THEN 'sale:' || terminal_id || ':' || id
          ELSE idempotency_key
        END,
        payload_hash = CASE
          WHEN payload_hash IS NULL OR payload_hash = '' THEN id || ':' || invoice_number || ':' || total || ':' || created_at
          ELSE payload_hash
        END
      WHERE sync_status != 'pending' AND type = 'regular'
    ''');
  }
  await addColumnIfMissing(
    'invoice_items',
    'origin_invoice_item_id',
    'origin_invoice_item_id TEXT',
  );
  await addColumnIfMissing(
    'inventory_movements',
    'origin_movement_id',
    'origin_movement_id TEXT',
  );
  await addColumnIfMissing(
    'inventory_movements',
    'origin_invoice_item_id',
    'origin_invoice_item_id TEXT',
  );

  if (await tableExists('invoices')) {
    await database.execute('''
      CREATE INDEX IF NOT EXISTS idx_invoices_origin_invoice_id
      ON invoices (origin_invoice_id)
      WHERE origin_invoice_id IS NOT NULL
    ''');
    await database.execute('''
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_terminal_source_sequence
      ON invoices (terminal_id, source_sequence)
      WHERE source_sequence > 0
    ''');
    await database.execute('''
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency_key
      ON invoices (idempotency_key)
      WHERE idempotency_key IS NOT NULL AND idempotency_key != ''
    ''');
  }
  if (await tableExists('invoice_items')) {
    await database.execute('''
      CREATE INDEX IF NOT EXISTS idx_invoice_items_origin_invoice_item_id
      ON invoice_items (origin_invoice_item_id)
      WHERE origin_invoice_item_id IS NOT NULL
    ''');
  }
  if (await tableExists('inventory_movements')) {
    await database.execute('''
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_origin_invoice_item_id
      ON inventory_movements (origin_invoice_item_id)
      WHERE origin_invoice_item_id IS NOT NULL
    ''');
  }
});

final migration30_31 = Migration(30, 31, (database) async {
  final invoiceTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invoices'",
  );
  if (invoiceTable.isEmpty) return;

  Future<void> addColumnIfMissing(
    String tableName,
    String columnName,
    String definition,
  ) async {
    final columns = await database.rawQuery('PRAGMA table_info($tableName)');
    final existingColumnNames = columns
        .map((column) => column['name'] as String)
        .toSet();
    if (!existingColumnNames.contains(columnName)) {
      await database.execute('ALTER TABLE $tableName ADD COLUMN $definition');
    }
  }

  await addColumnIfMissing(
    'invoices',
    'refund_reason_code',
    'refund_reason_code TEXT',
  );
  await addColumnIfMissing(
    'invoices',
    'authorized_by_user_id',
    'authorized_by_user_id TEXT',
  );
  await addColumnIfMissing(
    'invoices',
    'authorized_by_role',
    'authorized_by_role TEXT',
  );
});

final migration31_32 = Migration(31, 32, (database) async {
  final auditTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'",
  );
  if (auditTable.isEmpty) return;
  await database.execute('ALTER TABLE audit_logs ADD COLUMN hash_version TEXT');
});

final migration32_33 = Migration(32, 33, (database) async {
  final auditTable = await database.rawQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'",
  );
  if (auditTable.isEmpty) return;
  await database.execute(
    'ALTER TABLE audit_logs ADD COLUMN has_metodo_autorizacion INTEGER',
  );
  await database.execute(
    'ALTER TABLE audit_logs ADD COLUMN has_usuario_autorizador_id INTEGER',
  );
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
  migration20_21,
  migration21_22,
  migration22_23,
  migration23_24,
  migration24_25,
  migration25_26,
  migration26_27,
  migration27_28,
  migration28_29,
  migration29_30,
  migration30_31,
  migration31_32,
  migration32_33,
];
