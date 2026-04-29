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

  Future<sqflite.Database> open(
    String path,
    List<Migration> migrations, [
    Callback? callback,
  ]) async {
    final databaseOptions = sqflite.OpenDatabaseOptions(
      version: 1,
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
