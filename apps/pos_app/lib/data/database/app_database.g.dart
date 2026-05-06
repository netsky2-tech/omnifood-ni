// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// **************************************************************************
// FloorGenerator
// **************************************************************************

abstract class $AppDatabaseBuilderContract {
  /// Adds migrations to the builder.
  $AppDatabaseBuilderContract addMigrations(List<Migration> migrations);

  /// Adds a database [Callback] to the builder.
  $AppDatabaseBuilderContract addCallback(Callback callback);

  /// Creates the database and initializes it.
  Future<AppDatabase> build();
}

// ignore: avoid_classes_with_only_static_members
class $FloorAppDatabase {
  /// Creates a database builder for a persistent database.
  /// Once a database is built, you should keep a reference to it and re-use it.
  static $AppDatabaseBuilderContract databaseBuilder(String name) =>
      _$AppDatabaseBuilder(name);

  /// Creates a database builder for an in memory database.
  /// Information stored in an in memory database disappears when the process is killed.
  /// Once a database is built, you should keep a reference to it and re-use it.
  static $AppDatabaseBuilderContract inMemoryDatabaseBuilder() =>
      _$AppDatabaseBuilder(null);
}

class _$AppDatabaseBuilder implements $AppDatabaseBuilderContract {
  _$AppDatabaseBuilder(this.name);

  final String? name;

  final List<Migration> _migrations = [];

  Callback? _callback;

  @override
  $AppDatabaseBuilderContract addMigrations(List<Migration> migrations) {
    _migrations.addAll(migrations);
    return this;
  }

  @override
  $AppDatabaseBuilderContract addCallback(Callback callback) {
    _callback = callback;
    return this;
  }

  @override
  Future<AppDatabase> build() async {
    final path = name != null
        ? await sqfliteDatabaseFactory.getDatabasePath(name!)
        : ':memory:';
    final database = _$AppDatabase();
    database.database = await database.open(
      path,
      _migrations,
      _callback,
    );
    return database;
  }
}

class _$AppDatabase extends AppDatabase {
  _$AppDatabase([StreamController<String>? listener]) {
    changeListener = listener ?? StreamController<String>.broadcast();
  }

  UserDao? _userDaoInstance;

  AuditDao? _auditDaoInstance;

  LocalConfigDao? _localConfigDaoInstance;

  InsumoDao? _insumoDaoInstance;

  ProductDao? _productDaoInstance;

  RecipeDao? _recipeDaoInstance;

  MovementDao? _movementDaoInstance;

  InventoryDao? _inventoryDaoInstance;

  SupplierDao? _supplierDaoInstance;

  WarehouseDao? _warehouseDaoInstance;

  PurchaseDao? _purchaseDaoInstance;

  UomConversionDao? _uomConversionDaoInstance;

  BatchDao? _batchDaoInstance;

  InvoiceDao? _invoiceDaoInstance;

  InvoiceItemDao? _invoiceItemDaoInstance;

  PaymentDao? _paymentDaoInstance;

  TaxConfigDao? _taxConfigDaoInstance;

  SalesTransactionDao? _salesTransactionDaoInstance;

  CashierSessionDao? _cashierSessionDaoInstance;

  HoldTicketDao? _holdTicketDaoInstance;

  PromotionDao? _promotionDaoInstance;

  Future<sqflite.Database> open(
    String path,
    List<Migration> migrations, [
    Callback? callback,
  ]) async {
    final databaseOptions = sqflite.OpenDatabaseOptions(
      version: 10,
      onConfigure: (database) async {
        await database.execute('PRAGMA foreign_keys = ON');
        await callback?.onConfigure?.call(database);
      },
      onOpen: (database) async {
        await callback?.onOpen?.call(database);
      },
      onUpgrade: (database, startVersion, endVersion) async {
        await MigrationAdapter.runMigrations(
            database, startVersion, endVersion, migrations);

        await callback?.onUpgrade?.call(database, startVersion, endVersion);
      },
      onCreate: (database, version) async {
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `users` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `role` TEXT NOT NULL, `pin_hash` TEXT NOT NULL, `is_active` INTEGER NOT NULL, `email` TEXT, `tenant_id` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `audit_logs` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` TEXT NOT NULL, `action` TEXT NOT NULL, `timestamp` TEXT NOT NULL, `device_id` TEXT NOT NULL, `metadata` TEXT, `is_synced` INTEGER NOT NULL)');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `local_configs` (`key` TEXT NOT NULL, `value` TEXT NOT NULL, `description` TEXT, PRIMARY KEY (`key`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `insumos` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `consumption_uom` TEXT NOT NULL, `warehouse_id` TEXT, `is_perishable` INTEGER NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `par_level` REAL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `products` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `uom` TEXT NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `sell_price` REAL NOT NULL, `is_active` INTEGER NOT NULL, `sku` TEXT, `barcode` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `product_variants` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `name` TEXT NOT NULL, `price_adjustment` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `product_modifiers` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `name` TEXT NOT NULL, `extra_price` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `recipes` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `ingredient_id` TEXT NOT NULL, `ingredient_type` TEXT NOT NULL, `quantity` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `inventory_movements` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `type` TEXT NOT NULL, `quantity` REAL NOT NULL, `previous_stock` REAL NOT NULL, `new_stock` REAL NOT NULL, `timestamp` TEXT NOT NULL, `reason` TEXT, `user_id` TEXT, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `suppliers` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `phone` TEXT, `contact_person` TEXT, `credit_terms` TEXT, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `warehouses` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `description` TEXT, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `purchases` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `supplier_id` TEXT NOT NULL, `quantity` REAL NOT NULL, `unit_cost` REAL NOT NULL, `timestamp` TEXT NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `uom_conversions` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `unit_name` TEXT NOT NULL, `factor` REAL NOT NULL, `is_default` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `batches` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `batch_number` TEXT NOT NULL, `expiration_date` TEXT NOT NULL, `remaining_stock` REAL NOT NULL, `cost` REAL NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoices` (`id` TEXT NOT NULL, `invoice_number` TEXT NOT NULL, `created_at` INTEGER NOT NULL, `user_id` TEXT NOT NULL, `subtotal` REAL NOT NULL, `total_tax` REAL NOT NULL, `total` REAL NOT NULL, `is_canceled` INTEGER NOT NULL, `void_reason` TEXT, `sync_status` TEXT NOT NULL, `payment_status` TEXT NOT NULL, `customer_id` TEXT, `global_tax_override` INTEGER NOT NULL, `type` TEXT NOT NULL, `related_invoice_id` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoice_items` (`id` TEXT NOT NULL, `invoice_id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `quantity` REAL NOT NULL, `unit_price` REAL NOT NULL, `original_tax_rate` REAL NOT NULL, `applied_tax_rate` REAL NOT NULL, `tax_amount` REAL NOT NULL, `total` REAL NOT NULL, `discount` REAL NOT NULL, `variant_id` TEXT, `notes` TEXT, FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoice_item_modifiers` (`id` TEXT NOT NULL, `invoice_item_id` TEXT NOT NULL, `name` TEXT NOT NULL, `extra_price` REAL NOT NULL, FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `payments` (`id` TEXT NOT NULL, `invoice_id` TEXT NOT NULL, `method` TEXT NOT NULL, `amount` REAL NOT NULL, `currency` TEXT NOT NULL, `exchange_rate` REAL NOT NULL, `created_at` INTEGER, FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `tax_configurations` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `rate` REAL NOT NULL, `is_active` INTEGER NOT NULL, `is_default` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `cashier_sessions` (`id` TEXT NOT NULL, `user_id` TEXT NOT NULL, `opened_at` INTEGER NOT NULL, `closed_at` INTEGER, `opening_balance` REAL NOT NULL, `closing_balance` REAL, `total_sales` REAL, `total_expected` REAL, `is_closed` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `hold_tickets` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `created_at` INTEGER NOT NULL, `global_tax_exempt` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `hold_ticket_items` (`id` TEXT NOT NULL, `hold_ticket_id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `quantity` REAL NOT NULL, `unit_price` REAL NOT NULL, `tax_rate` REAL NOT NULL, FOREIGN KEY (`hold_ticket_id`) REFERENCES `hold_tickets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `promotions` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `type` TEXT NOT NULL, `target_product_id` TEXT NOT NULL, `buy_quantity` INTEGER NOT NULL, `get_quantity` INTEGER NOT NULL, `discount_value` REAL NOT NULL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');

        await callback?.onCreate?.call(database, version);
      },
    );
    return sqfliteDatabaseFactory.openDatabase(path, options: databaseOptions);
  }

  @override
  UserDao get userDao {
    return _userDaoInstance ??= _$UserDao(database, changeListener);
  }

  @override
  AuditDao get auditDao {
    return _auditDaoInstance ??= _$AuditDao(database, changeListener);
  }

  @override
  LocalConfigDao get localConfigDao {
    return _localConfigDaoInstance ??=
        _$LocalConfigDao(database, changeListener);
  }

  @override
  InsumoDao get insumoDao {
    return _insumoDaoInstance ??= _$InsumoDao(database, changeListener);
  }

  @override
  ProductDao get productDao {
    return _productDaoInstance ??= _$ProductDao(database, changeListener);
  }

  @override
  RecipeDao get recipeDao {
    return _recipeDaoInstance ??= _$RecipeDao(database, changeListener);
  }

  @override
  MovementDao get movementDao {
    return _movementDaoInstance ??= _$MovementDao(database, changeListener);
  }

  @override
  InventoryDao get inventoryDao {
    return _inventoryDaoInstance ??= _$InventoryDao(database, changeListener);
  }

  @override
  SupplierDao get supplierDao {
    return _supplierDaoInstance ??= _$SupplierDao(database, changeListener);
  }

  @override
  WarehouseDao get warehouseDao {
    return _warehouseDaoInstance ??= _$WarehouseDao(database, changeListener);
  }

  @override
  PurchaseDao get purchaseDao {
    return _purchaseDaoInstance ??= _$PurchaseDao(database, changeListener);
  }

  @override
  UomConversionDao get uomConversionDao {
    return _uomConversionDaoInstance ??=
        _$UomConversionDao(database, changeListener);
  }

  @override
  BatchDao get batchDao {
    return _batchDaoInstance ??= _$BatchDao(database, changeListener);
  }

  @override
  InvoiceDao get invoiceDao {
    return _invoiceDaoInstance ??= _$InvoiceDao(database, changeListener);
  }

  @override
  InvoiceItemDao get invoiceItemDao {
    return _invoiceItemDaoInstance ??=
        _$InvoiceItemDao(database, changeListener);
  }

  @override
  PaymentDao get paymentDao {
    return _paymentDaoInstance ??= _$PaymentDao(database, changeListener);
  }

  @override
  TaxConfigDao get taxConfigDao {
    return _taxConfigDaoInstance ??= _$TaxConfigDao(database, changeListener);
  }

  @override
  SalesTransactionDao get salesTransactionDao {
    return _salesTransactionDaoInstance ??=
        _$SalesTransactionDao(database, changeListener);
  }

  @override
  CashierSessionDao get cashierSessionDao {
    return _cashierSessionDaoInstance ??=
        _$CashierSessionDao(database, changeListener);
  }

  @override
  HoldTicketDao get holdTicketDao {
    return _holdTicketDaoInstance ??= _$HoldTicketDao(database, changeListener);
  }

  @override
  PromotionDao get promotionDao {
    return _promotionDaoInstance ??= _$PromotionDao(database, changeListener);
  }
}

class _$UserDao extends UserDao {
  _$UserDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _userEntityInsertionAdapter = InsertionAdapter(
            database,
            'users',
            (UserEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'role': item.role,
                  'pin_hash': item.pinHash,
                  'is_active': item.isActive ? 1 : 0,
                  'email': item.email,
                  'tenant_id': item.tenantId
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<UserEntity> _userEntityInsertionAdapter;

  @override
  Future<List<UserEntity>> findAllActiveUsers() async {
    return _queryAdapter.queryList('SELECT * FROM users WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => UserEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            role: row['role'] as String,
            pinHash: row['pin_hash'] as String,
            isActive: (row['is_active'] as int) != 0,
            email: row['email'] as String?,
            tenantId: row['tenant_id'] as String?));
  }

  @override
  Future<List<UserEntity>> findAllUsers() async {
    return _queryAdapter.queryList('SELECT * FROM users',
        mapper: (Map<String, Object?> row) => UserEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            role: row['role'] as String,
            pinHash: row['pin_hash'] as String,
            isActive: (row['is_active'] as int) != 0,
            email: row['email'] as String?,
            tenantId: row['tenant_id'] as String?));
  }

  @override
  Future<UserEntity?> findUserById(String id) async {
    return _queryAdapter.query('SELECT * FROM users WHERE id = ?1',
        mapper: (Map<String, Object?> row) => UserEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            role: row['role'] as String,
            pinHash: row['pin_hash'] as String,
            isActive: (row['is_active'] as int) != 0,
            email: row['email'] as String?,
            tenantId: row['tenant_id'] as String?),
        arguments: [id]);
  }

  @override
  Future<void> deleteAllUsers() async {
    await _queryAdapter.queryNoReturn('DELETE FROM users');
  }

  @override
  Future<void> insertUsers(List<UserEntity> users) async {
    await _userEntityInsertionAdapter.insertList(
        users, OnConflictStrategy.replace);
  }
}

class _$AuditDao extends AuditDao {
  _$AuditDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _auditLogEntityInsertionAdapter = InsertionAdapter(
            database,
            'audit_logs',
            (AuditLogEntity item) => <String, Object?>{
                  'id': item.id,
                  'user_id': item.userId,
                  'action': item.action,
                  'timestamp': item.timestamp,
                  'device_id': item.deviceId,
                  'metadata': item.metadata,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<AuditLogEntity> _auditLogEntityInsertionAdapter;

  @override
  Future<List<AuditLogEntity>> findAllLogs() async {
    return _queryAdapter.queryList(
        'SELECT * FROM audit_logs ORDER BY timestamp DESC',
        mapper: (Map<String, Object?> row) => AuditLogEntity(
            id: row['id'] as int?,
            userId: row['user_id'] as String,
            action: row['action'] as String,
            timestamp: row['timestamp'] as String,
            deviceId: row['device_id'] as String,
            metadata: row['metadata'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<AuditLogEntity>> findLogsWithFilters(
    String start,
    String end,
    String userId,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM audit_logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND (?3 = \"\" OR user_id = ?3) ORDER BY timestamp DESC',
        mapper: (Map<String, Object?> row) => AuditLogEntity(id: row['id'] as int?, userId: row['user_id'] as String, action: row['action'] as String, timestamp: row['timestamp'] as String, deviceId: row['device_id'] as String, metadata: row['metadata'] as String?, isSynced: (row['is_synced'] as int) != 0),
        arguments: [start, end, userId]);
  }

  @override
  Future<List<AuditLogEntity>> findUnsyncedLogs() async {
    return _queryAdapter.queryList(
        'SELECT * FROM audit_logs WHERE is_synced = 0',
        mapper: (Map<String, Object?> row) => AuditLogEntity(
            id: row['id'] as int?,
            userId: row['user_id'] as String,
            action: row['action'] as String,
            timestamp: row['timestamp'] as String,
            deviceId: row['device_id'] as String,
            metadata: row['metadata'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> markAsSynced(List<int> ids) async {
    const offset = 1;
    final _sqliteVariablesForIds =
        Iterable<String>.generate(ids.length, (i) => '?${i + offset}')
            .join(',');
    await _queryAdapter.queryNoReturn(
        'UPDATE audit_logs SET is_synced = 1 WHERE id IN (' +
            _sqliteVariablesForIds +
            ')',
        arguments: [...ids]);
  }

  @override
  Future<void> insertLog(AuditLogEntity log) async {
    await _auditLogEntityInsertionAdapter.insert(
        log, OnConflictStrategy.replace);
  }
}

class _$LocalConfigDao extends LocalConfigDao {
  _$LocalConfigDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _localConfigEntityInsertionAdapter = InsertionAdapter(
            database,
            'local_configs',
            (LocalConfigEntity item) => <String, Object?>{
                  'key': item.key,
                  'value': item.value,
                  'description': item.description
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<LocalConfigEntity> _localConfigEntityInsertionAdapter;

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    return _queryAdapter.query('SELECT * FROM local_configs WHERE key = ?1',
        mapper: (Map<String, Object?> row) => LocalConfigEntity(
            key: row['key'] as String,
            value: row['value'] as String,
            description: row['description'] as String?),
        arguments: [key]);
  }

  @override
  Future<void> deleteConfig(String key) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM local_configs WHERE key = ?1',
        arguments: [key]);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    await _localConfigEntityInsertionAdapter.insert(
        config, OnConflictStrategy.replace);
  }
}

class _$InsumoDao extends InsumoDao {
  _$InsumoDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _insumoEntityInsertionAdapter = InsertionAdapter(
            database,
            'insumos',
            (InsumoEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'consumption_uom': item.consumptionUom,
                  'warehouse_id': item.warehouseId,
                  'is_perishable': item.isPerishable ? 1 : 0,
                  'stock': item.stock,
                  'average_cost': item.averageCost,
                  'par_level': item.parLevel,
                  'is_active': item.isActive ? 1 : 0
                }),
        _insumoEntityUpdateAdapter = UpdateAdapter(
            database,
            'insumos',
            ['id'],
            (InsumoEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'consumption_uom': item.consumptionUom,
                  'warehouse_id': item.warehouseId,
                  'is_perishable': item.isPerishable ? 1 : 0,
                  'stock': item.stock,
                  'average_cost': item.averageCost,
                  'par_level': item.parLevel,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<InsumoEntity> _insumoEntityInsertionAdapter;

  final UpdateAdapter<InsumoEntity> _insumoEntityUpdateAdapter;

  @override
  Future<List<InsumoEntity>> findAllActiveInsumos() async {
    return _queryAdapter.queryList('SELECT * FROM insumos WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => InsumoEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            consumptionUom: row['consumption_uom'] as String,
            warehouseId: row['warehouse_id'] as String?,
            isPerishable: (row['is_perishable'] as int) != 0,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            parLevel: row['par_level'] as double?,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<InsumoEntity?> findInsumoById(String id) async {
    return _queryAdapter.query('SELECT * FROM insumos WHERE id = ?1',
        mapper: (Map<String, Object?> row) => InsumoEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            consumptionUom: row['consumption_uom'] as String,
            warehouseId: row['warehouse_id'] as String?,
            isPerishable: (row['is_perishable'] as int) != 0,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            parLevel: row['par_level'] as double?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> updateStock(
    String id,
    double newStock,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE insumos SET stock = ?2 WHERE id = ?1',
        arguments: [id, newStock]);
  }

  @override
  Future<void> insertInsumos(List<InsumoEntity> insumos) async {
    await _insumoEntityInsertionAdapter.insertList(
        insumos, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateInsumo(InsumoEntity insumo) async {
    await _insumoEntityUpdateAdapter.update(insumo, OnConflictStrategy.replace);
  }
}

class _$ProductDao extends ProductDao {
  _$ProductDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _productEntityInsertionAdapter = InsertionAdapter(
            database,
            'products',
            (ProductEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'uom': item.uom,
                  'stock': item.stock,
                  'average_cost': item.averageCost,
                  'sell_price': item.sellPrice,
                  'is_active': item.isActive ? 1 : 0,
                  'sku': item.sku,
                  'barcode': item.barcode
                }),
        _productVariantEntityInsertionAdapter = InsertionAdapter(
            database,
            'product_variants',
            (ProductVariantEntity item) => <String, Object?>{
                  'id': item.id,
                  'product_id': item.productId,
                  'name': item.name,
                  'price_adjustment': item.priceAdjustment
                }),
        _productModifierEntityInsertionAdapter = InsertionAdapter(
            database,
            'product_modifiers',
            (ProductModifierEntity item) => <String, Object?>{
                  'id': item.id,
                  'product_id': item.productId,
                  'name': item.name,
                  'extra_price': item.extraPrice
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<ProductEntity> _productEntityInsertionAdapter;

  final InsertionAdapter<ProductVariantEntity>
      _productVariantEntityInsertionAdapter;

  final InsertionAdapter<ProductModifierEntity>
      _productModifierEntityInsertionAdapter;

  @override
  Future<List<ProductEntity>> findAllActiveProducts() async {
    return _queryAdapter.queryList('SELECT * FROM products WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => ProductEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            uom: row['uom'] as String,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            sellPrice: row['sell_price'] as double,
            isActive: (row['is_active'] as int) != 0,
            sku: row['sku'] as String?,
            barcode: row['barcode'] as String?));
  }

  @override
  Future<ProductEntity?> findProductById(String id) async {
    return _queryAdapter.query('SELECT * FROM products WHERE id = ?1',
        mapper: (Map<String, Object?> row) => ProductEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            uom: row['uom'] as String,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            sellPrice: row['sell_price'] as double,
            isActive: (row['is_active'] as int) != 0,
            sku: row['sku'] as String?,
            barcode: row['barcode'] as String?),
        arguments: [id]);
  }

  @override
  Future<List<ProductVariantEntity>> findVariantsByProductId(
      String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM product_variants WHERE product_id = ?1',
        mapper: (Map<String, Object?> row) => ProductVariantEntity(
            id: row['id'] as String,
            productId: row['product_id'] as String,
            name: row['name'] as String,
            priceAdjustment: row['price_adjustment'] as double),
        arguments: [productId]);
  }

  @override
  Future<List<ProductModifierEntity>> findModifiersByProductId(
      String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM product_modifiers WHERE product_id = ?1',
        mapper: (Map<String, Object?> row) => ProductModifierEntity(
            id: row['id'] as String,
            productId: row['product_id'] as String,
            name: row['name'] as String,
            extraPrice: row['extra_price'] as double),
        arguments: [productId]);
  }

  @override
  Future<ProductEntity?> findBySkuOrBarcode(
    String sku,
    String barcode,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM products WHERE sku = ?1 OR barcode = ?2 LIMIT 1',
        mapper: (Map<String, Object?> row) => ProductEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            uom: row['uom'] as String,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            sellPrice: row['sell_price'] as double,
            isActive: (row['is_active'] as int) != 0,
            sku: row['sku'] as String?,
            barcode: row['barcode'] as String?),
        arguments: [sku, barcode]);
  }

  @override
  Future<void> deleteVariantsByProductId(String productId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM product_variants WHERE product_id = ?1',
        arguments: [productId]);
  }

  @override
  Future<void> deleteModifiersByProductId(String productId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM product_modifiers WHERE product_id = ?1',
        arguments: [productId]);
  }

  @override
  Future<void> insertProducts(List<ProductEntity> products) async {
    await _productEntityInsertionAdapter.insertList(
        products, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertVariants(List<ProductVariantEntity> variants) async {
    await _productVariantEntityInsertionAdapter.insertList(
        variants, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertModifiers(List<ProductModifierEntity> modifiers) async {
    await _productModifierEntityInsertionAdapter.insertList(
        modifiers, OnConflictStrategy.replace);
  }
}

class _$RecipeDao extends RecipeDao {
  _$RecipeDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _recipeEntityInsertionAdapter = InsertionAdapter(
            database,
            'recipes',
            (RecipeEntity item) => <String, Object?>{
                  'id': item.id,
                  'product_id': item.productId,
                  'ingredient_id': item.ingredientId,
                  'ingredient_type': item.ingredientType,
                  'quantity': item.quantity
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<RecipeEntity> _recipeEntityInsertionAdapter;

  @override
  Future<List<RecipeEntity>> findRecipeByProductId(String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM recipes WHERE product_id = ?1',
        mapper: (Map<String, Object?> row) => RecipeEntity(
            id: row['id'] as String,
            productId: row['product_id'] as String,
            ingredientId: row['ingredient_id'] as String,
            ingredientType: row['ingredient_type'] as String,
            quantity: row['quantity'] as double),
        arguments: [productId]);
  }

  @override
  Future<void> deleteRecipeById(String id) async {
    await _queryAdapter
        .queryNoReturn('DELETE FROM recipes WHERE id = ?1', arguments: [id]);
  }

  @override
  Future<void> insertRecipes(List<RecipeEntity> recipes) async {
    await _recipeEntityInsertionAdapter.insertList(
        recipes, OnConflictStrategy.replace);
  }
}

class _$MovementDao extends MovementDao {
  _$MovementDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _movementEntityInsertionAdapter = InsertionAdapter(
            database,
            'inventory_movements',
            (MovementEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'type': item.type,
                  'quantity': item.quantity,
                  'previous_stock': item.previousStock,
                  'new_stock': item.newStock,
                  'timestamp': item.timestamp,
                  'reason': item.reason,
                  'user_id': item.userId,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<MovementEntity> _movementEntityInsertionAdapter;

  @override
  Future<List<MovementEntity>> findAllMovements() async {
    return _queryAdapter.queryList(
        'SELECT * FROM inventory_movements ORDER BY timestamp DESC',
        mapper: (Map<String, Object?> row) => MovementEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            type: row['type'] as String,
            quantity: row['quantity'] as double,
            previousStock: row['previous_stock'] as double,
            newStock: row['new_stock'] as double,
            timestamp: row['timestamp'] as String,
            reason: row['reason'] as String?,
            userId: row['user_id'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<MovementEntity>> findUnsyncedMovements() async {
    return _queryAdapter.queryList(
        'SELECT * FROM inventory_movements WHERE is_synced = 0',
        mapper: (Map<String, Object?> row) => MovementEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            type: row['type'] as String,
            quantity: row['quantity'] as double,
            previousStock: row['previous_stock'] as double,
            newStock: row['new_stock'] as double,
            timestamp: row['timestamp'] as String,
            reason: row['reason'] as String?,
            userId: row['user_id'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE inventory_movements SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.abort);
  }
}

class _$InventoryDao extends InventoryDao {
  _$InventoryDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _movementEntityInsertionAdapter = InsertionAdapter(
            database,
            'inventory_movements',
            (MovementEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'type': item.type,
                  'quantity': item.quantity,
                  'previous_stock': item.previousStock,
                  'new_stock': item.newStock,
                  'timestamp': item.timestamp,
                  'reason': item.reason,
                  'user_id': item.userId,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<MovementEntity> _movementEntityInsertionAdapter;

  @override
  Future<void> updateStock(
    String id,
    double newStock,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE insumos SET stock = ?2 WHERE id = ?1',
        arguments: [id, newStock]);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.abort);
  }

  @override
  Future<void> processInventoryMovements(List<MovementEntity> movements) async {
    if (database is sqflite.Transaction) {
      await super.processInventoryMovements(movements);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.inventoryDao
            .processInventoryMovements(movements);
      });
    }
  }
}

class _$SupplierDao extends SupplierDao {
  _$SupplierDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _supplierEntityInsertionAdapter = InsertionAdapter(
            database,
            'suppliers',
            (SupplierEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'phone': item.phone,
                  'contact_person': item.contactPerson,
                  'credit_terms': item.creditTerms,
                  'is_active': item.isActive ? 1 : 0
                }),
        _supplierEntityUpdateAdapter = UpdateAdapter(
            database,
            'suppliers',
            ['id'],
            (SupplierEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'phone': item.phone,
                  'contact_person': item.contactPerson,
                  'credit_terms': item.creditTerms,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<SupplierEntity> _supplierEntityInsertionAdapter;

  final UpdateAdapter<SupplierEntity> _supplierEntityUpdateAdapter;

  @override
  Future<List<SupplierEntity>> findAllActiveSuppliers() async {
    return _queryAdapter.queryList(
        'SELECT * FROM suppliers WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => SupplierEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            phone: row['phone'] as String?,
            contactPerson: row['contact_person'] as String?,
            creditTerms: row['credit_terms'] as String?,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<SupplierEntity?> findSupplierById(String id) async {
    return _queryAdapter.query('SELECT * FROM suppliers WHERE id = ?1',
        mapper: (Map<String, Object?> row) => SupplierEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            phone: row['phone'] as String?,
            contactPerson: row['contact_person'] as String?,
            creditTerms: row['credit_terms'] as String?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> insertSuppliers(List<SupplierEntity> suppliers) async {
    await _supplierEntityInsertionAdapter.insertList(
        suppliers, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateSupplier(SupplierEntity supplier) async {
    await _supplierEntityUpdateAdapter.update(
        supplier, OnConflictStrategy.replace);
  }
}

class _$WarehouseDao extends WarehouseDao {
  _$WarehouseDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _warehouseEntityInsertionAdapter = InsertionAdapter(
            database,
            'warehouses',
            (WarehouseEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'description': item.description,
                  'is_active': item.isActive ? 1 : 0
                }),
        _warehouseEntityUpdateAdapter = UpdateAdapter(
            database,
            'warehouses',
            ['id'],
            (WarehouseEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'description': item.description,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<WarehouseEntity> _warehouseEntityInsertionAdapter;

  final UpdateAdapter<WarehouseEntity> _warehouseEntityUpdateAdapter;

  @override
  Future<List<WarehouseEntity>> findAllActiveWarehouses() async {
    return _queryAdapter.queryList(
        'SELECT * FROM warehouses WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => WarehouseEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            description: row['description'] as String?,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<WarehouseEntity?> findWarehouseById(String id) async {
    return _queryAdapter.query('SELECT * FROM warehouses WHERE id = ?1',
        mapper: (Map<String, Object?> row) => WarehouseEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            description: row['description'] as String?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> insertWarehouses(List<WarehouseEntity> warehouses) async {
    await _warehouseEntityInsertionAdapter.insertList(
        warehouses, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateWarehouse(WarehouseEntity warehouse) async {
    await _warehouseEntityUpdateAdapter.update(
        warehouse, OnConflictStrategy.replace);
  }
}

class _$PurchaseDao extends PurchaseDao {
  _$PurchaseDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _purchaseEntityInsertionAdapter = InsertionAdapter(
            database,
            'purchases',
            (PurchaseEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'supplier_id': item.supplierId,
                  'quantity': item.quantity,
                  'unit_cost': item.unitCost,
                  'timestamp': item.timestamp,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<PurchaseEntity> _purchaseEntityInsertionAdapter;

  @override
  Future<List<PurchaseEntity>> findUnsyncedPurchases() async {
    return _queryAdapter.queryList(
        'SELECT * FROM purchases WHERE is_synced = 0',
        mapper: (Map<String, Object?> row) => PurchaseEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            supplierId: row['supplier_id'] as String,
            quantity: row['quantity'] as double,
            unitCost: row['unit_cost'] as double,
            timestamp: row['timestamp'] as String,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE purchases SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertPurchase(PurchaseEntity purchase) async {
    await _purchaseEntityInsertionAdapter.insert(
        purchase, OnConflictStrategy.abort);
  }
}

class _$UomConversionDao extends UomConversionDao {
  _$UomConversionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _uomConversionEntityInsertionAdapter = InsertionAdapter(
            database,
            'uom_conversions',
            (UomConversionEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'unit_name': item.unitName,
                  'factor': item.factor,
                  'is_default': item.isDefault ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<UomConversionEntity>
      _uomConversionEntityInsertionAdapter;

  @override
  Future<List<UomConversionEntity>> findConversionsByInsumoId(
      String insumoId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM uom_conversions WHERE insumo_id = ?1',
        mapper: (Map<String, Object?> row) => UomConversionEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            unitName: row['unit_name'] as String,
            factor: row['factor'] as double,
            isDefault: (row['is_default'] as int) != 0),
        arguments: [insumoId]);
  }

  @override
  Future<void> insertConversions(List<UomConversionEntity> conversions) async {
    await _uomConversionEntityInsertionAdapter.insertList(
        conversions, OnConflictStrategy.replace);
  }
}

class _$BatchDao extends BatchDao {
  _$BatchDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _batchEntityInsertionAdapter = InsertionAdapter(
            database,
            'batches',
            (BatchEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'batch_number': item.batchNumber,
                  'expiration_date': item.expirationDate,
                  'remaining_stock': item.remainingStock,
                  'cost': item.cost,
                  'is_synced': item.isSynced ? 1 : 0
                }),
        _batchEntityUpdateAdapter = UpdateAdapter(
            database,
            'batches',
            ['id'],
            (BatchEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'batch_number': item.batchNumber,
                  'expiration_date': item.expirationDate,
                  'remaining_stock': item.remainingStock,
                  'cost': item.cost,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<BatchEntity> _batchEntityInsertionAdapter;

  final UpdateAdapter<BatchEntity> _batchEntityUpdateAdapter;

  @override
  Future<List<BatchEntity>> findActiveBatchesByInsumoId(String insumoId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM batches WHERE insumo_id = ?1 AND remaining_stock > 0 ORDER BY expiration_date ASC',
        mapper: (Map<String, Object?> row) => BatchEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, batchNumber: row['batch_number'] as String, expirationDate: row['expiration_date'] as String, remainingStock: row['remaining_stock'] as double, cost: row['cost'] as double, isSynced: (row['is_synced'] as int) != 0),
        arguments: [insumoId]);
  }

  @override
  Future<void> insertBatch(BatchEntity batch) async {
    await _batchEntityInsertionAdapter.insert(
        batch, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateBatch(BatchEntity batch) async {
    await _batchEntityUpdateAdapter.update(batch, OnConflictStrategy.replace);
  }
}

class _$InvoiceDao extends InvoiceDao {
  _$InvoiceDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _invoiceEntityInsertionAdapter = InsertionAdapter(
            database,
            'invoices',
            (InvoiceEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_number': item.number,
                  'created_at': item.createdAt,
                  'user_id': item.userId,
                  'subtotal': item.subtotal,
                  'total_tax': item.totalTax,
                  'total': item.total,
                  'is_canceled': item.isCanceled ? 1 : 0,
                  'void_reason': item.voidReason,
                  'sync_status': item.syncStatus,
                  'payment_status': item.paymentStatus,
                  'customer_id': item.customerId,
                  'global_tax_override': item.globalTaxOverride ? 1 : 0,
                  'type': item.type,
                  'related_invoice_id': item.relatedInvoiceId
                }),
        _invoiceEntityUpdateAdapter = UpdateAdapter(
            database,
            'invoices',
            ['id'],
            (InvoiceEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_number': item.number,
                  'created_at': item.createdAt,
                  'user_id': item.userId,
                  'subtotal': item.subtotal,
                  'total_tax': item.totalTax,
                  'total': item.total,
                  'is_canceled': item.isCanceled ? 1 : 0,
                  'void_reason': item.voidReason,
                  'sync_status': item.syncStatus,
                  'payment_status': item.paymentStatus,
                  'customer_id': item.customerId,
                  'global_tax_override': item.globalTaxOverride ? 1 : 0,
                  'type': item.type,
                  'related_invoice_id': item.relatedInvoiceId
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<InvoiceEntity> _invoiceEntityInsertionAdapter;

  final UpdateAdapter<InvoiceEntity> _invoiceEntityUpdateAdapter;

  @override
  Future<InvoiceEntity?> getInvoiceById(String id) async {
    return _queryAdapter.query('SELECT * FROM invoices WHERE id = ?1',
        mapper: (Map<String, Object?> row) => InvoiceEntity(
            id: row['id'] as String,
            number: row['invoice_number'] as String,
            createdAt: row['created_at'] as int,
            userId: row['user_id'] as String,
            subtotal: row['subtotal'] as double,
            totalTax: row['total_tax'] as double,
            total: row['total'] as double,
            isCanceled: (row['is_canceled'] as int) != 0,
            voidReason: row['void_reason'] as String?,
            syncStatus: row['sync_status'] as String,
            paymentStatus: row['payment_status'] as String,
            customerId: row['customer_id'] as String?,
            globalTaxOverride: (row['global_tax_override'] as int) != 0,
            type: row['type'] as String,
            relatedInvoiceId: row['related_invoice_id'] as String?),
        arguments: [id]);
  }

  @override
  Future<InvoiceEntity?> getInvoiceByNumber(String number) async {
    return _queryAdapter.query(
        'SELECT * FROM invoices WHERE invoice_number = ?1',
        mapper: (Map<String, Object?> row) => InvoiceEntity(
            id: row['id'] as String,
            number: row['invoice_number'] as String,
            createdAt: row['created_at'] as int,
            userId: row['user_id'] as String,
            subtotal: row['subtotal'] as double,
            totalTax: row['total_tax'] as double,
            total: row['total'] as double,
            isCanceled: (row['is_canceled'] as int) != 0,
            voidReason: row['void_reason'] as String?,
            syncStatus: row['sync_status'] as String,
            paymentStatus: row['payment_status'] as String,
            customerId: row['customer_id'] as String?,
            globalTaxOverride: (row['global_tax_override'] as int) != 0,
            type: row['type'] as String,
            relatedInvoiceId: row['related_invoice_id'] as String?),
        arguments: [number]);
  }

  @override
  Future<List<InvoiceEntity>> getAllInvoices() async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoices ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => InvoiceEntity(
            id: row['id'] as String,
            number: row['invoice_number'] as String,
            createdAt: row['created_at'] as int,
            userId: row['user_id'] as String,
            subtotal: row['subtotal'] as double,
            totalTax: row['total_tax'] as double,
            total: row['total'] as double,
            isCanceled: (row['is_canceled'] as int) != 0,
            voidReason: row['void_reason'] as String?,
            syncStatus: row['sync_status'] as String,
            paymentStatus: row['payment_status'] as String,
            customerId: row['customer_id'] as String?,
            globalTaxOverride: (row['global_tax_override'] as int) != 0,
            type: row['type'] as String,
            relatedInvoiceId: row['related_invoice_id'] as String?));
  }

  @override
  Future<List<InvoiceEntity>> getInvoicesBySyncStatus(String status) async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoices WHERE sync_status = ?1',
        mapper: (Map<String, Object?> row) => InvoiceEntity(
            id: row['id'] as String,
            number: row['invoice_number'] as String,
            createdAt: row['created_at'] as int,
            userId: row['user_id'] as String,
            subtotal: row['subtotal'] as double,
            totalTax: row['total_tax'] as double,
            total: row['total'] as double,
            isCanceled: (row['is_canceled'] as int) != 0,
            voidReason: row['void_reason'] as String?,
            syncStatus: row['sync_status'] as String,
            paymentStatus: row['payment_status'] as String,
            customerId: row['customer_id'] as String?,
            globalTaxOverride: (row['global_tax_override'] as int) != 0,
            type: row['type'] as String,
            relatedInvoiceId: row['related_invoice_id'] as String?),
        arguments: [status]);
  }

  @override
  Future<List<InvoiceEntity>> getInvoicesByTimeRange(
    int startTime,
    int endTime,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoices WHERE created_at >= ?1 AND created_at <= ?2',
        mapper: (Map<String, Object?> row) => InvoiceEntity(
            id: row['id'] as String,
            number: row['invoice_number'] as String,
            createdAt: row['created_at'] as int,
            userId: row['user_id'] as String,
            subtotal: row['subtotal'] as double,
            totalTax: row['total_tax'] as double,
            total: row['total'] as double,
            isCanceled: (row['is_canceled'] as int) != 0,
            voidReason: row['void_reason'] as String?,
            syncStatus: row['sync_status'] as String,
            paymentStatus: row['payment_status'] as String,
            customerId: row['customer_id'] as String?,
            globalTaxOverride: (row['global_tax_override'] as int) != 0,
            type: row['type'] as String,
            relatedInvoiceId: row['related_invoice_id'] as String?),
        arguments: [startTime, endTime]);
  }

  @override
  Future<String?> getLastInvoiceNumber() async {
    return _queryAdapter.query('SELECT MAX(invoice_number) FROM invoices',
        mapper: (Map<String, Object?> row) => row.values.first as String);
  }

  @override
  Future<void> insertInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityInsertionAdapter.insert(
        invoice, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityUpdateAdapter.update(
        invoice, OnConflictStrategy.replace);
  }
}

class _$InvoiceItemDao extends InvoiceItemDao {
  _$InvoiceItemDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _invoiceItemEntityInsertionAdapter = InsertionAdapter(
            database,
            'invoice_items',
            (InvoiceItemEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_id': item.invoiceId,
                  'product_id': item.productId,
                  'product_name': item.productName,
                  'quantity': item.quantity,
                  'unit_price': item.unitPrice,
                  'original_tax_rate': item.originalTaxRate,
                  'applied_tax_rate': item.appliedTaxRate,
                  'tax_amount': item.taxAmount,
                  'total': item.total,
                  'discount': item.discount,
                  'variant_id': item.variantId,
                  'notes': item.notes
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<InvoiceItemEntity> _invoiceItemEntityInsertionAdapter;

  @override
  Future<List<InvoiceItemEntity>> getItemsByInvoiceId(String invoiceId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoice_items WHERE invoice_id = ?1',
        mapper: (Map<String, Object?> row) => InvoiceItemEntity(
            id: row['id'] as String,
            invoiceId: row['invoice_id'] as String,
            productId: row['product_id'] as String,
            productName: row['product_name'] as String,
            quantity: row['quantity'] as double,
            unitPrice: row['unit_price'] as double,
            originalTaxRate: row['original_tax_rate'] as double,
            appliedTaxRate: row['applied_tax_rate'] as double,
            taxAmount: row['tax_amount'] as double,
            total: row['total'] as double,
            discount: row['discount'] as double,
            variantId: row['variant_id'] as String?,
            notes: row['notes'] as String?),
        arguments: [invoiceId]);
  }

  @override
  Future<void> insertItems(List<InvoiceItemEntity> items) async {
    await _invoiceItemEntityInsertionAdapter.insertList(
        items, OnConflictStrategy.replace);
  }
}

class _$PaymentDao extends PaymentDao {
  _$PaymentDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _paymentEntityInsertionAdapter = InsertionAdapter(
            database,
            'payments',
            (PaymentEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_id': item.invoiceId,
                  'method': item.method,
                  'amount': item.amount,
                  'currency': item.currency,
                  'exchange_rate': item.exchangeRate,
                  'created_at': item.createdAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<PaymentEntity> _paymentEntityInsertionAdapter;

  @override
  Future<List<PaymentEntity>> getPaymentsByInvoiceId(String invoiceId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM payments WHERE invoice_id = ?1',
        mapper: (Map<String, Object?> row) => PaymentEntity(
            id: row['id'] as String,
            invoiceId: row['invoice_id'] as String,
            method: row['method'] as String,
            amount: row['amount'] as double,
            currency: row['currency'] as String,
            exchangeRate: row['exchange_rate'] as double,
            createdAt: row['created_at'] as int?),
        arguments: [invoiceId]);
  }

  @override
  Future<List<PaymentEntity>> getPaymentsByTimeRange(
    int startTime,
    int endTime,
  ) async {
    return _queryAdapter.queryList(
        'SELECT p.* FROM payments p INNER JOIN invoices i ON p.invoice_id = i.id WHERE i.created_at >= ?1 AND i.created_at <= ?2',
        mapper: (Map<String, Object?> row) => PaymentEntity(id: row['id'] as String, invoiceId: row['invoice_id'] as String, method: row['method'] as String, amount: row['amount'] as double, currency: row['currency'] as String, exchangeRate: row['exchange_rate'] as double, createdAt: row['created_at'] as int?),
        arguments: [startTime, endTime]);
  }

  @override
  Future<void> insertPayments(List<PaymentEntity> payments) async {
    await _paymentEntityInsertionAdapter.insertList(
        payments, OnConflictStrategy.replace);
  }
}

class _$TaxConfigDao extends TaxConfigDao {
  _$TaxConfigDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _taxConfigEntityInsertionAdapter = InsertionAdapter(
            database,
            'tax_configurations',
            (TaxConfigEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'rate': item.rate,
                  'is_active': item.isActive ? 1 : 0,
                  'is_default': item.isDefault ? 1 : 0
                }),
        _taxConfigEntityUpdateAdapter = UpdateAdapter(
            database,
            'tax_configurations',
            ['id'],
            (TaxConfigEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'rate': item.rate,
                  'is_active': item.isActive ? 1 : 0,
                  'is_default': item.isDefault ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<TaxConfigEntity> _taxConfigEntityInsertionAdapter;

  final UpdateAdapter<TaxConfigEntity> _taxConfigEntityUpdateAdapter;

  @override
  Future<List<TaxConfigEntity>> getAllTaxConfigs() async {
    return _queryAdapter.queryList('SELECT * FROM tax_configurations',
        mapper: (Map<String, Object?> row) => TaxConfigEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            rate: row['rate'] as double,
            isActive: (row['is_active'] as int) != 0,
            isDefault: (row['is_default'] as int) != 0));
  }

  @override
  Future<List<TaxConfigEntity>> getActiveTaxConfigs() async {
    return _queryAdapter.queryList(
        'SELECT * FROM tax_configurations WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => TaxConfigEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            rate: row['rate'] as double,
            isActive: (row['is_active'] as int) != 0,
            isDefault: (row['is_default'] as int) != 0));
  }

  @override
  Future<void> insertTaxConfig(TaxConfigEntity config) async {
    await _taxConfigEntityInsertionAdapter.insert(
        config, OnConflictStrategy.abort);
  }

  @override
  Future<void> updateTaxConfig(TaxConfigEntity config) async {
    await _taxConfigEntityUpdateAdapter.update(
        config, OnConflictStrategy.abort);
  }
}

class _$SalesTransactionDao extends SalesTransactionDao {
  _$SalesTransactionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _invoiceEntityInsertionAdapter = InsertionAdapter(
            database,
            'invoices',
            (InvoiceEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_number': item.number,
                  'created_at': item.createdAt,
                  'user_id': item.userId,
                  'subtotal': item.subtotal,
                  'total_tax': item.totalTax,
                  'total': item.total,
                  'is_canceled': item.isCanceled ? 1 : 0,
                  'void_reason': item.voidReason,
                  'sync_status': item.syncStatus,
                  'payment_status': item.paymentStatus,
                  'customer_id': item.customerId,
                  'global_tax_override': item.globalTaxOverride ? 1 : 0,
                  'type': item.type,
                  'related_invoice_id': item.relatedInvoiceId
                }),
        _invoiceItemEntityInsertionAdapter = InsertionAdapter(
            database,
            'invoice_items',
            (InvoiceItemEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_id': item.invoiceId,
                  'product_id': item.productId,
                  'product_name': item.productName,
                  'quantity': item.quantity,
                  'unit_price': item.unitPrice,
                  'original_tax_rate': item.originalTaxRate,
                  'applied_tax_rate': item.appliedTaxRate,
                  'tax_amount': item.taxAmount,
                  'total': item.total,
                  'discount': item.discount,
                  'variant_id': item.variantId,
                  'notes': item.notes
                }),
        _invoiceItemModifierEntityInsertionAdapter = InsertionAdapter(
            database,
            'invoice_item_modifiers',
            (InvoiceItemModifierEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_item_id': item.invoiceItemId,
                  'name': item.name,
                  'extra_price': item.extraPrice
                }),
        _paymentEntityInsertionAdapter = InsertionAdapter(
            database,
            'payments',
            (PaymentEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_id': item.invoiceId,
                  'method': item.method,
                  'amount': item.amount,
                  'currency': item.currency,
                  'exchange_rate': item.exchangeRate,
                  'created_at': item.createdAt
                }),
        _movementEntityInsertionAdapter = InsertionAdapter(
            database,
            'inventory_movements',
            (MovementEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'type': item.type,
                  'quantity': item.quantity,
                  'previous_stock': item.previousStock,
                  'new_stock': item.newStock,
                  'timestamp': item.timestamp,
                  'reason': item.reason,
                  'user_id': item.userId,
                  'is_synced': item.isSynced ? 1 : 0
                }),
        _insumoEntityUpdateAdapter = UpdateAdapter(
            database,
            'insumos',
            ['id'],
            (InsumoEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'consumption_uom': item.consumptionUom,
                  'warehouse_id': item.warehouseId,
                  'is_perishable': item.isPerishable ? 1 : 0,
                  'stock': item.stock,
                  'average_cost': item.averageCost,
                  'par_level': item.parLevel,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<InvoiceEntity> _invoiceEntityInsertionAdapter;

  final InsertionAdapter<InvoiceItemEntity> _invoiceItemEntityInsertionAdapter;

  final InsertionAdapter<InvoiceItemModifierEntity>
      _invoiceItemModifierEntityInsertionAdapter;

  final InsertionAdapter<PaymentEntity> _paymentEntityInsertionAdapter;

  final InsertionAdapter<MovementEntity> _movementEntityInsertionAdapter;

  final UpdateAdapter<InsumoEntity> _insumoEntityUpdateAdapter;

  @override
  Future<InsumoEntity?> getInsumoById(String id) async {
    return _queryAdapter.query('SELECT * FROM insumos WHERE id = ?1',
        mapper: (Map<String, Object?> row) => InsumoEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            consumptionUom: row['consumption_uom'] as String,
            warehouseId: row['warehouse_id'] as String?,
            isPerishable: (row['is_perishable'] as int) != 0,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            parLevel: row['par_level'] as double?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> insertInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityInsertionAdapter.insert(
        invoice, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertInvoiceItems(List<InvoiceItemEntity> items) async {
    await _invoiceItemEntityInsertionAdapter.insertList(
        items, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertInvoiceItemModifiers(
      List<InvoiceItemModifierEntity> modifiers) async {
    await _invoiceItemModifierEntityInsertionAdapter.insertList(
        modifiers, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertPayments(List<PaymentEntity> payments) async {
    await _paymentEntityInsertionAdapter.insertList(
        payments, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateInsumo(InsumoEntity insumo) async {
    await _insumoEntityUpdateAdapter.update(insumo, OnConflictStrategy.replace);
  }

  @override
  Future<void> executeSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
  ) async {
    if (database is sqflite.Transaction) {
      await super.executeSaleTransaction(
          invoice, items, modifiers, payments, movements);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.salesTransactionDao.executeSaleTransaction(
            invoice, items, modifiers, payments, movements);
      });
    }
  }
}

class _$CashierSessionDao extends CashierSessionDao {
  _$CashierSessionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _cashierSessionEntityInsertionAdapter = InsertionAdapter(
            database,
            'cashier_sessions',
            (CashierSessionEntity item) => <String, Object?>{
                  'id': item.id,
                  'user_id': item.userId,
                  'opened_at': item.openedAt,
                  'closed_at': item.closedAt,
                  'opening_balance': item.openingBalance,
                  'closing_balance': item.closingBalance,
                  'total_sales': item.totalSales,
                  'total_expected': item.totalExpected,
                  'is_closed': item.isClosed ? 1 : 0
                }),
        _cashierSessionEntityUpdateAdapter = UpdateAdapter(
            database,
            'cashier_sessions',
            ['id'],
            (CashierSessionEntity item) => <String, Object?>{
                  'id': item.id,
                  'user_id': item.userId,
                  'opened_at': item.openedAt,
                  'closed_at': item.closedAt,
                  'opening_balance': item.openingBalance,
                  'closing_balance': item.closingBalance,
                  'total_sales': item.totalSales,
                  'total_expected': item.totalExpected,
                  'is_closed': item.isClosed ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CashierSessionEntity>
      _cashierSessionEntityInsertionAdapter;

  final UpdateAdapter<CashierSessionEntity> _cashierSessionEntityUpdateAdapter;

  @override
  Future<CashierSessionEntity?> getSessionById(String id) async {
    return _queryAdapter.query('SELECT * FROM cashier_sessions WHERE id = ?1',
        mapper: (Map<String, Object?> row) => CashierSessionEntity(
            id: row['id'] as String,
            userId: row['user_id'] as String,
            openedAt: row['opened_at'] as int,
            closedAt: row['closed_at'] as int?,
            openingBalance: row['opening_balance'] as double,
            closingBalance: row['closing_balance'] as double?,
            totalSales: row['total_sales'] as double?,
            totalExpected: row['total_expected'] as double?,
            isClosed: (row['is_closed'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<CashierSessionEntity?> getActiveSession() async {
    return _queryAdapter.query(
        'SELECT * FROM cashier_sessions WHERE is_closed = 0 LIMIT 1',
        mapper: (Map<String, Object?> row) => CashierSessionEntity(
            id: row['id'] as String,
            userId: row['user_id'] as String,
            openedAt: row['opened_at'] as int,
            closedAt: row['closed_at'] as int?,
            openingBalance: row['opening_balance'] as double,
            closingBalance: row['closing_balance'] as double?,
            totalSales: row['total_sales'] as double?,
            totalExpected: row['total_expected'] as double?,
            isClosed: (row['is_closed'] as int) != 0));
  }

  @override
  Future<List<CashierSessionEntity>> getAllSessions() async {
    return _queryAdapter.queryList(
        'SELECT * FROM cashier_sessions ORDER BY opened_at DESC',
        mapper: (Map<String, Object?> row) => CashierSessionEntity(
            id: row['id'] as String,
            userId: row['user_id'] as String,
            openedAt: row['opened_at'] as int,
            closedAt: row['closed_at'] as int?,
            openingBalance: row['opening_balance'] as double,
            closingBalance: row['closing_balance'] as double?,
            totalSales: row['total_sales'] as double?,
            totalExpected: row['total_expected'] as double?,
            isClosed: (row['is_closed'] as int) != 0));
  }

  @override
  Future<void> insertSession(CashierSessionEntity session) async {
    await _cashierSessionEntityInsertionAdapter.insert(
        session, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateSession(CashierSessionEntity session) async {
    await _cashierSessionEntityUpdateAdapter.update(
        session, OnConflictStrategy.replace);
  }
}

class _$HoldTicketDao extends HoldTicketDao {
  _$HoldTicketDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _holdTicketEntityInsertionAdapter = InsertionAdapter(
            database,
            'hold_tickets',
            (HoldTicketEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'created_at': item.createdAt,
                  'global_tax_exempt': item.isGlobalTaxExempt ? 1 : 0
                }),
        _holdTicketItemEntityInsertionAdapter = InsertionAdapter(
            database,
            'hold_ticket_items',
            (HoldTicketItemEntity item) => <String, Object?>{
                  'id': item.id,
                  'hold_ticket_id': item.holdTicketId,
                  'product_id': item.productId,
                  'product_name': item.productName,
                  'quantity': item.quantity,
                  'unit_price': item.unitPrice,
                  'tax_rate': item.taxRate
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<HoldTicketEntity> _holdTicketEntityInsertionAdapter;

  final InsertionAdapter<HoldTicketItemEntity>
      _holdTicketItemEntityInsertionAdapter;

  @override
  Future<List<HoldTicketEntity>> getAllHoldTickets() async {
    return _queryAdapter.queryList(
        'SELECT * FROM hold_tickets ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => HoldTicketEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            createdAt: row['created_at'] as int,
            isGlobalTaxExempt: (row['global_tax_exempt'] as int) != 0));
  }

  @override
  Future<List<HoldTicketItemEntity>> getItemsByHoldTicketId(
      String holdTicketId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM hold_ticket_items WHERE hold_ticket_id = ?1',
        mapper: (Map<String, Object?> row) => HoldTicketItemEntity(
            id: row['id'] as String,
            holdTicketId: row['hold_ticket_id'] as String,
            productId: row['product_id'] as String,
            productName: row['product_name'] as String,
            quantity: row['quantity'] as double,
            unitPrice: row['unit_price'] as double,
            taxRate: row['tax_rate'] as double),
        arguments: [holdTicketId]);
  }

  @override
  Future<void> deleteHoldTicket(String id) async {
    await _queryAdapter.queryNoReturn('DELETE FROM hold_tickets WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertHoldTicket(HoldTicketEntity ticket) async {
    await _holdTicketEntityInsertionAdapter.insert(
        ticket, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertHoldTicketItems(List<HoldTicketItemEntity> items) async {
    await _holdTicketItemEntityInsertionAdapter.insertList(
        items, OnConflictStrategy.replace);
  }

  @override
  Future<void> saveHoldTicket(
    HoldTicketEntity ticket,
    List<HoldTicketItemEntity> items,
  ) async {
    if (database is sqflite.Transaction) {
      await super.saveHoldTicket(ticket, items);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.holdTicketDao.saveHoldTicket(ticket, items);
      });
    }
  }
}

class _$PromotionDao extends PromotionDao {
  _$PromotionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _promotionEntityInsertionAdapter = InsertionAdapter(
            database,
            'promotions',
            (PromotionEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'type': item.type,
                  'target_product_id': item.targetProductId,
                  'buy_quantity': item.buyQuantity,
                  'get_quantity': item.getQuantity,
                  'discount_value': item.discountValue,
                  'is_active': item.isActive ? 1 : 0
                }),
        _promotionEntityUpdateAdapter = UpdateAdapter(
            database,
            'promotions',
            ['id'],
            (PromotionEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'type': item.type,
                  'target_product_id': item.targetProductId,
                  'buy_quantity': item.buyQuantity,
                  'get_quantity': item.getQuantity,
                  'discount_value': item.discountValue,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<PromotionEntity> _promotionEntityInsertionAdapter;

  final UpdateAdapter<PromotionEntity> _promotionEntityUpdateAdapter;

  @override
  Future<List<PromotionEntity>> getActivePromotions() async {
    return _queryAdapter.queryList(
        'SELECT * FROM promotions WHERE is_active = 1',
        mapper: (Map<String, Object?> row) => PromotionEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            type: row['type'] as String,
            targetProductId: row['target_product_id'] as String,
            buyQuantity: row['buy_quantity'] as int,
            getQuantity: row['get_quantity'] as int,
            discountValue: row['discount_value'] as double,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<List<PromotionEntity>> getPromotionsByProduct(String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM promotions WHERE target_product_id = ?1 AND is_active = 1',
        mapper: (Map<String, Object?> row) => PromotionEntity(id: row['id'] as String, name: row['name'] as String, type: row['type'] as String, targetProductId: row['target_product_id'] as String, buyQuantity: row['buy_quantity'] as int, getQuantity: row['get_quantity'] as int, discountValue: row['discount_value'] as double, isActive: (row['is_active'] as int) != 0),
        arguments: [productId]);
  }

  @override
  Future<void> savePromotion(PromotionEntity promotion) async {
    await _promotionEntityInsertionAdapter.insert(
        promotion, OnConflictStrategy.replace);
  }

  @override
  Future<void> updatePromotion(PromotionEntity promotion) async {
    await _promotionEntityUpdateAdapter.update(
        promotion, OnConflictStrategy.replace);
  }
}
