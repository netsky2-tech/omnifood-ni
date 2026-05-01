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

  InsumoDao? _insumoDaoInstance;

  ProductDao? _productDaoInstance;

  RecipeDao? _recipeDaoInstance;

  MovementDao? _movementDaoInstance;

  SupplierDao? _supplierDaoInstance;

  WarehouseDao? _warehouseDaoInstance;

  PurchaseDao? _purchaseDaoInstance;

  UomConversionDao? _uomConversionDaoInstance;

  BatchDao? _batchDaoInstance;

  Future<sqflite.Database> open(
    String path,
    List<Migration> migrations, [
    Callback? callback,
  ]) async {
    final databaseOptions = sqflite.OpenDatabaseOptions(
      version: 5,
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
            'CREATE TABLE IF NOT EXISTS `insumos` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `consumption_uom` TEXT NOT NULL, `warehouse_id` TEXT, `is_perishable` INTEGER NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `par_level` REAL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `products` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `uom` TEXT NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `sell_price` REAL NOT NULL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
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
    return _queryAdapter.queryList('SELECT * FROM audit_logs',
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
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<ProductEntity> _productEntityInsertionAdapter;

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
            isActive: (row['is_active'] as int) != 0));
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
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> insertProducts(List<ProductEntity> products) async {
    await _productEntityInsertionAdapter.insertList(
        products, OnConflictStrategy.replace);
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
