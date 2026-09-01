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

  SecurityProfileDao? _securityProfileDaoInstance;

  AuditDao? _auditDaoInstance;

  LocalConfigDao? _localConfigDaoInstance;

  InsumoDao? _insumoDaoInstance;

  ProductDao? _productDaoInstance;

  RecipeDao? _recipeDaoInstance;

  RecipeVersionDocumentDao? _recipeVersionDocumentDaoInstance;

  CountSessionDao? _countSessionDaoInstance;

  CountLineDao? _countLineDaoInstance;

  ForensicAlertDao? _forensicAlertDaoInstance;

  MovementDao? _movementDaoInstance;

  MovementSyncStateDao? _movementSyncStateDaoInstance;

  KardexRecalculateQueueDao? _kardexRecalculateQueueDaoInstance;

  KardexCorrectionDao? _kardexCorrectionDaoInstance;

  InventoryDao? _inventoryDaoInstance;

  SupplierDao? _supplierDaoInstance;

  WarehouseDao? _warehouseDaoInstance;

  PurchaseDao? _purchaseDaoInstance;

  ProductionOrderDocumentDao? _productionOrderDocumentDaoInstance;

  ProductionTransactionDao? _productionTransactionDaoInstance;

  UomConversionDao? _uomConversionDaoInstance;

  BatchDao? _batchDaoInstance;

  CatalogValueDao? _catalogValueDaoInstance;

  InvoiceDao? _invoiceDaoInstance;

  InvoiceItemDao? _invoiceItemDaoInstance;

  PaymentDao? _paymentDaoInstance;

  TaxConfigDao? _taxConfigDaoInstance;

  SalesTransactionDao? _salesTransactionDaoInstance;

  CashierSessionDao? _cashierSessionDaoInstance;

  CashMovementDao? _cashMovementDaoInstance;

  HoldTicketDao? _holdTicketDaoInstance;

  PromotionDao? _promotionDaoInstance;

  RestaurantAreaDao? _restaurantAreaDaoInstance;

  RestaurantTableDao? _restaurantTableDaoInstance;

  KitchenOrderDao? _kitchenOrderDaoInstance;

  CustomerDao? _customerDaoInstance;

  CustomerPointTransactionDao? _customerPointTransactionDaoInstance;

  FulfillmentTopologyDao? _fulfillmentTopologyDaoInstance;

  FulfillmentPersistenceDao? _fulfillmentPersistenceDaoInstance;

  Future<sqflite.Database> open(
    String path,
    List<Migration> migrations, [
    Callback? callback,
  ]) async {
    final databaseOptions = sqflite.OpenDatabaseOptions(
      version: 43,
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
            'CREATE TABLE IF NOT EXISTS `security_profiles` (`user_id` TEXT NOT NULL, `pin_hash` TEXT, `totp_secret_seed` TEXT, `is_totp_enabled` INTEGER NOT NULL, `is_pin_enabled` INTEGER NOT NULL, PRIMARY KEY (`user_id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `audit_logs` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` TEXT NOT NULL, `action` TEXT NOT NULL, `timestamp` TEXT NOT NULL, `device_id` TEXT NOT NULL, `metadata` TEXT, `is_synced` INTEGER NOT NULL, `sequence_no` INTEGER NOT NULL, `prev_hash` TEXT NOT NULL, `entry_hash` TEXT NOT NULL, `metodo_autorizacion` TEXT, `usuario_autorizador_id` TEXT, `remote_ref_uuid` TEXT NOT NULL, `hash_version` TEXT, `has_metodo_autorizacion` INTEGER, `has_usuario_autorizador_id` INTEGER, `tenant_id` TEXT, `metadata_raw` TEXT)');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `local_configs` (`key` TEXT NOT NULL, `value` TEXT NOT NULL, `description` TEXT, PRIMARY KEY (`key`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `insumos` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `consumption_uom` TEXT NOT NULL, `warehouse_id` TEXT, `is_perishable` INTEGER NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `par_level` REAL, `stock_min` REAL, `stock_max` REAL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `products` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `uom` TEXT NOT NULL, `stock` REAL NOT NULL, `average_cost` REAL NOT NULL, `sell_price` REAL NOT NULL, `is_active` INTEGER NOT NULL, `sku` TEXT, `barcode` TEXT, `category` TEXT, `is_prepared` INTEGER NOT NULL, `created_at` TEXT, `inventory_policy` TEXT, `direct_stock_insumo_id` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `product_variants` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `name` TEXT NOT NULL, `price_adjustment` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `product_modifiers` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `name` TEXT NOT NULL, `extra_price` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `recipes` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `ingredient_id` TEXT NOT NULL, `ingredient_type` TEXT NOT NULL, `quantity` REAL NOT NULL, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `recipe_version_documents` (`id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `version_number` INTEGER NOT NULL, `yield_quantity` REAL NOT NULL, `technical_shrink_pct` REAL NOT NULL, `created_at` TEXT NOT NULL, `version_note` TEXT, `published_at` TEXT, `components_json` TEXT NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `count_session_documents` (`id` TEXT NOT NULL, `warehouse_id` TEXT NOT NULL, `warehouse_name` TEXT NOT NULL, `cutoff_at` TEXT NOT NULL, `status` TEXT NOT NULL, `created_at` TEXT NOT NULL, `updated_at` TEXT NOT NULL, `notes` TEXT, `posted_at` TEXT, `movement_references_json` TEXT NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `count_lines` (`id` TEXT NOT NULL, `session_id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `insumo_name` TEXT NOT NULL, `uom` TEXT NOT NULL, `theoretical_quantity` REAL NOT NULL, `approved_entry_index` INTEGER, `entries_json` TEXT NOT NULL, FOREIGN KEY (`session_id`) REFERENCES `count_session_documents` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `forensic_alerts` (`id` TEXT NOT NULL, `alert_type` TEXT NOT NULL, `severity` TEXT NOT NULL, `message` TEXT NOT NULL, `created_at` TEXT NOT NULL, `status` TEXT NOT NULL, `note` TEXT, `actor_label` TEXT, `acted_at` TEXT, `source_movement_id` TEXT, `source_document_id` TEXT, `source_document_type` TEXT, `metadata_json` TEXT, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `inventory_movements` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `type` TEXT NOT NULL, `quantity` REAL NOT NULL, `previous_stock` REAL NOT NULL, `new_stock` REAL NOT NULL, `timestamp` TEXT NOT NULL, `reason` TEXT, `user_id` TEXT, `unit_cost_nio` REAL, `source_document_type` TEXT, `source_document_id` TEXT, `origin_movement_id` TEXT, `origin_invoice_item_id` TEXT, `batch_deductions` TEXT, `estado_costeo` INTEGER NOT NULL, `intentos_count` INTEGER NOT NULL, `bloqueo_motivo` TEXT, `autorizado_por_usuario_id` TEXT, `fecha_autorizacion` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `inventory_movement_sync_state` (`movement_id` TEXT NOT NULL, `sync_status` TEXT NOT NULL, `last_attempted_at` TEXT, `synced_at` TEXT, `last_error` TEXT, `terminal_id` TEXT, `flow_type` TEXT, `local_sequence` INTEGER, `idempotency_key` TEXT, `last_result_code` TEXT, FOREIGN KEY (`movement_id`) REFERENCES `inventory_movements` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`movement_id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `kardex_recalculate_queue` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `origin_movement_id` TEXT NOT NULL, `trigger_movement_id` TEXT NOT NULL, `status` TEXT NOT NULL, `attempts` INTEGER NOT NULL, `claimed_at` TEXT, `last_error` TEXT, `created_at` TEXT NOT NULL, `updated_at` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `kardex_corrections` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `origin_movement_id` TEXT NOT NULL, `trigger_movement_id` TEXT NOT NULL, `previous_unit_cost_nio` REAL NOT NULL, `recalculated_unit_cost_nio` REAL NOT NULL, `delta_unit_cost_nio` REAL NOT NULL, `total_delta_cost_nio` REAL NOT NULL, `affected_quantity` REAL NOT NULL, `lineage_hash` TEXT NOT NULL, `authorized_by_user_id` TEXT, `authorized_by_role` TEXT, `authorization_method` TEXT, `created_at` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `suppliers` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `phone` TEXT, `contact_person` TEXT, `credit_terms` TEXT, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `warehouses` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `description` TEXT, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `purchases` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `supplier_id` TEXT NOT NULL, `invoice_number` TEXT NOT NULL, `fiscal_authorization_code` TEXT, `quantity` REAL NOT NULL, `unit_cost` REAL NOT NULL, `timestamp` TEXT NOT NULL, `invoice_date` TEXT NOT NULL, `currency` TEXT NOT NULL, `bcn_rate` REAL NOT NULL, `fx_rate_mode` TEXT, `unit_cost_nio` REAL, `cpp_before_nio` REAL, `projected_cpp_nio` REAL, `lot_code` TEXT, `received_date` TEXT, `expiration_date` TEXT, `requires_batch_tracking` INTEGER NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `production_order_documents` (`id` TEXT NOT NULL, `recipe_version_id` TEXT NOT NULL, `recipe_product_id` TEXT NOT NULL, `recipe_product_name` TEXT NOT NULL, `produced_insumo_id` TEXT NOT NULL, `produced_insumo_name` TEXT NOT NULL, `planned_quantity` REAL NOT NULL, `actual_quantity` REAL NOT NULL, `produced_batch_number` TEXT NOT NULL, `produced_expiration_date` TEXT NOT NULL, `operation_date` TEXT NOT NULL, `status` TEXT NOT NULL, `outcome` TEXT NOT NULL, `failure_reason` TEXT, `terminal_id` TEXT NOT NULL, `source_sequence` INTEGER NOT NULL, `idempotency_key` TEXT NOT NULL, `payload_hash` TEXT NOT NULL, `total_consumed_cost_nio` REAL NOT NULL, `produced_unit_cost_nio` REAL NOT NULL, `variance_reason` TEXT, `closed_at` TEXT, `movement_references_json` TEXT NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `uom_conversions` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `unit_name` TEXT NOT NULL, `factor` REAL NOT NULL, `is_default` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `batches` (`id` TEXT NOT NULL, `insumo_id` TEXT NOT NULL, `batch_number` TEXT NOT NULL, `received_date` TEXT, `expiration_date` TEXT NOT NULL, `remaining_stock` REAL NOT NULL, `cost` REAL NOT NULL, `is_synced` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `catalog_values` (`id` TEXT NOT NULL, `catalog_type` TEXT NOT NULL, `code` TEXT NOT NULL, `name` TEXT NOT NULL, `is_active` INTEGER NOT NULL, `sort_order` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoices` (`id` TEXT NOT NULL, `invoice_number` TEXT NOT NULL, `created_at` INTEGER NOT NULL, `user_id` TEXT NOT NULL, `subtotal` REAL NOT NULL, `total_tax` REAL NOT NULL, `total` REAL NOT NULL, `is_canceled` INTEGER NOT NULL, `void_reason` TEXT, `sync_status` TEXT NOT NULL, `payment_status` TEXT NOT NULL, `customer_id` TEXT, `global_tax_override` INTEGER NOT NULL, `type` TEXT NOT NULL, `related_invoice_id` TEXT, `origin_invoice_id` TEXT, `refund_reason_policy` TEXT, `refund_reason_code` TEXT, `authorized_by_user_id` TEXT, `authorized_by_role` TEXT, `terminal_id` TEXT, `source_sequence` INTEGER, `idempotency_key` TEXT, `payload_hash` TEXT, `bcn_official_rate` REAL NOT NULL, `commercial_rate` REAL NOT NULL, `total_usd` REAL NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoice_items` (`id` TEXT NOT NULL, `invoice_id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `quantity` REAL NOT NULL, `unit_price` REAL NOT NULL, `original_tax_rate` REAL NOT NULL, `applied_tax_rate` REAL NOT NULL, `tax_amount` REAL NOT NULL, `total` REAL NOT NULL, `discount` REAL NOT NULL, `variant_id` TEXT, `notes` TEXT, `recipe_version_id` TEXT, `origin_invoice_item_id` TEXT, FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `invoice_item_modifiers` (`id` TEXT NOT NULL, `invoice_item_id` TEXT NOT NULL, `name` TEXT NOT NULL, `extra_price` REAL NOT NULL, FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `payments` (`id` TEXT NOT NULL, `invoice_id` TEXT NOT NULL, `method` TEXT NOT NULL, `amount` REAL NOT NULL, `currency` TEXT NOT NULL, `exchange_rate` REAL NOT NULL, `amount_nio` REAL NOT NULL, `change_given` REAL NOT NULL, `change_currency` TEXT NOT NULL, `voucher_code` TEXT, `card_brand` TEXT, `card_type` TEXT, `bank_pos` TEXT, `reconciliation_status` TEXT, `last4` TEXT, `batch_number` TEXT, `reconciled_at` INTEGER, `reconciled_by_user_id` TEXT, `created_at` INTEGER, FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `tax_configurations` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `rate` REAL NOT NULL, `is_active` INTEGER NOT NULL, `is_default` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `cashier_sessions` (`id` TEXT NOT NULL, `user_id` TEXT NOT NULL, `terminal_id` TEXT NOT NULL, `opened_at` INTEGER NOT NULL, `tipo_modelo` TEXT NOT NULL, `closed_at` INTEGER, `opening_balance_nio` REAL NOT NULL, `opening_balance_usd` REAL NOT NULL, `closing_counted_nio` REAL, `closing_counted_usd` REAL, `expected_nio` REAL NOT NULL, `expected_usd` REAL NOT NULL, `difference_nio` REAL, `difference_usd` REAL, `z_report_sequence` INTEGER, `is_closed` INTEGER NOT NULL, `supervisor_id` TEXT, `notes` TEXT, `sync_status` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `cash_movements` (`id` TEXT NOT NULL, `shift_id` TEXT NOT NULL, `terminal_id` TEXT NOT NULL, `type` TEXT NOT NULL, `amount_nio` REAL NOT NULL, `amount_usd` REAL NOT NULL, `reason` TEXT NOT NULL, `authorized_by_user_id` TEXT, `timestamp` INTEGER NOT NULL, `sync_status` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `hold_tickets` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `created_at` INTEGER NOT NULL, `updated_at` INTEGER, `table_id` TEXT, `area_id` TEXT, `waiter_id` TEXT, `waiter_name` TEXT, `guest_count` INTEGER NOT NULL, `global_tax_exempt` INTEGER NOT NULL, `version` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `hold_ticket_items` (`id` TEXT NOT NULL, `hold_ticket_id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `quantity` REAL NOT NULL, `unit_price` REAL NOT NULL, `tax_rate` REAL NOT NULL, `variant_id` TEXT, `notes` TEXT, `modifiers_json` TEXT, FOREIGN KEY (`hold_ticket_id`) REFERENCES `hold_tickets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `promotions` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `type` TEXT NOT NULL, `target_product_id` TEXT, `target_category_id` TEXT, `buy_quantity` INTEGER NOT NULL, `get_quantity` INTEGER NOT NULL, `discount_value` REAL NOT NULL, `min_order_amount` REAL NOT NULL, `days_of_week` TEXT, `start_time` TEXT, `end_time` TEXT, `start_date` INTEGER, `end_date` INTEGER, `priority` INTEGER NOT NULL, `is_stackable` INTEGER NOT NULL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `restaurant_areas` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `display_order` INTEGER NOT NULL, `is_active` INTEGER NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `restaurant_tables` (`id` TEXT NOT NULL, `area_id` TEXT NOT NULL, `table_number` TEXT NOT NULL, `capacity` INTEGER NOT NULL, `status` TEXT NOT NULL, `current_ticket_id` TEXT, `active_guests` INTEGER, `opened_at` INTEGER, FOREIGN KEY (`area_id`) REFERENCES `restaurant_areas` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `kitchen_orders` (`id` TEXT NOT NULL, `ticket_id` TEXT NOT NULL, `table_number` TEXT, `table_name` TEXT, `waiter_name` TEXT, `station` TEXT NOT NULL, `status` TEXT NOT NULL, `created_at` INTEGER NOT NULL, `started_at` INTEGER, `ready_at` INTEGER, `served_at` INTEGER, `notes` TEXT, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `kitchen_order_items` (`id` TEXT NOT NULL, `kitchen_order_id` TEXT NOT NULL, `product_id` TEXT NOT NULL, `product_name` TEXT NOT NULL, `quantity` REAL NOT NULL, `status` TEXT NOT NULL, `notes` TEXT, `modifiers_json` TEXT, FOREIGN KEY (`kitchen_order_id`) REFERENCES `kitchen_orders` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `customers` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `tax_id` TEXT, `phone` TEXT, `email` TEXT, `address` TEXT, `points_balance` REAL NOT NULL, `is_active` INTEGER NOT NULL, `created_at` INTEGER NOT NULL, `updated_at` INTEGER NOT NULL, `sync_status` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `customer_point_transactions` (`id` TEXT NOT NULL, `customer_id` TEXT NOT NULL, `invoice_id` TEXT, `type` TEXT NOT NULL, `points` REAL NOT NULL, `balance_after` REAL NOT NULL, `conversion_rate` REAL NOT NULL, `reason` TEXT, `created_at` INTEGER NOT NULL, `sync_status` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `topology_snapshots` (`id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `revision` INTEGER NOT NULL, `hash` TEXT NOT NULL, `payload` TEXT NOT NULL, `received_at` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `shift_topology_bindings` (`shift_id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `snapshot_id` TEXT NOT NULL, `bound_at` TEXT NOT NULL, PRIMARY KEY (`shift_id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `emergency_topology_audits` (`id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `shift_id` TEXT NOT NULL, `snapshot_id` TEXT NOT NULL, `actor_id` TEXT NOT NULL, `actor_role` TEXT NOT NULL, `device_id` TEXT NOT NULL, `reason` TEXT NOT NULL, `occurred_at` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `fulfillment_records` (`id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `sale_id` TEXT NOT NULL, `topology_snapshot_id` TEXT NOT NULL, `topology_revision` INTEGER NOT NULL, `channel` TEXT NOT NULL, `route_state` TEXT NOT NULL, `delivery_state` TEXT NOT NULL, `lines_payload` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `print_jobs` (`id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `fulfillment_id` TEXT NOT NULL, `document_kind` TEXT NOT NULL, `sequence` INTEGER NOT NULL, `payload` TEXT NOT NULL, `state` TEXT NOT NULL, `retry_count` INTEGER NOT NULL, `idempotency_key` TEXT NOT NULL, PRIMARY KEY (`id`))');
        await database.execute(
            'CREATE TABLE IF NOT EXISTS `fulfillment_outbox_events` (`event_id` TEXT NOT NULL, `tenant_id` TEXT NOT NULL, `device_id` TEXT NOT NULL, `source_sequence` INTEGER NOT NULL, `aggregate_type` TEXT NOT NULL, `aggregate_id` TEXT NOT NULL, `idempotency_key` TEXT NOT NULL, `payload_hash` TEXT NOT NULL, `topology_revision` INTEGER NOT NULL, `state` TEXT NOT NULL, `attempts` INTEGER NOT NULL, PRIMARY KEY (`event_id`))');
        await database.execute(
            'CREATE UNIQUE INDEX `index_audit_logs_tenant_id_device_id_user_id_sequence_no` ON `audit_logs` (`tenant_id`, `device_id`, `user_id`, `sequence_no`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_movement_sync_state_stream_sequence` ON `inventory_movement_sync_state` (`terminal_id`, `flow_type`, `local_sequence`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_movement_sync_state_idempotency_key` ON `inventory_movement_sync_state` (`idempotency_key`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_production_order_documents_idempotency_key` ON `production_order_documents` (`idempotency_key`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_production_order_documents_terminal_source_sequence` ON `production_order_documents` (`terminal_id`, `source_sequence`)');
        await database.execute(
            'CREATE UNIQUE INDEX `index_invoices_invoice_number` ON `invoices` (`invoice_number`)');
        await database.execute(
            'CREATE INDEX `idx_invoices_origin_invoice_id` ON `invoices` (`origin_invoice_id`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_invoices_terminal_source_sequence` ON `invoices` (`terminal_id`, `source_sequence`)');
        await database.execute(
            'CREATE UNIQUE INDEX `idx_invoices_idempotency_key` ON `invoices` (`idempotency_key`)');
        await database.execute(
            'CREATE INDEX `index_kitchen_orders_station_status` ON `kitchen_orders` (`station`, `status`)');
        await database.execute(
            'CREATE INDEX `index_kitchen_orders_ticket_id` ON `kitchen_orders` (`ticket_id`)');
        await database.execute(
            'CREATE INDEX `index_kitchen_order_items_kitchen_order_id` ON `kitchen_order_items` (`kitchen_order_id`)');
        await database.execute(
            'CREATE INDEX `idx_customers_tax_id` ON `customers` (`tax_id`)');
        await database.execute(
            'CREATE INDEX `idx_customers_phone` ON `customers` (`phone`)');
        await database.execute(
            'CREATE INDEX `idx_customers_name` ON `customers` (`name`)');
        await database.execute(
            'CREATE INDEX `index_customer_point_transactions_customer_id` ON `customer_point_transactions` (`customer_id`)');
        await database.execute(
            'CREATE INDEX `index_customer_point_transactions_invoice_id` ON `customer_point_transactions` (`invoice_id`)');
        await database.execute(
            'CREATE INDEX `index_customer_point_transactions_created_at` ON `customer_point_transactions` (`created_at`)');
        await database.execute(
            'CREATE UNIQUE INDEX `index_print_jobs_tenant_id_idempotency_key` ON `print_jobs` (`tenant_id`, `idempotency_key`)');
        await database.execute(
            'CREATE UNIQUE INDEX `index_fulfillment_outbox_events_tenant_id_idempotency_key` ON `fulfillment_outbox_events` (`tenant_id`, `idempotency_key`)');

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
  SecurityProfileDao get securityProfileDao {
    return _securityProfileDaoInstance ??=
        _$SecurityProfileDao(database, changeListener);
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
  RecipeVersionDocumentDao get recipeVersionDocumentDao {
    return _recipeVersionDocumentDaoInstance ??=
        _$RecipeVersionDocumentDao(database, changeListener);
  }

  @override
  CountSessionDao get countSessionDao {
    return _countSessionDaoInstance ??=
        _$CountSessionDao(database, changeListener);
  }

  @override
  CountLineDao get countLineDao {
    return _countLineDaoInstance ??= _$CountLineDao(database, changeListener);
  }

  @override
  ForensicAlertDao get forensicAlertDao {
    return _forensicAlertDaoInstance ??=
        _$ForensicAlertDao(database, changeListener);
  }

  @override
  MovementDao get movementDao {
    return _movementDaoInstance ??= _$MovementDao(database, changeListener);
  }

  @override
  MovementSyncStateDao get movementSyncStateDao {
    return _movementSyncStateDaoInstance ??=
        _$MovementSyncStateDao(database, changeListener);
  }

  @override
  KardexRecalculateQueueDao get kardexRecalculateQueueDao {
    return _kardexRecalculateQueueDaoInstance ??=
        _$KardexRecalculateQueueDao(database, changeListener);
  }

  @override
  KardexCorrectionDao get kardexCorrectionDao {
    return _kardexCorrectionDaoInstance ??=
        _$KardexCorrectionDao(database, changeListener);
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
  ProductionOrderDocumentDao get productionOrderDocumentDao {
    return _productionOrderDocumentDaoInstance ??=
        _$ProductionOrderDocumentDao(database, changeListener);
  }

  @override
  ProductionTransactionDao get productionTransactionDao {
    return _productionTransactionDaoInstance ??=
        _$ProductionTransactionDao(database, changeListener);
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
  CatalogValueDao get catalogValueDao {
    return _catalogValueDaoInstance ??=
        _$CatalogValueDao(database, changeListener);
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
  CashMovementDao get cashMovementDao {
    return _cashMovementDaoInstance ??=
        _$CashMovementDao(database, changeListener);
  }

  @override
  HoldTicketDao get holdTicketDao {
    return _holdTicketDaoInstance ??= _$HoldTicketDao(database, changeListener);
  }

  @override
  PromotionDao get promotionDao {
    return _promotionDaoInstance ??= _$PromotionDao(database, changeListener);
  }

  @override
  RestaurantAreaDao get restaurantAreaDao {
    return _restaurantAreaDaoInstance ??=
        _$RestaurantAreaDao(database, changeListener);
  }

  @override
  RestaurantTableDao get restaurantTableDao {
    return _restaurantTableDaoInstance ??=
        _$RestaurantTableDao(database, changeListener);
  }

  @override
  KitchenOrderDao get kitchenOrderDao {
    return _kitchenOrderDaoInstance ??=
        _$KitchenOrderDao(database, changeListener);
  }

  @override
  CustomerDao get customerDao {
    return _customerDaoInstance ??= _$CustomerDao(database, changeListener);
  }

  @override
  CustomerPointTransactionDao get customerPointTransactionDao {
    return _customerPointTransactionDaoInstance ??=
        _$CustomerPointTransactionDao(database, changeListener);
  }

  @override
  FulfillmentTopologyDao get fulfillmentTopologyDao {
    return _fulfillmentTopologyDaoInstance ??=
        _$FulfillmentTopologyDao(database, changeListener);
  }

  @override
  FulfillmentPersistenceDao get fulfillmentPersistenceDao {
    return _fulfillmentPersistenceDaoInstance ??=
        _$FulfillmentPersistenceDao(database, changeListener);
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
  Future<UserEntity?> findUserByEmail(String email) async {
    return _queryAdapter.query('SELECT * FROM users WHERE email = ?1 LIMIT 1',
        mapper: (Map<String, Object?> row) => UserEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            role: row['role'] as String,
            pinHash: row['pin_hash'] as String,
            isActive: (row['is_active'] as int) != 0,
            email: row['email'] as String?,
            tenantId: row['tenant_id'] as String?),
        arguments: [email]);
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

class _$SecurityProfileDao extends SecurityProfileDao {
  _$SecurityProfileDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _securityProfileEntityInsertionAdapter = InsertionAdapter(
            database,
            'security_profiles',
            (SecurityProfileEntity item) => <String, Object?>{
                  'user_id': item.userId,
                  'pin_hash': item.pinHash,
                  'totp_secret_seed': item.totpSecretSeed,
                  'is_totp_enabled': item.isTotpEnabled ? 1 : 0,
                  'is_pin_enabled': item.isPinEnabled ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<SecurityProfileEntity>
      _securityProfileEntityInsertionAdapter;

  @override
  Future<SecurityProfileEntity?> findByUserId(String userId) async {
    return _queryAdapter.query(
        'SELECT * FROM security_profiles WHERE user_id = ?1 LIMIT 1',
        mapper: (Map<String, Object?> row) => SecurityProfileEntity(
            userId: row['user_id'] as String,
            pinHash: row['pin_hash'] as String?,
            totpSecretSeed: row['totp_secret_seed'] as String?,
            isTotpEnabled: (row['is_totp_enabled'] as int) != 0,
            isPinEnabled: (row['is_pin_enabled'] as int) != 0),
        arguments: [userId]);
  }

  @override
  Future<void> deleteAll() async {
    await _queryAdapter.queryNoReturn('DELETE FROM security_profiles');
  }

  @override
  Future<List<SecurityProfileEntity>> findLegacyPlaintextTotpSeeds() async {
    return _queryAdapter.queryList(
        'SELECT * FROM security_profiles WHERE totp_secret_seed IS NOT NULL AND totp_secret_seed != \'\' AND lower(substr(totp_secret_seed, 1, 3)) != \'enc\'',
        mapper: (Map<String, Object?> row) => SecurityProfileEntity(
            userId: row['user_id'] as String,
            pinHash: row['pin_hash'] as String?,
            totpSecretSeed: row['totp_secret_seed'] as String?,
            isTotpEnabled: (row['is_totp_enabled'] as int) != 0,
            isPinEnabled: (row['is_pin_enabled'] as int) != 0));
  }

  @override
  Future<void> updateTotpSecretSeed(
    String userId,
    String encryptedSeed,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE security_profiles SET totp_secret_seed = ?2 WHERE user_id = ?1',
        arguments: [userId, encryptedSeed]);
  }

  @override
  Future<void> insertProfiles(List<SecurityProfileEntity> profiles) async {
    await _securityProfileEntityInsertionAdapter.insertList(
        profiles, OnConflictStrategy.replace);
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
                  'is_synced': item.isSynced ? 1 : 0,
                  'sequence_no': item.sequenceNo,
                  'prev_hash': item.prevHash,
                  'entry_hash': item.entryHash,
                  'metodo_autorizacion': item.metodoAutorizacion,
                  'usuario_autorizador_id': item.usuarioAutorizadorId,
                  'remote_ref_uuid': item.remoteRefUuid,
                  'hash_version': item.hashVersion,
                  'has_metodo_autorizacion': item.hasMetodoAutorizacion == null
                      ? null
                      : (item.hasMetodoAutorizacion! ? 1 : 0),
                  'has_usuario_autorizador_id':
                      item.hasUsuarioAutorizadorId == null
                          ? null
                          : (item.hasUsuarioAutorizadorId! ? 1 : 0),
                  'tenant_id': item.tenantId,
                  'metadata_raw': item.metadataRaw
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
            isSynced: (row['is_synced'] as int) != 0,
            sequenceNo: row['sequence_no'] as int,
            prevHash: row['prev_hash'] as String,
            entryHash: row['entry_hash'] as String,
            metodoAutorizacion: row['metodo_autorizacion'] as String?,
            usuarioAutorizadorId: row['usuario_autorizador_id'] as String?,
            remoteRefUuid: row['remote_ref_uuid'] as String,
            hashVersion: row['hash_version'] as String?,
            hasMetodoAutorizacion: row['has_metodo_autorizacion'] == null
                ? null
                : (row['has_metodo_autorizacion'] as int) != 0,
            hasUsuarioAutorizadorId: row['has_usuario_autorizador_id'] == null
                ? null
                : (row['has_usuario_autorizador_id'] as int) != 0,
            tenantId: row['tenant_id'] as String?,
            metadataRaw: row['metadata_raw'] as String?));
  }

  @override
  Future<List<AuditLogEntity>> findLogsWithFilters(
    String start,
    String end,
    String userId,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM audit_logs WHERE timestamp >= ?1 AND timestamp <= ?2 AND (?3 = \'\' OR user_id = ?3) ORDER BY timestamp DESC',
        mapper: (Map<String, Object?> row) => AuditLogEntity(id: row['id'] as int?, userId: row['user_id'] as String, action: row['action'] as String, timestamp: row['timestamp'] as String, deviceId: row['device_id'] as String, metadata: row['metadata'] as String?, isSynced: (row['is_synced'] as int) != 0, sequenceNo: row['sequence_no'] as int, prevHash: row['prev_hash'] as String, entryHash: row['entry_hash'] as String, metodoAutorizacion: row['metodo_autorizacion'] as String?, usuarioAutorizadorId: row['usuario_autorizador_id'] as String?, remoteRefUuid: row['remote_ref_uuid'] as String, hashVersion: row['hash_version'] as String?, hasMetodoAutorizacion: row['has_metodo_autorizacion'] == null ? null : (row['has_metodo_autorizacion'] as int) != 0, hasUsuarioAutorizadorId: row['has_usuario_autorizador_id'] == null ? null : (row['has_usuario_autorizador_id'] as int) != 0, tenantId: row['tenant_id'] as String?, metadataRaw: row['metadata_raw'] as String?),
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
            isSynced: (row['is_synced'] as int) != 0,
            sequenceNo: row['sequence_no'] as int,
            prevHash: row['prev_hash'] as String,
            entryHash: row['entry_hash'] as String,
            metodoAutorizacion: row['metodo_autorizacion'] as String?,
            usuarioAutorizadorId: row['usuario_autorizador_id'] as String?,
            remoteRefUuid: row['remote_ref_uuid'] as String,
            hashVersion: row['hash_version'] as String?,
            hasMetodoAutorizacion: row['has_metodo_autorizacion'] == null
                ? null
                : (row['has_metodo_autorizacion'] as int) != 0,
            hasUsuarioAutorizadorId: row['has_usuario_autorizador_id'] == null
                ? null
                : (row['has_usuario_autorizador_id'] as int) != 0,
            tenantId: row['tenant_id'] as String?,
            metadataRaw: row['metadata_raw'] as String?));
  }

  @override
  Future<int?> getLastSequenceNoByStream(
    String tenantId,
    String deviceId,
    String userId,
  ) async {
    return _queryAdapter.query(
        'SELECT sequence_no FROM audit_logs WHERE tenant_id = ?1 AND device_id = ?2 AND user_id = ?3 ORDER BY sequence_no DESC LIMIT 1',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [tenantId, deviceId, userId]);
  }

  @override
  Future<String?> getLastEntryHashByStream(
    String tenantId,
    String deviceId,
    String userId,
  ) async {
    return _queryAdapter.query(
        'SELECT entry_hash FROM audit_logs WHERE tenant_id = ?1 AND device_id = ?2 AND user_id = ?3 ORDER BY sequence_no DESC LIMIT 1',
        mapper: (Map<String, Object?> row) => row.values.first as String,
        arguments: [tenantId, deviceId, userId]);
  }

  @override
  Future<AuditLogEntity?> getLastAuditLogByStream(
    String tenantId,
    String deviceId,
    String userId,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM audit_logs WHERE tenant_id = ?1 AND device_id = ?2 AND user_id = ?3 ORDER BY sequence_no DESC LIMIT 1',
        mapper: (Map<String, Object?> row) => AuditLogEntity(id: row['id'] as int?, userId: row['user_id'] as String, action: row['action'] as String, timestamp: row['timestamp'] as String, deviceId: row['device_id'] as String, metadata: row['metadata'] as String?, isSynced: (row['is_synced'] as int) != 0, sequenceNo: row['sequence_no'] as int, prevHash: row['prev_hash'] as String, entryHash: row['entry_hash'] as String, metodoAutorizacion: row['metodo_autorizacion'] as String?, usuarioAutorizadorId: row['usuario_autorizador_id'] as String?, remoteRefUuid: row['remote_ref_uuid'] as String, hashVersion: row['hash_version'] as String?, hasMetodoAutorizacion: row['has_metodo_autorizacion'] == null ? null : (row['has_metodo_autorizacion'] as int) != 0, hasUsuarioAutorizadorId: row['has_usuario_autorizador_id'] == null ? null : (row['has_usuario_autorizador_id'] as int) != 0, tenantId: row['tenant_id'] as String?, metadataRaw: row['metadata_raw'] as String?),
        arguments: [tenantId, deviceId, userId]);
  }

  @override
  Future<void> updateMetadataById(
    int id,
    String metadata,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE audit_logs SET metadata = ?2 WHERE id = ?1',
        arguments: [id, metadata]);
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
    await _auditLogEntityInsertionAdapter.insert(log, OnConflictStrategy.abort);
  }

  @override
  Future<void> appendForensicLog(
    String tenantId,
    String deviceId,
    String userId,
    AuditLogEntity Function(int, String) createLog,
  ) async {
    if (database is sqflite.Transaction) {
      await super.appendForensicLog(tenantId, deviceId, userId, createLog);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.auditDao
            .appendForensicLog(tenantId, deviceId, userId, createLog);
      });
    }
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
    return _queryAdapter.query('SELECT * FROM local_configs WHERE `key` = ?1',
        mapper: (Map<String, Object?> row) => LocalConfigEntity(
            key: row['key'] as String,
            value: row['value'] as String,
            description: row['description'] as String?),
        arguments: [key]);
  }

  @override
  Future<void> deleteConfig(String key) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM local_configs WHERE `key` = ?1',
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
                  'stock_min': item.stockMin,
                  'stock_max': item.stockMax,
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
                  'stock_min': item.stockMin,
                  'stock_max': item.stockMax,
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
            stockMin: row['stock_min'] as double?,
            stockMax: row['stock_max'] as double?,
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
            stockMin: row['stock_min'] as double?,
            stockMax: row['stock_max'] as double?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<List<InsumoEntity>> findInsumosByIds(List<String> ids) async {
    const offset = 1;
    final _sqliteVariablesForIds =
        Iterable<String>.generate(ids.length, (i) => '?${i + offset}')
            .join(',');
    return _queryAdapter.queryList(
        'SELECT * FROM insumos WHERE id IN (' + _sqliteVariablesForIds + ')',
        mapper: (Map<String, Object?> row) => InsumoEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            consumptionUom: row['consumption_uom'] as String,
            warehouseId: row['warehouse_id'] as String?,
            isPerishable: (row['is_perishable'] as int) != 0,
            stock: row['stock'] as double,
            averageCost: row['average_cost'] as double,
            parLevel: row['par_level'] as double?,
            stockMin: row['stock_min'] as double?,
            stockMax: row['stock_max'] as double?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [...ids]);
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
                  'barcode': item.barcode,
                  'category': item.category,
                  'is_prepared': item.isPrepared ? 1 : 0,
                  'created_at': item.createdAt,
                  'inventory_policy': item.inventoryPolicy,
                  'direct_stock_insumo_id': item.directStockInsumoId
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
            barcode: row['barcode'] as String?,
            category: row['category'] as String?,
            isPrepared: (row['is_prepared'] as int) != 0,
            createdAt: row['created_at'] as String?,
            inventoryPolicy: row['inventory_policy'] as String?,
            directStockInsumoId: row['direct_stock_insumo_id'] as String?));
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
            barcode: row['barcode'] as String?,
            category: row['category'] as String?,
            isPrepared: (row['is_prepared'] as int) != 0,
            createdAt: row['created_at'] as String?,
            inventoryPolicy: row['inventory_policy'] as String?,
            directStockInsumoId: row['direct_stock_insumo_id'] as String?),
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
            barcode: row['barcode'] as String?,
            category: row['category'] as String?,
            isPrepared: (row['is_prepared'] as int) != 0,
            createdAt: row['created_at'] as String?,
            inventoryPolicy: row['inventory_policy'] as String?,
            directStockInsumoId: row['direct_stock_insumo_id'] as String?),
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
  Future<void> deleteRecipesByProductId(String productId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM recipes WHERE product_id = ?1',
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

class _$RecipeVersionDocumentDao extends RecipeVersionDocumentDao {
  _$RecipeVersionDocumentDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _recipeVersionDocumentEntityInsertionAdapter = InsertionAdapter(
            database,
            'recipe_version_documents',
            (RecipeVersionDocumentEntity item) => <String, Object?>{
                  'id': item.id,
                  'product_id': item.productId,
                  'product_name': item.productName,
                  'version_number': item.versionNumber,
                  'yield_quantity': item.yieldQuantity,
                  'technical_shrink_pct': item.technicalShrinkPct,
                  'created_at': item.createdAt,
                  'version_note': item.versionNote,
                  'published_at': item.publishedAt,
                  'components_json': item.componentsJson,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<RecipeVersionDocumentEntity>
      _recipeVersionDocumentEntityInsertionAdapter;

  @override
  Future<List<RecipeVersionDocumentEntity>> findByProductId(
      String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM recipe_version_documents WHERE product_id = ?1 ORDER BY version_number DESC',
        mapper: (Map<String, Object?> row) => RecipeVersionDocumentEntity(id: row['id'] as String, productId: row['product_id'] as String, productName: row['product_name'] as String, versionNumber: row['version_number'] as int, yieldQuantity: row['yield_quantity'] as double, technicalShrinkPct: row['technical_shrink_pct'] as double, createdAt: row['created_at'] as String, componentsJson: row['components_json'] as String, versionNote: row['version_note'] as String?, publishedAt: row['published_at'] as String?, isSynced: (row['is_synced'] as int) != 0),
        arguments: [productId]);
  }

  @override
  Future<RecipeVersionDocumentEntity?> findById(String id) async {
    return _queryAdapter.query(
        'SELECT * FROM recipe_version_documents WHERE id = ?1',
        mapper: (Map<String, Object?> row) => RecipeVersionDocumentEntity(
            id: row['id'] as String,
            productId: row['product_id'] as String,
            productName: row['product_name'] as String,
            versionNumber: row['version_number'] as int,
            yieldQuantity: row['yield_quantity'] as double,
            technicalShrinkPct: row['technical_shrink_pct'] as double,
            createdAt: row['created_at'] as String,
            componentsJson: row['components_json'] as String,
            versionNote: row['version_note'] as String?,
            publishedAt: row['published_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<List<RecipeVersionDocumentEntity>> findUnsynced() async {
    return _queryAdapter.queryList(
        'SELECT * FROM recipe_version_documents WHERE is_synced = 0 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => RecipeVersionDocumentEntity(
            id: row['id'] as String,
            productId: row['product_id'] as String,
            productName: row['product_name'] as String,
            versionNumber: row['version_number'] as int,
            yieldQuantity: row['yield_quantity'] as double,
            technicalShrinkPct: row['technical_shrink_pct'] as double,
            createdAt: row['created_at'] as String,
            componentsJson: row['components_json'] as String,
            versionNote: row['version_note'] as String?,
            publishedAt: row['published_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE recipe_version_documents SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> upsertDocument(RecipeVersionDocumentEntity entity) async {
    await _recipeVersionDocumentEntityInsertionAdapter.insert(
        entity, OnConflictStrategy.replace);
  }
}

class _$CountSessionDao extends CountSessionDao {
  _$CountSessionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _countSessionDocumentEntityInsertionAdapter = InsertionAdapter(
            database,
            'count_session_documents',
            (CountSessionDocumentEntity item) => <String, Object?>{
                  'id': item.id,
                  'warehouse_id': item.warehouseId,
                  'warehouse_name': item.warehouseName,
                  'cutoff_at': item.cutoffAt,
                  'status': item.status,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt,
                  'notes': item.notes,
                  'posted_at': item.postedAt,
                  'movement_references_json': item.movementReferencesJson,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CountSessionDocumentEntity>
      _countSessionDocumentEntityInsertionAdapter;

  @override
  Future<List<CountSessionDocumentEntity>> findAllDocuments() async {
    return _queryAdapter.queryList(
        'SELECT * FROM count_session_documents ORDER BY updated_at DESC',
        mapper: (Map<String, Object?> row) => CountSessionDocumentEntity(
            id: row['id'] as String,
            warehouseId: row['warehouse_id'] as String,
            warehouseName: row['warehouse_name'] as String,
            cutoffAt: row['cutoff_at'] as String,
            status: row['status'] as String,
            createdAt: row['created_at'] as String,
            updatedAt: row['updated_at'] as String,
            movementReferencesJson: row['movement_references_json'] as String,
            notes: row['notes'] as String?,
            postedAt: row['posted_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<CountSessionDocumentEntity>> findUnsynced() async {
    return _queryAdapter.queryList(
        'SELECT * FROM count_session_documents WHERE is_synced = 0 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => CountSessionDocumentEntity(
            id: row['id'] as String,
            warehouseId: row['warehouse_id'] as String,
            warehouseName: row['warehouse_name'] as String,
            cutoffAt: row['cutoff_at'] as String,
            status: row['status'] as String,
            createdAt: row['created_at'] as String,
            updatedAt: row['updated_at'] as String,
            movementReferencesJson: row['movement_references_json'] as String,
            notes: row['notes'] as String?,
            postedAt: row['posted_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE count_session_documents SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> upsertDocument(CountSessionDocumentEntity entity) async {
    await _countSessionDocumentEntityInsertionAdapter.insert(
        entity, OnConflictStrategy.replace);
  }
}

class _$CountLineDao extends CountLineDao {
  _$CountLineDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _countLineEntityInsertionAdapter = InsertionAdapter(
            database,
            'count_lines',
            (CountLineEntity item) => <String, Object?>{
                  'id': item.id,
                  'session_id': item.sessionId,
                  'insumo_id': item.insumoId,
                  'insumo_name': item.insumoName,
                  'uom': item.uom,
                  'theoretical_quantity': item.theoreticalQuantity,
                  'approved_entry_index': item.approvedEntryIndex,
                  'entries_json': item.entriesJson
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CountLineEntity> _countLineEntityInsertionAdapter;

  @override
  Future<List<CountLineEntity>> findBySessionId(String sessionId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM count_lines WHERE session_id = ?1 ORDER BY id ASC',
        mapper: (Map<String, Object?> row) => CountLineEntity(
            id: row['id'] as String,
            sessionId: row['session_id'] as String,
            insumoId: row['insumo_id'] as String,
            insumoName: row['insumo_name'] as String,
            uom: row['uom'] as String,
            theoreticalQuantity: row['theoretical_quantity'] as double,
            entriesJson: row['entries_json'] as String,
            approvedEntryIndex: row['approved_entry_index'] as int?),
        arguments: [sessionId]);
  }

  @override
  Future<void> deleteBySessionId(String sessionId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM count_lines WHERE session_id = ?1',
        arguments: [sessionId]);
  }

  @override
  Future<void> insertLines(List<CountLineEntity> lines) async {
    await _countLineEntityInsertionAdapter.insertList(
        lines, OnConflictStrategy.replace);
  }
}

class _$ForensicAlertDao extends ForensicAlertDao {
  _$ForensicAlertDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _forensicAlertEntityInsertionAdapter = InsertionAdapter(
            database,
            'forensic_alerts',
            (ForensicAlertEntity item) => <String, Object?>{
                  'id': item.id,
                  'alert_type': item.alertType,
                  'severity': item.severity,
                  'message': item.message,
                  'created_at': item.createdAt,
                  'status': item.status,
                  'note': item.note,
                  'actor_label': item.actorLabel,
                  'acted_at': item.actedAt,
                  'source_movement_id': item.sourceMovementId,
                  'source_document_id': item.sourceDocumentId,
                  'source_document_type': item.sourceDocumentType,
                  'metadata_json': item.metadataJson,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<ForensicAlertEntity>
      _forensicAlertEntityInsertionAdapter;

  @override
  Future<List<ForensicAlertEntity>> findAllAlerts() async {
    return _queryAdapter.queryList(
        'SELECT * FROM forensic_alerts ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => ForensicAlertEntity(
            id: row['id'] as String,
            alertType: row['alert_type'] as String,
            severity: row['severity'] as String,
            message: row['message'] as String,
            createdAt: row['created_at'] as String,
            status: row['status'] as String,
            note: row['note'] as String?,
            actorLabel: row['actor_label'] as String?,
            actedAt: row['acted_at'] as String?,
            sourceMovementId: row['source_movement_id'] as String?,
            sourceDocumentId: row['source_document_id'] as String?,
            sourceDocumentType: row['source_document_type'] as String?,
            metadataJson: row['metadata_json'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<ForensicAlertEntity>> findUnsyncedLifecycleAlerts() async {
    return _queryAdapter.queryList(
        'SELECT * FROM forensic_alerts WHERE is_synced = 0 AND status != \'active\' ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => ForensicAlertEntity(
            id: row['id'] as String,
            alertType: row['alert_type'] as String,
            severity: row['severity'] as String,
            message: row['message'] as String,
            createdAt: row['created_at'] as String,
            status: row['status'] as String,
            note: row['note'] as String?,
            actorLabel: row['actor_label'] as String?,
            actedAt: row['acted_at'] as String?,
            sourceMovementId: row['source_movement_id'] as String?,
            sourceDocumentId: row['source_document_id'] as String?,
            sourceDocumentType: row['source_document_type'] as String?,
            metadataJson: row['metadata_json'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<void> insertIfAbsentForensicAlert(
    String id,
    String alertType,
    String severity,
    String message,
    String createdAt,
    String status,
    String sourceDocumentType,
    String sourceDocumentId,
    String metadataJson,
    bool isSynced,
  ) async {
    await _queryAdapter.queryNoReturn(
        'INSERT OR IGNORE INTO forensic_alerts (id, alert_type, severity, message, created_at, status, source_document_type, source_document_id, metadata_json, is_synced) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)',
        arguments: [
          id,
          alertType,
          severity,
          message,
          createdAt,
          status,
          sourceDocumentType,
          sourceDocumentId,
          metadataJson,
          isSynced ? 1 : 0
        ]);
  }

  @override
  Future<int?> countActiveAuditTerminalAlerts(String sourceDocumentId) async {
    return _queryAdapter.query(
        'SELECT COUNT(*) FROM forensic_alerts WHERE alert_type = \'AUDIT_BACKEND_TERMINAL_REJECTION\' AND source_document_type = \'audit_log\' AND source_document_id = ?1 AND status = \'active\'',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [sourceDocumentId]);
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE forensic_alerts SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> upsertAlert(ForensicAlertEntity entity) async {
    await _forensicAlertEntityInsertionAdapter.insert(
        entity, OnConflictStrategy.replace);
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
                  'unit_cost_nio': item.unitCostNio,
                  'source_document_type': item.sourceDocumentType,
                  'source_document_id': item.sourceDocumentId,
                  'origin_movement_id': item.originMovementId,
                  'origin_invoice_item_id': item.originInvoiceItemId,
                  'batch_deductions': item.batch_deductions,
                  'estado_costeo': item.estadoCosteo,
                  'intentos_count': item.intentosCount,
                  'bloqueo_motivo': item.bloqueoMotivo,
                  'autorizado_por_usuario_id': item.autorizadoPorUsuarioId,
                  'fecha_autorizacion': item.fechaAutorizacion
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
            unitCostNio: row['unit_cost_nio'] as double?,
            sourceDocumentType: row['source_document_type'] as String?,
            sourceDocumentId: row['source_document_id'] as String?,
            originMovementId: row['origin_movement_id'] as String?,
            originInvoiceItemId: row['origin_invoice_item_id'] as String?,
            batch_deductions: row['batch_deductions'] as String?,
            estadoCosteo: row['estado_costeo'] as int,
            intentosCount: row['intentos_count'] as int,
            bloqueoMotivo: row['bloqueo_motivo'] as String?,
            autorizadoPorUsuarioId: row['autorizado_por_usuario_id'] as String?,
            fechaAutorizacion: row['fecha_autorizacion'] as String?));
  }

  @override
  Future<List<MovementEntity>> findUnsyncedMovements() async {
    return _queryAdapter.queryList(
        'SELECT inventory_movements.*     FROM inventory_movements     LEFT JOIN inventory_movement_sync_state       ON inventory_movement_sync_state.movement_id = inventory_movements.id     WHERE inventory_movement_sync_state.sync_status IS NULL       OR inventory_movement_sync_state.sync_status != \'synced\'     ORDER BY CASE WHEN inventory_movement_sync_state.local_sequence IS NULL THEN 1 ELSE 0 END ASC,       inventory_movement_sync_state.local_sequence ASC,       inventory_movements.timestamp ASC,       inventory_movements.id ASC',
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
            unitCostNio: row['unit_cost_nio'] as double?,
            sourceDocumentType: row['source_document_type'] as String?,
            sourceDocumentId: row['source_document_id'] as String?,
            originMovementId: row['origin_movement_id'] as String?,
            originInvoiceItemId: row['origin_invoice_item_id'] as String?,
            batch_deductions: row['batch_deductions'] as String?,
            estadoCosteo: row['estado_costeo'] as int,
            intentosCount: row['intentos_count'] as int,
            bloqueoMotivo: row['bloqueo_motivo'] as String?,
            autorizadoPorUsuarioId: row['autorizado_por_usuario_id'] as String?,
            fechaAutorizacion: row['fecha_autorizacion'] as String?));
  }

  @override
  Future<List<MovementEntity>> findMovementsByType(
    String type,
    int limit,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM inventory_movements WHERE type = ?1 ORDER BY timestamp DESC LIMIT ?2',
        mapper: (Map<String, Object?> row) => MovementEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, type: row['type'] as String, quantity: row['quantity'] as double, previousStock: row['previous_stock'] as double, newStock: row['new_stock'] as double, timestamp: row['timestamp'] as String, reason: row['reason'] as String?, userId: row['user_id'] as String?, unitCostNio: row['unit_cost_nio'] as double?, sourceDocumentType: row['source_document_type'] as String?, sourceDocumentId: row['source_document_id'] as String?, originMovementId: row['origin_movement_id'] as String?, originInvoiceItemId: row['origin_invoice_item_id'] as String?, batch_deductions: row['batch_deductions'] as String?, estadoCosteo: row['estado_costeo'] as int, intentosCount: row['intentos_count'] as int, bloqueoMotivo: row['bloqueo_motivo'] as String?, autorizadoPorUsuarioId: row['autorizado_por_usuario_id'] as String?, fechaAutorizacion: row['fecha_autorizacion'] as String?),
        arguments: [type, limit]);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.abort);
  }
}

class _$MovementSyncStateDao extends MovementSyncStateDao {
  _$MovementSyncStateDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _movementSyncStateEntityInsertionAdapter = InsertionAdapter(
            database,
            'inventory_movement_sync_state',
            (MovementSyncStateEntity item) => <String, Object?>{
                  'movement_id': item.movementId,
                  'sync_status': item.syncStatus,
                  'last_attempted_at': item.lastAttemptedAt,
                  'synced_at': item.syncedAt,
                  'last_error': item.lastError,
                  'terminal_id': item.terminalId,
                  'flow_type': item.flowType,
                  'local_sequence': item.localSequence,
                  'idempotency_key': item.idempotencyKey,
                  'last_result_code': item.lastResultCode
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<MovementSyncStateEntity>
      _movementSyncStateEntityInsertionAdapter;

  @override
  Future<MovementSyncStateEntity?> findByMovementId(String movementId) async {
    return _queryAdapter.query(
        'SELECT * FROM inventory_movement_sync_state WHERE movement_id = ?1',
        mapper: (Map<String, Object?> row) => MovementSyncStateEntity(
            movementId: row['movement_id'] as String,
            syncStatus: row['sync_status'] as String,
            lastAttemptedAt: row['last_attempted_at'] as String?,
            syncedAt: row['synced_at'] as String?,
            lastError: row['last_error'] as String?,
            terminalId: row['terminal_id'] as String?,
            flowType: row['flow_type'] as String?,
            localSequence: row['local_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            lastResultCode: row['last_result_code'] as String?),
        arguments: [movementId]);
  }

  @override
  Future<List<MovementSyncStateEntity>> findByMovementIds(
      List<String> movementIds) async {
    const offset = 1;
    final _sqliteVariablesForMovementIds =
        Iterable<String>.generate(movementIds.length, (i) => '?${i + offset}')
            .join(',');
    return _queryAdapter.queryList(
        'SELECT * FROM inventory_movement_sync_state     WHERE movement_id IN (' +
            _sqliteVariablesForMovementIds +
            ')',
        mapper: (Map<String, Object?> row) => MovementSyncStateEntity(movementId: row['movement_id'] as String, syncStatus: row['sync_status'] as String, lastAttemptedAt: row['last_attempted_at'] as String?, syncedAt: row['synced_at'] as String?, lastError: row['last_error'] as String?, terminalId: row['terminal_id'] as String?, flowType: row['flow_type'] as String?, localSequence: row['local_sequence'] as int?, idempotencyKey: row['idempotency_key'] as String?, lastResultCode: row['last_result_code'] as String?),
        arguments: [...movementIds]);
  }

  @override
  Future<int?> findMaxLocalSequence(
    String terminalId,
    String flowType,
  ) async {
    return _queryAdapter.query(
        'SELECT COALESCE(MAX(local_sequence), 0)     FROM inventory_movement_sync_state     WHERE terminal_id = ?1 AND flow_type = ?2',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [terminalId, flowType]);
  }

  @override
  Future<void> upsertSyncState(MovementSyncStateEntity state) async {
    await _movementSyncStateEntityInsertionAdapter.insert(
        state, OnConflictStrategy.replace);
  }
}

class _$KardexRecalculateQueueDao extends KardexRecalculateQueueDao {
  _$KardexRecalculateQueueDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _kardexRecalculateQueueEntityInsertionAdapter = InsertionAdapter(
            database,
            'kardex_recalculate_queue',
            (KardexRecalculateQueueEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'origin_movement_id': item.originMovementId,
                  'trigger_movement_id': item.triggerMovementId,
                  'status': item.status,
                  'attempts': item.attempts,
                  'claimed_at': item.claimedAt,
                  'last_error': item.lastError,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt
                }),
        _kardexRecalculateQueueEntityUpdateAdapter = UpdateAdapter(
            database,
            'kardex_recalculate_queue',
            ['id'],
            (KardexRecalculateQueueEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'origin_movement_id': item.originMovementId,
                  'trigger_movement_id': item.triggerMovementId,
                  'status': item.status,
                  'attempts': item.attempts,
                  'claimed_at': item.claimedAt,
                  'last_error': item.lastError,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<KardexRecalculateQueueEntity>
      _kardexRecalculateQueueEntityInsertionAdapter;

  final UpdateAdapter<KardexRecalculateQueueEntity>
      _kardexRecalculateQueueEntityUpdateAdapter;

  @override
  Future<List<KardexRecalculateQueueEntity>> findQueueByStatus(
      String status) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kardex_recalculate_queue WHERE status = ?1 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => KardexRecalculateQueueEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, originMovementId: row['origin_movement_id'] as String, triggerMovementId: row['trigger_movement_id'] as String, status: row['status'] as String, attempts: row['attempts'] as int, claimedAt: row['claimed_at'] as String?, lastError: row['last_error'] as String?, createdAt: row['created_at'] as String, updatedAt: row['updated_at'] as String),
        arguments: [status]);
  }

  @override
  Future<List<KardexRecalculateQueueEntity>> findQueueByInsumoId(
      String insumoId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kardex_recalculate_queue WHERE insumo_id = ?1 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => KardexRecalculateQueueEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, originMovementId: row['origin_movement_id'] as String, triggerMovementId: row['trigger_movement_id'] as String, status: row['status'] as String, attempts: row['attempts'] as int, claimedAt: row['claimed_at'] as String?, lastError: row['last_error'] as String?, createdAt: row['created_at'] as String, updatedAt: row['updated_at'] as String),
        arguments: [insumoId]);
  }

  @override
  Future<KardexRecalculateQueueEntity?> findQueueById(String id) async {
    return _queryAdapter.query(
        'SELECT * FROM kardex_recalculate_queue WHERE id = ?1',
        mapper: (Map<String, Object?> row) => KardexRecalculateQueueEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            originMovementId: row['origin_movement_id'] as String,
            triggerMovementId: row['trigger_movement_id'] as String,
            status: row['status'] as String,
            attempts: row['attempts'] as int,
            claimedAt: row['claimed_at'] as String?,
            lastError: row['last_error'] as String?,
            createdAt: row['created_at'] as String,
            updatedAt: row['updated_at'] as String),
        arguments: [id]);
  }

  @override
  Future<void> deleteQueueItemById(String id) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM kardex_recalculate_queue WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertQueueItem(KardexRecalculateQueueEntity item) async {
    await _kardexRecalculateQueueEntityInsertionAdapter.insert(
        item, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateQueueItem(KardexRecalculateQueueEntity item) async {
    await _kardexRecalculateQueueEntityUpdateAdapter.update(
        item, OnConflictStrategy.replace);
  }

  @override
  Future<void> claimQueueItem(
    String id,
    String status,
    String claimedAt,
    int attempts,
  ) async {
    if (database is sqflite.Transaction) {
      await super.claimQueueItem(id, status, claimedAt, attempts);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.kardexRecalculateQueueDao
            .claimQueueItem(id, status, claimedAt, attempts);
      });
    }
  }
}

class _$KardexCorrectionDao extends KardexCorrectionDao {
  _$KardexCorrectionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _kardexCorrectionEntityInsertionAdapter = InsertionAdapter(
            database,
            'kardex_corrections',
            (KardexCorrectionEntity item) => <String, Object?>{
                  'id': item.id,
                  'insumo_id': item.insumoId,
                  'origin_movement_id': item.originMovementId,
                  'trigger_movement_id': item.triggerMovementId,
                  'previous_unit_cost_nio': item.previousUnitCostNio,
                  'recalculated_unit_cost_nio': item.recalculatedUnitCostNio,
                  'delta_unit_cost_nio': item.deltaUnitCostNio,
                  'total_delta_cost_nio': item.totalDeltaCostNio,
                  'affected_quantity': item.affectedQuantity,
                  'lineage_hash': item.lineageHash,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'authorized_by_role': item.authorizedByRole,
                  'authorization_method': item.authorizationMethod,
                  'created_at': item.createdAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<KardexCorrectionEntity>
      _kardexCorrectionEntityInsertionAdapter;

  @override
  Future<List<KardexCorrectionEntity>> findCorrectionsByInsumoId(
      String insumoId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kardex_corrections WHERE insumo_id = ?1 ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => KardexCorrectionEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, originMovementId: row['origin_movement_id'] as String, triggerMovementId: row['trigger_movement_id'] as String, previousUnitCostNio: row['previous_unit_cost_nio'] as double, recalculatedUnitCostNio: row['recalculated_unit_cost_nio'] as double, deltaUnitCostNio: row['delta_unit_cost_nio'] as double, totalDeltaCostNio: row['total_delta_cost_nio'] as double, affectedQuantity: row['affected_quantity'] as double, lineageHash: row['lineage_hash'] as String, authorizedByUserId: row['authorized_by_user_id'] as String?, authorizedByRole: row['authorized_by_role'] as String?, authorizationMethod: row['authorization_method'] as String?, createdAt: row['created_at'] as String),
        arguments: [insumoId]);
  }

  @override
  Future<KardexCorrectionEntity?> findCorrectionByLineageHash(
      String lineageHash) async {
    return _queryAdapter.query(
        'SELECT * FROM kardex_corrections WHERE lineage_hash = ?1 LIMIT 1',
        mapper: (Map<String, Object?> row) => KardexCorrectionEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            originMovementId: row['origin_movement_id'] as String,
            triggerMovementId: row['trigger_movement_id'] as String,
            previousUnitCostNio: row['previous_unit_cost_nio'] as double,
            recalculatedUnitCostNio:
                row['recalculated_unit_cost_nio'] as double,
            deltaUnitCostNio: row['delta_unit_cost_nio'] as double,
            totalDeltaCostNio: row['total_delta_cost_nio'] as double,
            affectedQuantity: row['affected_quantity'] as double,
            lineageHash: row['lineage_hash'] as String,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            authorizationMethod: row['authorization_method'] as String?,
            createdAt: row['created_at'] as String),
        arguments: [lineageHash]);
  }

  @override
  Future<KardexCorrectionEntity?> findCorrectionById(String id) async {
    return _queryAdapter.query('SELECT * FROM kardex_corrections WHERE id = ?1',
        mapper: (Map<String, Object?> row) => KardexCorrectionEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            originMovementId: row['origin_movement_id'] as String,
            triggerMovementId: row['trigger_movement_id'] as String,
            previousUnitCostNio: row['previous_unit_cost_nio'] as double,
            recalculatedUnitCostNio:
                row['recalculated_unit_cost_nio'] as double,
            deltaUnitCostNio: row['delta_unit_cost_nio'] as double,
            totalDeltaCostNio: row['total_delta_cost_nio'] as double,
            affectedQuantity: row['affected_quantity'] as double,
            lineageHash: row['lineage_hash'] as String,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            authorizationMethod: row['authorization_method'] as String?,
            createdAt: row['created_at'] as String),
        arguments: [id]);
  }

  @override
  Future<List<KardexCorrectionEntity>> findAllCorrections() async {
    return _queryAdapter.queryList(
        'SELECT * FROM kardex_corrections ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => KardexCorrectionEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            originMovementId: row['origin_movement_id'] as String,
            triggerMovementId: row['trigger_movement_id'] as String,
            previousUnitCostNio: row['previous_unit_cost_nio'] as double,
            recalculatedUnitCostNio:
                row['recalculated_unit_cost_nio'] as double,
            deltaUnitCostNio: row['delta_unit_cost_nio'] as double,
            totalDeltaCostNio: row['total_delta_cost_nio'] as double,
            affectedQuantity: row['affected_quantity'] as double,
            lineageHash: row['lineage_hash'] as String,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            authorizationMethod: row['authorization_method'] as String?,
            createdAt: row['created_at'] as String));
  }

  @override
  Future<void> insertCorrection(KardexCorrectionEntity correction) async {
    await _kardexCorrectionEntityInsertionAdapter.insert(
        correction, OnConflictStrategy.abort);
  }

  @override
  Future<void> recordCorrectionWithLineage(
      KardexCorrectionEntity correction) async {
    if (database is sqflite.Transaction) {
      await super.recordCorrectionWithLineage(correction);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.kardexCorrectionDao
            .recordCorrectionWithLineage(correction);
      });
    }
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
                  'unit_cost_nio': item.unitCostNio,
                  'source_document_type': item.sourceDocumentType,
                  'source_document_id': item.sourceDocumentId,
                  'origin_movement_id': item.originMovementId,
                  'origin_invoice_item_id': item.originInvoiceItemId,
                  'batch_deductions': item.batch_deductions,
                  'estado_costeo': item.estadoCosteo,
                  'intentos_count': item.intentosCount,
                  'bloqueo_motivo': item.bloqueoMotivo,
                  'autorizado_por_usuario_id': item.autorizadoPorUsuarioId,
                  'fecha_autorizacion': item.fechaAutorizacion
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
                  'invoice_number': item.invoiceNumber,
                  'fiscal_authorization_code': item.fiscalAuthorizationCode,
                  'quantity': item.quantity,
                  'unit_cost': item.unitCost,
                  'timestamp': item.timestamp,
                  'invoice_date': item.invoiceDate,
                  'currency': item.currency,
                  'bcn_rate': item.bcnRate,
                  'fx_rate_mode': item.fxRateMode,
                  'unit_cost_nio': item.unitCostNio,
                  'cpp_before_nio': item.cppBeforeNio,
                  'projected_cpp_nio': item.projectedCppNio,
                  'lot_code': item.lotCode,
                  'received_date': item.receivedDate,
                  'expiration_date': item.expirationDate,
                  'requires_batch_tracking': item.requiresBatchTracking ? 1 : 0,
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
            invoiceNumber: row['invoice_number'] as String,
            fiscalAuthorizationCode:
                row['fiscal_authorization_code'] as String?,
            quantity: row['quantity'] as double,
            unitCost: row['unit_cost'] as double,
            timestamp: row['timestamp'] as String,
            invoiceDate: row['invoice_date'] as String,
            currency: row['currency'] as String,
            bcnRate: row['bcn_rate'] as double,
            fxRateMode: row['fx_rate_mode'] as String?,
            unitCostNio: row['unit_cost_nio'] as double?,
            cppBeforeNio: row['cpp_before_nio'] as double?,
            projectedCppNio: row['projected_cpp_nio'] as double?,
            lotCode: row['lot_code'] as String?,
            receivedDate: row['received_date'] as String?,
            expirationDate: row['expiration_date'] as String?,
            requiresBatchTracking: (row['requires_batch_tracking'] as int) != 0,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<PurchaseEntity>> findAllPurchases() async {
    return _queryAdapter.queryList(
        'SELECT * FROM purchases ORDER BY timestamp DESC',
        mapper: (Map<String, Object?> row) => PurchaseEntity(
            id: row['id'] as String,
            insumoId: row['insumo_id'] as String,
            supplierId: row['supplier_id'] as String,
            invoiceNumber: row['invoice_number'] as String,
            fiscalAuthorizationCode:
                row['fiscal_authorization_code'] as String?,
            quantity: row['quantity'] as double,
            unitCost: row['unit_cost'] as double,
            timestamp: row['timestamp'] as String,
            invoiceDate: row['invoice_date'] as String,
            currency: row['currency'] as String,
            bcnRate: row['bcn_rate'] as double,
            fxRateMode: row['fx_rate_mode'] as String?,
            unitCostNio: row['unit_cost_nio'] as double?,
            cppBeforeNio: row['cpp_before_nio'] as double?,
            projectedCppNio: row['projected_cpp_nio'] as double?,
            lotCode: row['lot_code'] as String?,
            receivedDate: row['received_date'] as String?,
            expirationDate: row['expiration_date'] as String?,
            requiresBatchTracking: (row['requires_batch_tracking'] as int) != 0,
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

class _$ProductionOrderDocumentDao extends ProductionOrderDocumentDao {
  _$ProductionOrderDocumentDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _productionOrderDocumentEntityInsertionAdapter = InsertionAdapter(
            database,
            'production_order_documents',
            (ProductionOrderDocumentEntity item) => <String, Object?>{
                  'id': item.id,
                  'recipe_version_id': item.recipeVersionId,
                  'recipe_product_id': item.recipeProductId,
                  'recipe_product_name': item.recipeProductName,
                  'produced_insumo_id': item.producedInsumoId,
                  'produced_insumo_name': item.producedInsumoName,
                  'planned_quantity': item.plannedQuantity,
                  'actual_quantity': item.actualQuantity,
                  'produced_batch_number': item.producedBatchNumber,
                  'produced_expiration_date': item.producedExpirationDate,
                  'operation_date': item.operationDate,
                  'status': item.status,
                  'outcome': item.outcome,
                  'failure_reason': item.failureReason,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'total_consumed_cost_nio': item.totalConsumedCostNio,
                  'produced_unit_cost_nio': item.producedUnitCostNio,
                  'variance_reason': item.varianceReason,
                  'closed_at': item.closedAt,
                  'movement_references_json': item.movementReferencesJson,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<ProductionOrderDocumentEntity>
      _productionOrderDocumentEntityInsertionAdapter;

  @override
  Future<List<ProductionOrderDocumentEntity>> findAllDocuments() async {
    return _queryAdapter.queryList(
        'SELECT * FROM production_order_documents ORDER BY operation_date DESC',
        mapper: (Map<String, Object?> row) => ProductionOrderDocumentEntity(
            id: row['id'] as String,
            recipeVersionId: row['recipe_version_id'] as String,
            recipeProductId: row['recipe_product_id'] as String,
            recipeProductName: row['recipe_product_name'] as String,
            producedInsumoId: row['produced_insumo_id'] as String,
            producedInsumoName: row['produced_insumo_name'] as String,
            plannedQuantity: row['planned_quantity'] as double,
            actualQuantity: row['actual_quantity'] as double,
            producedBatchNumber: row['produced_batch_number'] as String,
            producedExpirationDate: row['produced_expiration_date'] as String,
            operationDate: row['operation_date'] as String,
            status: row['status'] as String,
            outcome: row['outcome'] as String,
            failureReason: row['failure_reason'] as String?,
            terminalId: row['terminal_id'] as String,
            sourceSequence: row['source_sequence'] as int,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            totalConsumedCostNio: row['total_consumed_cost_nio'] as double,
            producedUnitCostNio: row['produced_unit_cost_nio'] as double,
            movementReferencesJson: row['movement_references_json'] as String,
            varianceReason: row['variance_reason'] as String?,
            closedAt: row['closed_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<List<ProductionOrderDocumentEntity>> findUnsynced() async {
    return _queryAdapter.queryList(
        'SELECT * FROM production_order_documents WHERE is_synced = 0 ORDER BY terminal_id ASC, source_sequence ASC, id ASC',
        mapper: (Map<String, Object?> row) => ProductionOrderDocumentEntity(
            id: row['id'] as String,
            recipeVersionId: row['recipe_version_id'] as String,
            recipeProductId: row['recipe_product_id'] as String,
            recipeProductName: row['recipe_product_name'] as String,
            producedInsumoId: row['produced_insumo_id'] as String,
            producedInsumoName: row['produced_insumo_name'] as String,
            plannedQuantity: row['planned_quantity'] as double,
            actualQuantity: row['actual_quantity'] as double,
            producedBatchNumber: row['produced_batch_number'] as String,
            producedExpirationDate: row['produced_expiration_date'] as String,
            operationDate: row['operation_date'] as String,
            status: row['status'] as String,
            outcome: row['outcome'] as String,
            failureReason: row['failure_reason'] as String?,
            terminalId: row['terminal_id'] as String,
            sourceSequence: row['source_sequence'] as int,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            totalConsumedCostNio: row['total_consumed_cost_nio'] as double,
            producedUnitCostNio: row['produced_unit_cost_nio'] as double,
            movementReferencesJson: row['movement_references_json'] as String,
            varianceReason: row['variance_reason'] as String?,
            closedAt: row['closed_at'] as String?,
            isSynced: (row['is_synced'] as int) != 0));
  }

  @override
  Future<int?> findMaxSourceSequence(String terminalId) async {
    return _queryAdapter.query(
        'SELECT COALESCE(MAX(source_sequence), 0) FROM production_order_documents WHERE terminal_id = ?1 AND source_sequence > 0',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [terminalId]);
  }

  @override
  Future<void> markAsSynced(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE production_order_documents SET is_synced = 1 WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> upsertDocument(ProductionOrderDocumentEntity entity) async {
    await _productionOrderDocumentEntityInsertionAdapter.insert(
        entity, OnConflictStrategy.replace);
  }
}

class _$ProductionTransactionDao extends ProductionTransactionDao {
  _$ProductionTransactionDao(
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
                  'unit_cost_nio': item.unitCostNio,
                  'source_document_type': item.sourceDocumentType,
                  'source_document_id': item.sourceDocumentId,
                  'origin_movement_id': item.originMovementId,
                  'origin_invoice_item_id': item.originInvoiceItemId,
                  'batch_deductions': item.batch_deductions,
                  'estado_costeo': item.estadoCosteo,
                  'intentos_count': item.intentosCount,
                  'bloqueo_motivo': item.bloqueoMotivo,
                  'autorizado_por_usuario_id': item.autorizadoPorUsuarioId,
                  'fecha_autorizacion': item.fechaAutorizacion
                }),
        _productionOrderDocumentEntityInsertionAdapter = InsertionAdapter(
            database,
            'production_order_documents',
            (ProductionOrderDocumentEntity item) => <String, Object?>{
                  'id': item.id,
                  'recipe_version_id': item.recipeVersionId,
                  'recipe_product_id': item.recipeProductId,
                  'recipe_product_name': item.recipeProductName,
                  'produced_insumo_id': item.producedInsumoId,
                  'produced_insumo_name': item.producedInsumoName,
                  'planned_quantity': item.plannedQuantity,
                  'actual_quantity': item.actualQuantity,
                  'produced_batch_number': item.producedBatchNumber,
                  'produced_expiration_date': item.producedExpirationDate,
                  'operation_date': item.operationDate,
                  'status': item.status,
                  'outcome': item.outcome,
                  'failure_reason': item.failureReason,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'total_consumed_cost_nio': item.totalConsumedCostNio,
                  'produced_unit_cost_nio': item.producedUnitCostNio,
                  'variance_reason': item.varianceReason,
                  'closed_at': item.closedAt,
                  'movement_references_json': item.movementReferencesJson,
                  'is_synced': item.isSynced ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<MovementEntity> _movementEntityInsertionAdapter;

  final InsertionAdapter<ProductionOrderDocumentEntity>
      _productionOrderDocumentEntityInsertionAdapter;

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
  Future<int?> findMaxSourceSequence(String terminalId) async {
    return _queryAdapter.query(
        'SELECT COALESCE(MAX(source_sequence), 0) FROM production_order_documents WHERE terminal_id = ?1 AND source_sequence > 0',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [terminalId]);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.abort);
  }

  @override
  Future<void> upsertDocument(ProductionOrderDocumentEntity document) async {
    await _productionOrderDocumentEntityInsertionAdapter.insert(
        document, OnConflictStrategy.replace);
  }

  @override
  Future<void> executeProductionCloseTransaction(
    List<MovementEntity> movements,
    ProductionOrderDocumentEntity document,
    bool shouldFail,
  ) async {
    if (database is sqflite.Transaction) {
      await super
          .executeProductionCloseTransaction(movements, document, shouldFail);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.productionTransactionDao
            .executeProductionCloseTransaction(movements, document, shouldFail);
      });
    }
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
  Future<void> deleteConversionById(String id) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM uom_conversions WHERE id = ?1',
        arguments: [id]);
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
                  'received_date': item.receivedDate,
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
                  'received_date': item.receivedDate,
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
        mapper: (Map<String, Object?> row) => BatchEntity(id: row['id'] as String, insumoId: row['insumo_id'] as String, batchNumber: row['batch_number'] as String, receivedDate: row['received_date'] as String?, expirationDate: row['expiration_date'] as String, remainingStock: row['remaining_stock'] as double, cost: row['cost'] as double, isSynced: (row['is_synced'] as int) != 0),
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

class _$CatalogValueDao extends CatalogValueDao {
  _$CatalogValueDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _catalogValueEntityInsertionAdapter = InsertionAdapter(
            database,
            'catalog_values',
            (CatalogValueEntity item) => <String, Object?>{
                  'id': item.id,
                  'catalog_type': item.catalogType,
                  'code': item.code,
                  'name': item.name,
                  'is_active': item.isActive ? 1 : 0,
                  'sort_order': item.sortOrder
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CatalogValueEntity>
      _catalogValueEntityInsertionAdapter;

  @override
  Future<List<CatalogValueEntity>> findActiveByType(String type) async {
    return _queryAdapter.queryList(
        'SELECT * FROM catalog_values WHERE catalog_type = ?1 AND is_active = 1 ORDER BY sort_order ASC, name ASC',
        mapper: (Map<String, Object?> row) => CatalogValueEntity(id: row['id'] as String, catalogType: row['catalog_type'] as String, code: row['code'] as String, name: row['name'] as String, isActive: (row['is_active'] as int) != 0, sortOrder: row['sort_order'] as int),
        arguments: [type]);
  }

  @override
  Future<List<CatalogValueEntity>> findAllByType(String type) async {
    return _queryAdapter.queryList(
        'SELECT * FROM catalog_values WHERE catalog_type = ?1 ORDER BY sort_order ASC, name ASC',
        mapper: (Map<String, Object?> row) => CatalogValueEntity(id: row['id'] as String, catalogType: row['catalog_type'] as String, code: row['code'] as String, name: row['name'] as String, isActive: (row['is_active'] as int) != 0, sortOrder: row['sort_order'] as int),
        arguments: [type]);
  }

  @override
  Future<CatalogValueEntity?> findByTypeAndCode(
    String type,
    String code,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM catalog_values WHERE catalog_type = ?1 AND code = ?2 LIMIT 1',
        mapper: (Map<String, Object?> row) => CatalogValueEntity(id: row['id'] as String, catalogType: row['catalog_type'] as String, code: row['code'] as String, name: row['name'] as String, isActive: (row['is_active'] as int) != 0, sortOrder: row['sort_order'] as int),
        arguments: [type, code]);
  }

  @override
  Future<void> setActive(
    String id,
    bool isActive,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE catalog_values SET is_active = ?2 WHERE id = ?1',
        arguments: [id, isActive ? 1 : 0]);
  }

  @override
  Future<int?> countAll() async {
    return _queryAdapter.query('SELECT COUNT(*) FROM catalog_values',
        mapper: (Map<String, Object?> row) => row.values.first as int);
  }

  @override
  Future<void> insertCatalogValues(List<CatalogValueEntity> values) async {
    await _catalogValueEntityInsertionAdapter.insertList(
        values, OnConflictStrategy.replace);
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
                  'related_invoice_id': item.relatedInvoiceId,
                  'origin_invoice_id': item.originInvoiceId,
                  'refund_reason_policy': item.refundReasonPolicy,
                  'refund_reason_code': item.refundReasonCode,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'authorized_by_role': item.authorizedByRole,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'bcn_official_rate': item.bcnOfficialRate,
                  'commercial_rate': item.commercialRate,
                  'total_usd': item.totalUsd
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
                  'related_invoice_id': item.relatedInvoiceId,
                  'origin_invoice_id': item.originInvoiceId,
                  'refund_reason_policy': item.refundReasonPolicy,
                  'refund_reason_code': item.refundReasonCode,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'authorized_by_role': item.authorizedByRole,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'bcn_official_rate': item.bcnOfficialRate,
                  'commercial_rate': item.commercialRate,
                  'total_usd': item.totalUsd
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double));
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
        arguments: [startTime, endTime]);
  }

  @override
  Future<List<InvoiceEntity>> getInvoicesByUserId(String userId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoices WHERE user_id = ?1 ORDER BY created_at DESC',
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
        arguments: [userId]);
  }

  @override
  Future<String?> getLastInvoiceNumber() async {
    return _queryAdapter.query('SELECT MAX(invoice_number) FROM invoices',
        mapper: (Map<String, Object?> row) => row.values.first as String);
  }

  @override
  Future<void> updateSyncStatusForIds(
    List<String> ids,
    String status,
  ) async {
    const offset = 2;
    final _sqliteVariablesForIds =
        Iterable<String>.generate(ids.length, (i) => '?${i + offset}')
            .join(',');
    await _queryAdapter.queryNoReturn(
        'UPDATE invoices SET sync_status = ?1 WHERE id IN (' +
            _sqliteVariablesForIds +
            ')',
        arguments: [status, ...ids]);
  }

  @override
  Future<void> insertInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityInsertionAdapter.insert(
        invoice, OnConflictStrategy.abort);
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
                  'notes': item.notes,
                  'recipe_version_id': item.recipeVersionId,
                  'origin_invoice_item_id': item.originInvoiceItemId
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
            notes: row['notes'] as String?,
            recipeVersionId: row['recipe_version_id'] as String?,
            originInvoiceItemId: row['origin_invoice_item_id'] as String?),
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
                  'amount_nio': item.amountNio,
                  'change_given': item.changeGiven,
                  'change_currency': item.changeCurrency,
                  'voucher_code': item.voucherCode,
                  'card_brand': item.cardBrand,
                  'card_type': item.cardType,
                  'bank_pos': item.bankPos,
                  'reconciliation_status': item.reconciliationStatus,
                  'last4': item.last4,
                  'batch_number': item.batchNumber,
                  'reconciled_at': item.reconciledAt,
                  'reconciled_by_user_id': item.reconciledByUserId,
                  'created_at': item.createdAt
                }),
        _paymentEntityUpdateAdapter = UpdateAdapter(
            database,
            'payments',
            ['id'],
            (PaymentEntity item) => <String, Object?>{
                  'id': item.id,
                  'invoice_id': item.invoiceId,
                  'method': item.method,
                  'amount': item.amount,
                  'currency': item.currency,
                  'exchange_rate': item.exchangeRate,
                  'amount_nio': item.amountNio,
                  'change_given': item.changeGiven,
                  'change_currency': item.changeCurrency,
                  'voucher_code': item.voucherCode,
                  'card_brand': item.cardBrand,
                  'card_type': item.cardType,
                  'bank_pos': item.bankPos,
                  'reconciliation_status': item.reconciliationStatus,
                  'last4': item.last4,
                  'batch_number': item.batchNumber,
                  'reconciled_at': item.reconciledAt,
                  'reconciled_by_user_id': item.reconciledByUserId,
                  'created_at': item.createdAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<PaymentEntity> _paymentEntityInsertionAdapter;

  final UpdateAdapter<PaymentEntity> _paymentEntityUpdateAdapter;

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
            amountNio: row['amount_nio'] as double,
            changeGiven: row['change_given'] as double,
            changeCurrency: row['change_currency'] as String,
            voucherCode: row['voucher_code'] as String?,
            cardBrand: row['card_brand'] as String?,
            cardType: row['card_type'] as String?,
            bankPos: row['bank_pos'] as String?,
            reconciliationStatus: row['reconciliation_status'] as String?,
            last4: row['last4'] as String?,
            batchNumber: row['batch_number'] as String?,
            reconciledAt: row['reconciled_at'] as int?,
            reconciledByUserId: row['reconciled_by_user_id'] as String?,
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
        mapper: (Map<String, Object?> row) => PaymentEntity(id: row['id'] as String, invoiceId: row['invoice_id'] as String, method: row['method'] as String, amount: row['amount'] as double, currency: row['currency'] as String, exchangeRate: row['exchange_rate'] as double, amountNio: row['amount_nio'] as double, changeGiven: row['change_given'] as double, changeCurrency: row['change_currency'] as String, voucherCode: row['voucher_code'] as String?, cardBrand: row['card_brand'] as String?, cardType: row['card_type'] as String?, bankPos: row['bank_pos'] as String?, reconciliationStatus: row['reconciliation_status'] as String?, last4: row['last4'] as String?, batchNumber: row['batch_number'] as String?, reconciledAt: row['reconciled_at'] as int?, reconciledByUserId: row['reconciled_by_user_id'] as String?, createdAt: row['created_at'] as int?),
        arguments: [startTime, endTime]);
  }

  @override
  Future<List<PaymentEntity>> getPendingCardPayments() async {
    return _queryAdapter.queryList(
        'SELECT * FROM payments WHERE method = \'card\' AND reconciliation_status = \'PENDIENTE\' ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => PaymentEntity(
            id: row['id'] as String,
            invoiceId: row['invoice_id'] as String,
            method: row['method'] as String,
            amount: row['amount'] as double,
            currency: row['currency'] as String,
            exchangeRate: row['exchange_rate'] as double,
            amountNio: row['amount_nio'] as double,
            changeGiven: row['change_given'] as double,
            changeCurrency: row['change_currency'] as String,
            voucherCode: row['voucher_code'] as String?,
            cardBrand: row['card_brand'] as String?,
            cardType: row['card_type'] as String?,
            bankPos: row['bank_pos'] as String?,
            reconciliationStatus: row['reconciliation_status'] as String?,
            last4: row['last4'] as String?,
            batchNumber: row['batch_number'] as String?,
            reconciledAt: row['reconciled_at'] as int?,
            reconciledByUserId: row['reconciled_by_user_id'] as String?,
            createdAt: row['created_at'] as int?));
  }

  @override
  Future<int?> countPendingCardPayments() async {
    return _queryAdapter.query(
        'SELECT COUNT(*) FROM payments WHERE method = \'card\' AND reconciliation_status = \'PENDIENTE\'',
        mapper: (Map<String, Object?> row) => row.values.first as int);
  }

  @override
  Future<void> insertPayments(List<PaymentEntity> payments) async {
    await _paymentEntityInsertionAdapter.insertList(
        payments, OnConflictStrategy.replace);
  }

  @override
  Future<void> updatePayment(PaymentEntity payment) async {
    await _paymentEntityUpdateAdapter.update(
        payment, OnConflictStrategy.replace);
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
                  'related_invoice_id': item.relatedInvoiceId,
                  'origin_invoice_id': item.originInvoiceId,
                  'refund_reason_policy': item.refundReasonPolicy,
                  'refund_reason_code': item.refundReasonCode,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'authorized_by_role': item.authorizedByRole,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'bcn_official_rate': item.bcnOfficialRate,
                  'commercial_rate': item.commercialRate,
                  'total_usd': item.totalUsd
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
                  'notes': item.notes,
                  'recipe_version_id': item.recipeVersionId,
                  'origin_invoice_item_id': item.originInvoiceItemId
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
                  'amount_nio': item.amountNio,
                  'change_given': item.changeGiven,
                  'change_currency': item.changeCurrency,
                  'voucher_code': item.voucherCode,
                  'card_brand': item.cardBrand,
                  'card_type': item.cardType,
                  'bank_pos': item.bankPos,
                  'reconciliation_status': item.reconciliationStatus,
                  'last4': item.last4,
                  'batch_number': item.batchNumber,
                  'reconciled_at': item.reconciledAt,
                  'reconciled_by_user_id': item.reconciledByUserId,
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
                  'unit_cost_nio': item.unitCostNio,
                  'source_document_type': item.sourceDocumentType,
                  'source_document_id': item.sourceDocumentId,
                  'origin_movement_id': item.originMovementId,
                  'origin_invoice_item_id': item.originInvoiceItemId,
                  'batch_deductions': item.batch_deductions,
                  'estado_costeo': item.estadoCosteo,
                  'intentos_count': item.intentosCount,
                  'bloqueo_motivo': item.bloqueoMotivo,
                  'autorizado_por_usuario_id': item.autorizadoPorUsuarioId,
                  'fecha_autorizacion': item.fechaAutorizacion
                }),
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
                  'is_synced': item.isSynced ? 1 : 0,
                  'sequence_no': item.sequenceNo,
                  'prev_hash': item.prevHash,
                  'entry_hash': item.entryHash,
                  'metodo_autorizacion': item.metodoAutorizacion,
                  'usuario_autorizador_id': item.usuarioAutorizadorId,
                  'remote_ref_uuid': item.remoteRefUuid,
                  'hash_version': item.hashVersion,
                  'has_metodo_autorizacion': item.hasMetodoAutorizacion == null
                      ? null
                      : (item.hasMetodoAutorizacion! ? 1 : 0),
                  'has_usuario_autorizador_id':
                      item.hasUsuarioAutorizadorId == null
                          ? null
                          : (item.hasUsuarioAutorizadorId! ? 1 : 0),
                  'tenant_id': item.tenantId,
                  'metadata_raw': item.metadataRaw
                }),
        _fulfillmentRecordEntityInsertionAdapter = InsertionAdapter(
            database,
            'fulfillment_records',
            (FulfillmentRecordEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'sale_id': item.saleId,
                  'topology_snapshot_id': item.topologySnapshotId,
                  'topology_revision': item.topologyRevision,
                  'channel': item.channel,
                  'route_state': item.routeState,
                  'delivery_state': item.deliveryState,
                  'lines_payload': item.linesPayload
                }),
        _printJobEntityInsertionAdapter = InsertionAdapter(
            database,
            'print_jobs',
            (PrintJobEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'fulfillment_id': item.fulfillmentId,
                  'document_kind': item.documentKind,
                  'sequence': item.sequence,
                  'payload': item.payload,
                  'state': item.state,
                  'retry_count': item.retryCount,
                  'idempotency_key': item.idempotencyKey
                }),
        _outboxEventEntityInsertionAdapter = InsertionAdapter(
            database,
            'fulfillment_outbox_events',
            (OutboxEventEntity item) => <String, Object?>{
                  'event_id': item.eventId,
                  'tenant_id': item.tenantId,
                  'device_id': item.deviceId,
                  'source_sequence': item.sourceSequence,
                  'aggregate_type': item.aggregateType,
                  'aggregate_id': item.aggregateId,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'topology_revision': item.topologyRevision,
                  'state': item.state,
                  'attempts': item.attempts
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
                  'related_invoice_id': item.relatedInvoiceId,
                  'origin_invoice_id': item.originInvoiceId,
                  'refund_reason_policy': item.refundReasonPolicy,
                  'refund_reason_code': item.refundReasonCode,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'authorized_by_role': item.authorizedByRole,
                  'terminal_id': item.terminalId,
                  'source_sequence': item.sourceSequence,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'bcn_official_rate': item.bcnOfficialRate,
                  'commercial_rate': item.commercialRate,
                  'total_usd': item.totalUsd
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
                  'stock_min': item.stockMin,
                  'stock_max': item.stockMax,
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

  final InsertionAdapter<AuditLogEntity> _auditLogEntityInsertionAdapter;

  final InsertionAdapter<FulfillmentRecordEntity>
      _fulfillmentRecordEntityInsertionAdapter;

  final InsertionAdapter<PrintJobEntity> _printJobEntityInsertionAdapter;

  final InsertionAdapter<OutboxEventEntity> _outboxEventEntityInsertionAdapter;

  final UpdateAdapter<InvoiceEntity> _invoiceEntityUpdateAdapter;

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
            stockMin: row['stock_min'] as double?,
            stockMax: row['stock_max'] as double?,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
        arguments: [id]);
  }

  @override
  Future<List<InvoiceEntity>> getCreditNotesByRelatedId(
      String relatedId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM invoices WHERE related_invoice_id = ?1',
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
            relatedInvoiceId: row['related_invoice_id'] as String?,
            originInvoiceId: row['origin_invoice_id'] as String?,
            refundReasonPolicy: row['refund_reason_policy'] as String?,
            refundReasonCode: row['refund_reason_code'] as String?,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            authorizedByRole: row['authorized_by_role'] as String?,
            terminalId: row['terminal_id'] as String?,
            sourceSequence: row['source_sequence'] as int?,
            idempotencyKey: row['idempotency_key'] as String?,
            payloadHash: row['payload_hash'] as String?,
            bcnOfficialRate: row['bcn_official_rate'] as double,
            commercialRate: row['commercial_rate'] as double,
            totalUsd: row['total_usd'] as double),
        arguments: [relatedId]);
  }

  @override
  Future<int?> getNextInvoiceSourceSequence(String terminalId) async {
    return _queryAdapter.query(
        'SELECT COALESCE(MAX(source_sequence), 0) + 1 FROM invoices WHERE terminal_id = ?1 AND source_sequence > 0',
        mapper: (Map<String, Object?> row) => row.values.first as int,
        arguments: [terminalId]);
  }

  @override
  Future<void> advanceDgiCurrentNumber(String nextSequence) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE local_configs SET value = ?1 WHERE `key` = \'dgi_current_number\'',
        arguments: [nextSequence]);
  }

  @override
  Future<String?> getDgiConfig(String key) async {
    return _queryAdapter.query(
        'SELECT value FROM local_configs WHERE `key` = ?1',
        mapper: (Map<String, Object?> row) => row.values.first as String,
        arguments: [key]);
  }

  @override
  Future<String?> getOriginalMovementId(
    String invoiceId,
    String insumoId,
  ) async {
    return _queryAdapter.query(
        'SELECT id FROM inventory_movements WHERE source_document_id = ?1 AND insumo_id = ?2 AND origin_movement_id IS NULL ORDER BY timestamp DESC LIMIT 1',
        mapper: (Map<String, Object?> row) => row.values.first as String,
        arguments: [invoiceId, insumoId]);
  }

  @override
  Future<OutboxEventEntity?> findReplay(
    String tenantId,
    String idempotencyKey,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM fulfillment_outbox_events WHERE tenant_id = ?1 AND idempotency_key = ?2',
        mapper: (Map<String, Object?> row) => OutboxEventEntity(eventId: row['event_id'] as String, tenantId: row['tenant_id'] as String, deviceId: row['device_id'] as String, sourceSequence: row['source_sequence'] as int, aggregateType: row['aggregate_type'] as String, aggregateId: row['aggregate_id'] as String, idempotencyKey: row['idempotency_key'] as String, payloadHash: row['payload_hash'] as String, topologyRevision: row['topology_revision'] as int, state: row['state'] as String, attempts: row['attempts'] as int),
        arguments: [tenantId, idempotencyKey]);
  }

  @override
  Future<void> insertInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityInsertionAdapter.insert(
        invoice, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertInvoiceItems(List<InvoiceItemEntity> items) async {
    await _invoiceItemEntityInsertionAdapter.insertList(
        items, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertInvoiceItemModifiers(
      List<InvoiceItemModifierEntity> modifiers) async {
    await _invoiceItemModifierEntityInsertionAdapter.insertList(
        modifiers, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertPayments(List<PaymentEntity> payments) async {
    await _paymentEntityInsertionAdapter.insertList(
        payments, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertMovement(MovementEntity movement) async {
    await _movementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertAuditLog(AuditLogEntity log) async {
    await _auditLogEntityInsertionAdapter.insert(
        log, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertFulfillment(FulfillmentRecordEntity fulfillment) async {
    await _fulfillmentRecordEntityInsertionAdapter.insert(
        fulfillment, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertPrintJob(PrintJobEntity job) async {
    await _printJobEntityInsertionAdapter.insert(job, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertOutboxEvent(OutboxEventEntity outbox) async {
    await _outboxEventEntityInsertionAdapter.insert(
        outbox, OnConflictStrategy.abort);
  }

  @override
  Future<void> updateInvoice(InvoiceEntity invoice) async {
    await _invoiceEntityUpdateAdapter.update(
        invoice, OnConflictStrategy.replace);
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
    AuditLogEntity? auditLog,
    bool shouldFail,
  ) async {
    if (database is sqflite.Transaction) {
      await super.executeSaleTransaction(
          invoice, items, modifiers, payments, movements, auditLog, shouldFail);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.salesTransactionDao.executeSaleTransaction(
            invoice,
            items,
            modifiers,
            payments,
            movements,
            auditLog,
            shouldFail);
      });
    }
  }

  @override
  Future<void> executeSaleWithDgiTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    String nextDgiSequence,
    bool shouldFail,
  ) async {
    if (database is sqflite.Transaction) {
      await super.executeSaleWithDgiTransaction(invoice, items, modifiers,
          payments, movements, auditLog, nextDgiSequence, shouldFail);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.salesTransactionDao
            .executeSaleWithDgiTransaction(invoice, items, modifiers, payments,
                movements, auditLog, nextDgiSequence, shouldFail);
      });
    }
  }

  @override
  Future<void> executeFulfillmentSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    FulfillmentRecordEntity fulfillment,
    List<PrintJobEntity> printJobs,
    OutboxEventEntity outbox,
    bool shouldFail,
  ) async {
    if (database is sqflite.Transaction) {
      await super.executeFulfillmentSaleTransaction(
          invoice,
          items,
          modifiers,
          payments,
          movements,
          auditLog,
          fulfillment,
          printJobs,
          outbox,
          shouldFail);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.salesTransactionDao
            .executeFulfillmentSaleTransaction(
                invoice,
                items,
                modifiers,
                payments,
                movements,
                auditLog,
                fulfillment,
                printJobs,
                outbox,
                shouldFail);
      });
    }
  }

  @override
  Future<void> executeVoidTransaction(
    List<MovementEntity> movements,
    InvoiceEntity canceledInvoice,
    AuditLogEntity? auditLog,
    bool shouldFail,
  ) async {
    if (database is sqflite.Transaction) {
      await super.executeVoidTransaction(
          movements, canceledInvoice, auditLog, shouldFail);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.salesTransactionDao.executeVoidTransaction(
            movements, canceledInvoice, auditLog, shouldFail);
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
                  'terminal_id': item.terminalId,
                  'opened_at': item.openedAt,
                  'tipo_modelo': item.tipoModelo,
                  'closed_at': item.closedAt,
                  'opening_balance_nio': item.openingBalanceNio,
                  'opening_balance_usd': item.openingBalanceUsd,
                  'closing_counted_nio': item.closingCountedNio,
                  'closing_counted_usd': item.closingCountedUsd,
                  'expected_nio': item.expectedNio,
                  'expected_usd': item.expectedUsd,
                  'difference_nio': item.differenceNio,
                  'difference_usd': item.differenceUsd,
                  'z_report_sequence': item.zReportSequence,
                  'is_closed': item.isClosed ? 1 : 0,
                  'supervisor_id': item.supervisorId,
                  'notes': item.notes,
                  'sync_status': item.syncStatus
                }),
        _cashierSessionEntityUpdateAdapter = UpdateAdapter(
            database,
            'cashier_sessions',
            ['id'],
            (CashierSessionEntity item) => <String, Object?>{
                  'id': item.id,
                  'user_id': item.userId,
                  'terminal_id': item.terminalId,
                  'opened_at': item.openedAt,
                  'tipo_modelo': item.tipoModelo,
                  'closed_at': item.closedAt,
                  'opening_balance_nio': item.openingBalanceNio,
                  'opening_balance_usd': item.openingBalanceUsd,
                  'closing_counted_nio': item.closingCountedNio,
                  'closing_counted_usd': item.closingCountedUsd,
                  'expected_nio': item.expectedNio,
                  'expected_usd': item.expectedUsd,
                  'difference_nio': item.differenceNio,
                  'difference_usd': item.differenceUsd,
                  'z_report_sequence': item.zReportSequence,
                  'is_closed': item.isClosed ? 1 : 0,
                  'supervisor_id': item.supervisorId,
                  'notes': item.notes,
                  'sync_status': item.syncStatus
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
            terminalId: row['terminal_id'] as String,
            openedAt: row['opened_at'] as int,
            tipoModelo: row['tipo_modelo'] as String,
            closedAt: row['closed_at'] as int?,
            openingBalanceNio: row['opening_balance_nio'] as double?,
            openingBalanceUsd: row['opening_balance_usd'] as double,
            closingCountedNio: row['closing_counted_nio'] as double?,
            closingCountedUsd: row['closing_counted_usd'] as double?,
            expectedNio: row['expected_nio'] as double?,
            expectedUsd: row['expected_usd'] as double,
            differenceNio: row['difference_nio'] as double?,
            differenceUsd: row['difference_usd'] as double?,
            zReportSequence: row['z_report_sequence'] as int?,
            isClosed: (row['is_closed'] as int) != 0,
            supervisorId: row['supervisor_id'] as String?,
            notes: row['notes'] as String?,
            syncStatus: row['sync_status'] as String),
        arguments: [id]);
  }

  @override
  Future<CashierSessionEntity?> getActiveSession() async {
    return _queryAdapter.query(
        'SELECT * FROM cashier_sessions WHERE is_closed = 0 LIMIT 1',
        mapper: (Map<String, Object?> row) => CashierSessionEntity(
            id: row['id'] as String,
            userId: row['user_id'] as String,
            terminalId: row['terminal_id'] as String,
            openedAt: row['opened_at'] as int,
            tipoModelo: row['tipo_modelo'] as String,
            closedAt: row['closed_at'] as int?,
            openingBalanceNio: row['opening_balance_nio'] as double?,
            openingBalanceUsd: row['opening_balance_usd'] as double,
            closingCountedNio: row['closing_counted_nio'] as double?,
            closingCountedUsd: row['closing_counted_usd'] as double?,
            expectedNio: row['expected_nio'] as double?,
            expectedUsd: row['expected_usd'] as double,
            differenceNio: row['difference_nio'] as double?,
            differenceUsd: row['difference_usd'] as double?,
            zReportSequence: row['z_report_sequence'] as int?,
            isClosed: (row['is_closed'] as int) != 0,
            supervisorId: row['supervisor_id'] as String?,
            notes: row['notes'] as String?,
            syncStatus: row['sync_status'] as String));
  }

  @override
  Future<List<CashierSessionEntity>> getAllSessions() async {
    return _queryAdapter.queryList(
        'SELECT * FROM cashier_sessions ORDER BY opened_at DESC',
        mapper: (Map<String, Object?> row) => CashierSessionEntity(
            id: row['id'] as String,
            userId: row['user_id'] as String,
            terminalId: row['terminal_id'] as String,
            openedAt: row['opened_at'] as int,
            tipoModelo: row['tipo_modelo'] as String,
            closedAt: row['closed_at'] as int?,
            openingBalanceNio: row['opening_balance_nio'] as double?,
            openingBalanceUsd: row['opening_balance_usd'] as double,
            closingCountedNio: row['closing_counted_nio'] as double?,
            closingCountedUsd: row['closing_counted_usd'] as double?,
            expectedNio: row['expected_nio'] as double?,
            expectedUsd: row['expected_usd'] as double,
            differenceNio: row['difference_nio'] as double?,
            differenceUsd: row['difference_usd'] as double?,
            zReportSequence: row['z_report_sequence'] as int?,
            isClosed: (row['is_closed'] as int) != 0,
            supervisorId: row['supervisor_id'] as String?,
            notes: row['notes'] as String?,
            syncStatus: row['sync_status'] as String));
  }

  @override
  Future<int?> countClosedSessions() async {
    return _queryAdapter.query(
        'SELECT COUNT(*) FROM cashier_sessions WHERE is_closed = 1',
        mapper: (Map<String, Object?> row) => row.values.first as int);
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

class _$CashMovementDao extends CashMovementDao {
  _$CashMovementDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _cashMovementEntityInsertionAdapter = InsertionAdapter(
            database,
            'cash_movements',
            (CashMovementEntity item) => <String, Object?>{
                  'id': item.id,
                  'shift_id': item.shiftId,
                  'terminal_id': item.terminalId,
                  'type': item.type,
                  'amount_nio': item.amountNio,
                  'amount_usd': item.amountUsd,
                  'reason': item.reason,
                  'authorized_by_user_id': item.authorizedByUserId,
                  'timestamp': item.timestamp,
                  'sync_status': item.syncStatus
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CashMovementEntity>
      _cashMovementEntityInsertionAdapter;

  @override
  Future<CashMovementEntity?> getMovementById(String id) async {
    return _queryAdapter.query('SELECT * FROM cash_movements WHERE id = ?1',
        mapper: (Map<String, Object?> row) => CashMovementEntity(
            id: row['id'] as String,
            shiftId: row['shift_id'] as String,
            terminalId: row['terminal_id'] as String,
            type: row['type'] as String,
            amountNio: row['amount_nio'] as double,
            amountUsd: row['amount_usd'] as double,
            reason: row['reason'] as String,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            timestamp: row['timestamp'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [id]);
  }

  @override
  Future<List<CashMovementEntity>> getMovementsByShiftId(String shiftId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM cash_movements WHERE shift_id = ?1 ORDER BY timestamp ASC',
        mapper: (Map<String, Object?> row) => CashMovementEntity(id: row['id'] as String, shiftId: row['shift_id'] as String, terminalId: row['terminal_id'] as String, type: row['type'] as String, amountNio: row['amount_nio'] as double, amountUsd: row['amount_usd'] as double, reason: row['reason'] as String, authorizedByUserId: row['authorized_by_user_id'] as String?, timestamp: row['timestamp'] as int, syncStatus: row['sync_status'] as String),
        arguments: [shiftId]);
  }

  @override
  Future<List<CashMovementEntity>> getMovementsBySyncStatus(
      String status) async {
    return _queryAdapter.queryList(
        'SELECT * FROM cash_movements WHERE sync_status = ?1',
        mapper: (Map<String, Object?> row) => CashMovementEntity(
            id: row['id'] as String,
            shiftId: row['shift_id'] as String,
            terminalId: row['terminal_id'] as String,
            type: row['type'] as String,
            amountNio: row['amount_nio'] as double,
            amountUsd: row['amount_usd'] as double,
            reason: row['reason'] as String,
            authorizedByUserId: row['authorized_by_user_id'] as String?,
            timestamp: row['timestamp'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [status]);
  }

  @override
  Future<void> updateSyncStatus(
    String id,
    String status,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE cash_movements SET sync_status = ?2 WHERE id = ?1',
        arguments: [id, status]);
  }

  @override
  Future<void> insertMovement(CashMovementEntity movement) async {
    await _cashMovementEntityInsertionAdapter.insert(
        movement, OnConflictStrategy.replace);
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
                  'updated_at': item.updatedAt,
                  'table_id': item.tableId,
                  'area_id': item.areaId,
                  'waiter_id': item.waiterId,
                  'waiter_name': item.waiterName,
                  'guest_count': item.guestCount,
                  'global_tax_exempt': item.isGlobalTaxExempt ? 1 : 0,
                  'version': item.version
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
                  'tax_rate': item.taxRate,
                  'variant_id': item.variantId,
                  'notes': item.notes,
                  'modifiers_json': item.modifiersJson
                }),
        _holdTicketEntityUpdateAdapter = UpdateAdapter(
            database,
            'hold_tickets',
            ['id'],
            (HoldTicketEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt,
                  'table_id': item.tableId,
                  'area_id': item.areaId,
                  'waiter_id': item.waiterId,
                  'waiter_name': item.waiterName,
                  'guest_count': item.guestCount,
                  'global_tax_exempt': item.isGlobalTaxExempt ? 1 : 0,
                  'version': item.version
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<HoldTicketEntity> _holdTicketEntityInsertionAdapter;

  final InsertionAdapter<HoldTicketItemEntity>
      _holdTicketItemEntityInsertionAdapter;

  final UpdateAdapter<HoldTicketEntity> _holdTicketEntityUpdateAdapter;

  @override
  Future<List<HoldTicketEntity>> getAllHoldTickets() async {
    return _queryAdapter.queryList(
        'SELECT * FROM hold_tickets ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => HoldTicketEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int?,
            tableId: row['table_id'] as String?,
            areaId: row['area_id'] as String?,
            waiterId: row['waiter_id'] as String?,
            waiterName: row['waiter_name'] as String?,
            guestCount: row['guest_count'] as int,
            isGlobalTaxExempt: (row['global_tax_exempt'] as int) != 0,
            version: row['version'] as int));
  }

  @override
  Future<HoldTicketEntity?> getHoldTicketById(String id) async {
    return _queryAdapter.query('SELECT * FROM hold_tickets WHERE id = ?1',
        mapper: (Map<String, Object?> row) => HoldTicketEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int?,
            tableId: row['table_id'] as String?,
            areaId: row['area_id'] as String?,
            waiterId: row['waiter_id'] as String?,
            waiterName: row['waiter_name'] as String?,
            guestCount: row['guest_count'] as int,
            isGlobalTaxExempt: (row['global_tax_exempt'] as int) != 0,
            version: row['version'] as int),
        arguments: [id]);
  }

  @override
  Future<HoldTicketEntity?> getHoldTicketByTableId(String tableId) async {
    return _queryAdapter.query('SELECT * FROM hold_tickets WHERE table_id = ?1',
        mapper: (Map<String, Object?> row) => HoldTicketEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int?,
            tableId: row['table_id'] as String?,
            areaId: row['area_id'] as String?,
            waiterId: row['waiter_id'] as String?,
            waiterName: row['waiter_name'] as String?,
            guestCount: row['guest_count'] as int,
            isGlobalTaxExempt: (row['global_tax_exempt'] as int) != 0,
            version: row['version'] as int),
        arguments: [tableId]);
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
            taxRate: row['tax_rate'] as double,
            variantId: row['variant_id'] as String?,
            notes: row['notes'] as String?,
            modifiersJson: row['modifiers_json'] as String?),
        arguments: [holdTicketId]);
  }

  @override
  Future<void> deleteHoldTicketItems(String holdTicketId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM hold_ticket_items WHERE hold_ticket_id = ?1',
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
  Future<int> updateHoldTicket(HoldTicketEntity ticket) {
    return _holdTicketEntityUpdateAdapter.updateAndReturnChangedRows(
        ticket, OnConflictStrategy.replace);
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

  @override
  Future<void> deleteHoldTicketWithItems(String id) async {
    if (database is sqflite.Transaction) {
      await super.deleteHoldTicketWithItems(id);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.holdTicketDao.deleteHoldTicketWithItems(id);
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
                  'target_category_id': item.targetCategoryId,
                  'buy_quantity': item.buyQuantity,
                  'get_quantity': item.getQuantity,
                  'discount_value': item.discountValue,
                  'min_order_amount': item.minOrderAmount,
                  'days_of_week': item.daysOfWeek,
                  'start_time': item.startTime,
                  'end_time': item.endTime,
                  'start_date': item.startDate,
                  'end_date': item.endDate,
                  'priority': item.priority,
                  'is_stackable': item.isStackable ? 1 : 0,
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
                  'target_category_id': item.targetCategoryId,
                  'buy_quantity': item.buyQuantity,
                  'get_quantity': item.getQuantity,
                  'discount_value': item.discountValue,
                  'min_order_amount': item.minOrderAmount,
                  'days_of_week': item.daysOfWeek,
                  'start_time': item.startTime,
                  'end_time': item.endTime,
                  'start_date': item.startDate,
                  'end_date': item.endDate,
                  'priority': item.priority,
                  'is_stackable': item.isStackable ? 1 : 0,
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
        'SELECT * FROM promotions WHERE is_active = 1 ORDER BY priority DESC',
        mapper: (Map<String, Object?> row) => PromotionEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            type: row['type'] as String,
            targetProductId: row['target_product_id'] as String?,
            targetCategoryId: row['target_category_id'] as String?,
            buyQuantity: row['buy_quantity'] as int,
            getQuantity: row['get_quantity'] as int,
            discountValue: row['discount_value'] as double,
            minOrderAmount: row['min_order_amount'] as double,
            daysOfWeek: row['days_of_week'] as String?,
            startTime: row['start_time'] as String?,
            endTime: row['end_time'] as String?,
            startDate: row['start_date'] as int?,
            endDate: row['end_date'] as int?,
            priority: row['priority'] as int,
            isStackable: (row['is_stackable'] as int) != 0,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<List<PromotionEntity>> getAllPromotions() async {
    return _queryAdapter.queryList(
        'SELECT * FROM promotions ORDER BY priority DESC',
        mapper: (Map<String, Object?> row) => PromotionEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            type: row['type'] as String,
            targetProductId: row['target_product_id'] as String?,
            targetCategoryId: row['target_category_id'] as String?,
            buyQuantity: row['buy_quantity'] as int,
            getQuantity: row['get_quantity'] as int,
            discountValue: row['discount_value'] as double,
            minOrderAmount: row['min_order_amount'] as double,
            daysOfWeek: row['days_of_week'] as String?,
            startTime: row['start_time'] as String?,
            endTime: row['end_time'] as String?,
            startDate: row['start_date'] as int?,
            endDate: row['end_date'] as int?,
            priority: row['priority'] as int,
            isStackable: (row['is_stackable'] as int) != 0,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<void> setPromotionActive(
    String id,
    bool isActive,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE promotions SET is_active = ?2 WHERE id = ?1',
        arguments: [id, isActive ? 1 : 0]);
  }

  @override
  Future<List<PromotionEntity>> getPromotionsByProduct(String productId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM promotions WHERE target_product_id = ?1 AND is_active = 1',
        mapper: (Map<String, Object?> row) => PromotionEntity(id: row['id'] as String, name: row['name'] as String, type: row['type'] as String, targetProductId: row['target_product_id'] as String?, targetCategoryId: row['target_category_id'] as String?, buyQuantity: row['buy_quantity'] as int, getQuantity: row['get_quantity'] as int, discountValue: row['discount_value'] as double, minOrderAmount: row['min_order_amount'] as double, daysOfWeek: row['days_of_week'] as String?, startTime: row['start_time'] as String?, endTime: row['end_time'] as String?, startDate: row['start_date'] as int?, endDate: row['end_date'] as int?, priority: row['priority'] as int, isStackable: (row['is_stackable'] as int) != 0, isActive: (row['is_active'] as int) != 0),
        arguments: [productId]);
  }

  @override
  Future<List<PromotionEntity>> getPromotionsByCategory(
      String categoryId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM promotions WHERE target_category_id = ?1 AND is_active = 1',
        mapper: (Map<String, Object?> row) => PromotionEntity(id: row['id'] as String, name: row['name'] as String, type: row['type'] as String, targetProductId: row['target_product_id'] as String?, targetCategoryId: row['target_category_id'] as String?, buyQuantity: row['buy_quantity'] as int, getQuantity: row['get_quantity'] as int, discountValue: row['discount_value'] as double, minOrderAmount: row['min_order_amount'] as double, daysOfWeek: row['days_of_week'] as String?, startTime: row['start_time'] as String?, endTime: row['end_time'] as String?, startDate: row['start_date'] as int?, endDate: row['end_date'] as int?, priority: row['priority'] as int, isStackable: (row['is_stackable'] as int) != 0, isActive: (row['is_active'] as int) != 0),
        arguments: [categoryId]);
  }

  @override
  Future<void> deletePromotionById(String id) async {
    await _queryAdapter
        .queryNoReturn('DELETE FROM promotions WHERE id = ?1', arguments: [id]);
  }

  @override
  Future<void> savePromotion(PromotionEntity promotion) async {
    await _promotionEntityInsertionAdapter.insert(
        promotion, OnConflictStrategy.replace);
  }

  @override
  Future<void> savePromotions(List<PromotionEntity> promotions) async {
    await _promotionEntityInsertionAdapter.insertList(
        promotions, OnConflictStrategy.replace);
  }

  @override
  Future<void> updatePromotion(PromotionEntity promotion) async {
    await _promotionEntityUpdateAdapter.update(
        promotion, OnConflictStrategy.replace);
  }
}

class _$RestaurantAreaDao extends RestaurantAreaDao {
  _$RestaurantAreaDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _restaurantAreaEntityInsertionAdapter = InsertionAdapter(
            database,
            'restaurant_areas',
            (RestaurantAreaEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'display_order': item.displayOrder,
                  'is_active': item.isActive ? 1 : 0
                }),
        _restaurantAreaEntityUpdateAdapter = UpdateAdapter(
            database,
            'restaurant_areas',
            ['id'],
            (RestaurantAreaEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'display_order': item.displayOrder,
                  'is_active': item.isActive ? 1 : 0
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<RestaurantAreaEntity>
      _restaurantAreaEntityInsertionAdapter;

  final UpdateAdapter<RestaurantAreaEntity> _restaurantAreaEntityUpdateAdapter;

  @override
  Future<List<RestaurantAreaEntity>> getActiveAreas() async {
    return _queryAdapter.queryList(
        'SELECT * FROM restaurant_areas WHERE is_active = 1 ORDER BY display_order ASC',
        mapper: (Map<String, Object?> row) => RestaurantAreaEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            displayOrder: row['display_order'] as int,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<List<RestaurantAreaEntity>> getAllAreas() async {
    return _queryAdapter.queryList(
        'SELECT * FROM restaurant_areas ORDER BY display_order ASC',
        mapper: (Map<String, Object?> row) => RestaurantAreaEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            displayOrder: row['display_order'] as int,
            isActive: (row['is_active'] as int) != 0));
  }

  @override
  Future<RestaurantAreaEntity?> getAreaById(String id) async {
    return _queryAdapter.query('SELECT * FROM restaurant_areas WHERE id = ?1',
        mapper: (Map<String, Object?> row) => RestaurantAreaEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            displayOrder: row['display_order'] as int,
            isActive: (row['is_active'] as int) != 0),
        arguments: [id]);
  }

  @override
  Future<void> deleteArea(String id) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM restaurant_areas WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertArea(RestaurantAreaEntity area) async {
    await _restaurantAreaEntityInsertionAdapter.insert(
        area, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertAreas(List<RestaurantAreaEntity> areas) async {
    await _restaurantAreaEntityInsertionAdapter.insertList(
        areas, OnConflictStrategy.replace);
  }

  @override
  Future<int> updateArea(RestaurantAreaEntity area) {
    return _restaurantAreaEntityUpdateAdapter.updateAndReturnChangedRows(
        area, OnConflictStrategy.replace);
  }
}

class _$RestaurantTableDao extends RestaurantTableDao {
  _$RestaurantTableDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _restaurantTableEntityInsertionAdapter = InsertionAdapter(
            database,
            'restaurant_tables',
            (RestaurantTableEntity item) => <String, Object?>{
                  'id': item.id,
                  'area_id': item.areaId,
                  'table_number': item.tableNumber,
                  'capacity': item.capacity,
                  'status': item.status,
                  'current_ticket_id': item.currentTicketId,
                  'active_guests': item.activeGuests,
                  'opened_at': item.openedAt
                }),
        _restaurantTableEntityUpdateAdapter = UpdateAdapter(
            database,
            'restaurant_tables',
            ['id'],
            (RestaurantTableEntity item) => <String, Object?>{
                  'id': item.id,
                  'area_id': item.areaId,
                  'table_number': item.tableNumber,
                  'capacity': item.capacity,
                  'status': item.status,
                  'current_ticket_id': item.currentTicketId,
                  'active_guests': item.activeGuests,
                  'opened_at': item.openedAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<RestaurantTableEntity>
      _restaurantTableEntityInsertionAdapter;

  final UpdateAdapter<RestaurantTableEntity>
      _restaurantTableEntityUpdateAdapter;

  @override
  Future<List<RestaurantTableEntity>> getAllTables() async {
    return _queryAdapter.queryList(
        'SELECT * FROM restaurant_tables ORDER BY table_number ASC',
        mapper: (Map<String, Object?> row) => RestaurantTableEntity(
            id: row['id'] as String,
            areaId: row['area_id'] as String,
            tableNumber: row['table_number'] as String,
            capacity: row['capacity'] as int,
            status: row['status'] as String,
            currentTicketId: row['current_ticket_id'] as String?,
            activeGuests: row['active_guests'] as int?,
            openedAt: row['opened_at'] as int?));
  }

  @override
  Future<List<RestaurantTableEntity>> getTablesByArea(String areaId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM restaurant_tables WHERE area_id = ?1 ORDER BY table_number ASC',
        mapper: (Map<String, Object?> row) => RestaurantTableEntity(id: row['id'] as String, areaId: row['area_id'] as String, tableNumber: row['table_number'] as String, capacity: row['capacity'] as int, status: row['status'] as String, currentTicketId: row['current_ticket_id'] as String?, activeGuests: row['active_guests'] as int?, openedAt: row['opened_at'] as int?),
        arguments: [areaId]);
  }

  @override
  Future<RestaurantTableEntity?> getTableById(String id) async {
    return _queryAdapter.query('SELECT * FROM restaurant_tables WHERE id = ?1',
        mapper: (Map<String, Object?> row) => RestaurantTableEntity(
            id: row['id'] as String,
            areaId: row['area_id'] as String,
            tableNumber: row['table_number'] as String,
            capacity: row['capacity'] as int,
            status: row['status'] as String,
            currentTicketId: row['current_ticket_id'] as String?,
            activeGuests: row['active_guests'] as int?,
            openedAt: row['opened_at'] as int?),
        arguments: [id]);
  }

  @override
  Future<RestaurantTableEntity?> getTableByTicketId(String ticketId) async {
    return _queryAdapter.query(
        'SELECT * FROM restaurant_tables WHERE current_ticket_id = ?1',
        mapper: (Map<String, Object?> row) => RestaurantTableEntity(
            id: row['id'] as String,
            areaId: row['area_id'] as String,
            tableNumber: row['table_number'] as String,
            capacity: row['capacity'] as int,
            status: row['status'] as String,
            currentTicketId: row['current_ticket_id'] as String?,
            activeGuests: row['active_guests'] as int?,
            openedAt: row['opened_at'] as int?),
        arguments: [ticketId]);
  }

  @override
  Future<List<RestaurantTableEntity>> getTablesByStatus(String status) async {
    return _queryAdapter.queryList(
        'SELECT * FROM restaurant_tables WHERE status = ?1',
        mapper: (Map<String, Object?> row) => RestaurantTableEntity(
            id: row['id'] as String,
            areaId: row['area_id'] as String,
            tableNumber: row['table_number'] as String,
            capacity: row['capacity'] as int,
            status: row['status'] as String,
            currentTicketId: row['current_ticket_id'] as String?,
            activeGuests: row['active_guests'] as int?,
            openedAt: row['opened_at'] as int?),
        arguments: [status]);
  }

  @override
  Future<void> occupyTable(
    String id,
    String status,
    String ticketId,
    int guests,
    int openedAt,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE restaurant_tables SET status = ?2, current_ticket_id = ?3, active_guests = ?4, opened_at = ?5 WHERE id = ?1',
        arguments: [id, status, ticketId, guests, openedAt]);
  }

  @override
  Future<void> releaseTable(String id) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE restaurant_tables SET status = \'DISPONIBLE\', current_ticket_id = NULL, active_guests = NULL, opened_at = NULL WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> deleteTable(String id) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM restaurant_tables WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> insertTable(RestaurantTableEntity table) async {
    await _restaurantTableEntityInsertionAdapter.insert(
        table, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertTables(List<RestaurantTableEntity> tables) async {
    await _restaurantTableEntityInsertionAdapter.insertList(
        tables, OnConflictStrategy.replace);
  }

  @override
  Future<int> updateTable(RestaurantTableEntity table) {
    return _restaurantTableEntityUpdateAdapter.updateAndReturnChangedRows(
        table, OnConflictStrategy.replace);
  }
}

class _$KitchenOrderDao extends KitchenOrderDao {
  _$KitchenOrderDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _kitchenOrderEntityInsertionAdapter = InsertionAdapter(
            database,
            'kitchen_orders',
            (KitchenOrderEntity item) => <String, Object?>{
                  'id': item.id,
                  'ticket_id': item.ticketId,
                  'table_number': item.tableNumber,
                  'table_name': item.tableName,
                  'waiter_name': item.waiterName,
                  'station': item.station,
                  'status': item.status,
                  'created_at': item.createdAt,
                  'started_at': item.startedAt,
                  'ready_at': item.readyAt,
                  'served_at': item.servedAt,
                  'notes': item.notes
                }),
        _kitchenOrderItemEntityInsertionAdapter = InsertionAdapter(
            database,
            'kitchen_order_items',
            (KitchenOrderItemEntity item) => <String, Object?>{
                  'id': item.id,
                  'kitchen_order_id': item.kitchenOrderId,
                  'product_id': item.productId,
                  'product_name': item.productName,
                  'quantity': item.quantity,
                  'status': item.status,
                  'notes': item.notes,
                  'modifiers_json': item.modifiersJson
                }),
        _kitchenOrderEntityUpdateAdapter = UpdateAdapter(
            database,
            'kitchen_orders',
            ['id'],
            (KitchenOrderEntity item) => <String, Object?>{
                  'id': item.id,
                  'ticket_id': item.ticketId,
                  'table_number': item.tableNumber,
                  'table_name': item.tableName,
                  'waiter_name': item.waiterName,
                  'station': item.station,
                  'status': item.status,
                  'created_at': item.createdAt,
                  'started_at': item.startedAt,
                  'ready_at': item.readyAt,
                  'served_at': item.servedAt,
                  'notes': item.notes
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<KitchenOrderEntity>
      _kitchenOrderEntityInsertionAdapter;

  final InsertionAdapter<KitchenOrderItemEntity>
      _kitchenOrderItemEntityInsertionAdapter;

  final UpdateAdapter<KitchenOrderEntity> _kitchenOrderEntityUpdateAdapter;

  @override
  Future<List<KitchenOrderEntity>> getActiveOrders(String servedStatus) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kitchen_orders WHERE status != ?1 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => KitchenOrderEntity(id: row['id'] as String, ticketId: row['ticket_id'] as String, tableNumber: row['table_number'] as String?, tableName: row['table_name'] as String?, waiterName: row['waiter_name'] as String?, station: row['station'] as String, status: row['status'] as String, createdAt: row['created_at'] as int, startedAt: row['started_at'] as int?, readyAt: row['ready_at'] as int?, servedAt: row['served_at'] as int?, notes: row['notes'] as String?),
        arguments: [servedStatus]);
  }

  @override
  Future<List<KitchenOrderEntity>> getActiveOrdersByStation(
    String station,
    String servedStatus,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kitchen_orders WHERE station = ?1 AND status != ?2 ORDER BY created_at ASC',
        mapper: (Map<String, Object?> row) => KitchenOrderEntity(id: row['id'] as String, ticketId: row['ticket_id'] as String, tableNumber: row['table_number'] as String?, tableName: row['table_name'] as String?, waiterName: row['waiter_name'] as String?, station: row['station'] as String, status: row['status'] as String, createdAt: row['created_at'] as int, startedAt: row['started_at'] as int?, readyAt: row['ready_at'] as int?, servedAt: row['served_at'] as int?, notes: row['notes'] as String?),
        arguments: [station, servedStatus]);
  }

  @override
  Future<List<KitchenOrderEntity>> getAllOrders() async {
    return _queryAdapter.queryList(
        'SELECT * FROM kitchen_orders ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => KitchenOrderEntity(
            id: row['id'] as String,
            ticketId: row['ticket_id'] as String,
            tableNumber: row['table_number'] as String?,
            tableName: row['table_name'] as String?,
            waiterName: row['waiter_name'] as String?,
            station: row['station'] as String,
            status: row['status'] as String,
            createdAt: row['created_at'] as int,
            startedAt: row['started_at'] as int?,
            readyAt: row['ready_at'] as int?,
            servedAt: row['served_at'] as int?,
            notes: row['notes'] as String?));
  }

  @override
  Future<KitchenOrderEntity?> getOrderById(String id) async {
    return _queryAdapter.query('SELECT * FROM kitchen_orders WHERE id = ?1',
        mapper: (Map<String, Object?> row) => KitchenOrderEntity(
            id: row['id'] as String,
            ticketId: row['ticket_id'] as String,
            tableNumber: row['table_number'] as String?,
            tableName: row['table_name'] as String?,
            waiterName: row['waiter_name'] as String?,
            station: row['station'] as String,
            status: row['status'] as String,
            createdAt: row['created_at'] as int,
            startedAt: row['started_at'] as int?,
            readyAt: row['ready_at'] as int?,
            servedAt: row['served_at'] as int?,
            notes: row['notes'] as String?),
        arguments: [id]);
  }

  @override
  Future<List<KitchenOrderEntity>> getOrdersByTicketId(String ticketId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kitchen_orders WHERE ticket_id = ?1',
        mapper: (Map<String, Object?> row) => KitchenOrderEntity(
            id: row['id'] as String,
            ticketId: row['ticket_id'] as String,
            tableNumber: row['table_number'] as String?,
            tableName: row['table_name'] as String?,
            waiterName: row['waiter_name'] as String?,
            station: row['station'] as String,
            status: row['status'] as String,
            createdAt: row['created_at'] as int,
            startedAt: row['started_at'] as int?,
            readyAt: row['ready_at'] as int?,
            servedAt: row['served_at'] as int?,
            notes: row['notes'] as String?),
        arguments: [ticketId]);
  }

  @override
  Future<List<KitchenOrderItemEntity>> getItemsForOrder(String orderId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM kitchen_order_items WHERE kitchen_order_id = ?1',
        mapper: (Map<String, Object?> row) => KitchenOrderItemEntity(
            id: row['id'] as String,
            kitchenOrderId: row['kitchen_order_id'] as String,
            productId: row['product_id'] as String,
            productName: row['product_name'] as String,
            quantity: row['quantity'] as double,
            status: row['status'] as String,
            notes: row['notes'] as String?,
            modifiersJson: row['modifiers_json'] as String?),
        arguments: [orderId]);
  }

  @override
  Future<void> updateOrderStatus(
    String id,
    String status,
    int readyAt,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE kitchen_orders SET status = ?2, ready_at = ?3 WHERE id = ?1',
        arguments: [id, status, readyAt]);
  }

  @override
  Future<void> startOrderPreparation(
    String id,
    String status,
    int startedAt,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE kitchen_orders SET status = ?2, started_at = ?3 WHERE id = ?1',
        arguments: [id, status, startedAt]);
  }

  @override
  Future<void> markOrderServed(
    String id,
    String status,
    int servedAt,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE kitchen_orders SET status = ?2, served_at = ?3 WHERE id = ?1',
        arguments: [id, status, servedAt]);
  }

  @override
  Future<void> updateItemStatus(
    String id,
    String status,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE kitchen_order_items SET status = ?2 WHERE id = ?1',
        arguments: [id, status]);
  }

  @override
  Future<void> deleteOrdersByTicketId(String ticketId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM kitchen_orders WHERE ticket_id = ?1',
        arguments: [ticketId]);
  }

  @override
  Future<void> deleteOrder(String id) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM kitchen_orders WHERE id = ?1',
        arguments: [id]);
  }

  @override
  Future<void> deleteItemsForOrder(String orderId) async {
    await _queryAdapter.queryNoReturn(
        'DELETE FROM kitchen_order_items WHERE kitchen_order_id = ?1',
        arguments: [orderId]);
  }

  @override
  Future<void> insertOrder(KitchenOrderEntity order) async {
    await _kitchenOrderEntityInsertionAdapter.insert(
        order, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertOrders(List<KitchenOrderEntity> orders) async {
    await _kitchenOrderEntityInsertionAdapter.insertList(
        orders, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertOrderItems(List<KitchenOrderItemEntity> items) async {
    await _kitchenOrderItemEntityInsertionAdapter.insertList(
        items, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateOrder(KitchenOrderEntity order) async {
    await _kitchenOrderEntityUpdateAdapter.update(
        order, OnConflictStrategy.replace);
  }

  @override
  Future<void> saveKitchenOrder(
    KitchenOrderEntity order,
    List<KitchenOrderItemEntity> items,
  ) async {
    if (database is sqflite.Transaction) {
      await super.saveKitchenOrder(order, items);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.kitchenOrderDao
            .saveKitchenOrder(order, items);
      });
    }
  }

  @override
  Future<void> deleteKitchenOrderWithItems(String orderId) async {
    if (database is sqflite.Transaction) {
      await super.deleteKitchenOrderWithItems(orderId);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.kitchenOrderDao
            .deleteKitchenOrderWithItems(orderId);
      });
    }
  }
}

class _$CustomerDao extends CustomerDao {
  _$CustomerDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _customerEntityInsertionAdapter = InsertionAdapter(
            database,
            'customers',
            (CustomerEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'tax_id': item.taxId,
                  'phone': item.phone,
                  'email': item.email,
                  'address': item.address,
                  'points_balance': item.pointsBalance,
                  'is_active': item.isActive ? 1 : 0,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt,
                  'sync_status': item.syncStatus
                }),
        _customerEntityUpdateAdapter = UpdateAdapter(
            database,
            'customers',
            ['id'],
            (CustomerEntity item) => <String, Object?>{
                  'id': item.id,
                  'name': item.name,
                  'tax_id': item.taxId,
                  'phone': item.phone,
                  'email': item.email,
                  'address': item.address,
                  'points_balance': item.pointsBalance,
                  'is_active': item.isActive ? 1 : 0,
                  'created_at': item.createdAt,
                  'updated_at': item.updatedAt,
                  'sync_status': item.syncStatus
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CustomerEntity> _customerEntityInsertionAdapter;

  final UpdateAdapter<CustomerEntity> _customerEntityUpdateAdapter;

  @override
  Future<List<CustomerEntity>> getAllCustomers() async {
    return _queryAdapter.queryList(
        'SELECT * FROM customers WHERE is_active = 1 ORDER BY name ASC',
        mapper: (Map<String, Object?> row) => CustomerEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            taxId: row['tax_id'] as String?,
            phone: row['phone'] as String?,
            email: row['email'] as String?,
            address: row['address'] as String?,
            pointsBalance: row['points_balance'] as double,
            isActive: (row['is_active'] as int) != 0,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int,
            syncStatus: row['sync_status'] as String));
  }

  @override
  Future<CustomerEntity?> getCustomerById(String id) async {
    return _queryAdapter.query('SELECT * FROM customers WHERE id = ?1',
        mapper: (Map<String, Object?> row) => CustomerEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            taxId: row['tax_id'] as String?,
            phone: row['phone'] as String?,
            email: row['email'] as String?,
            address: row['address'] as String?,
            pointsBalance: row['points_balance'] as double,
            isActive: (row['is_active'] as int) != 0,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [id]);
  }

  @override
  Future<CustomerEntity?> getCustomerByTaxId(String taxId) async {
    return _queryAdapter.query(
        'SELECT * FROM customers WHERE tax_id = ?1 LIMIT 1',
        mapper: (Map<String, Object?> row) => CustomerEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            taxId: row['tax_id'] as String?,
            phone: row['phone'] as String?,
            email: row['email'] as String?,
            address: row['address'] as String?,
            pointsBalance: row['points_balance'] as double,
            isActive: (row['is_active'] as int) != 0,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [taxId]);
  }

  @override
  Future<CustomerEntity?> getCustomerByPhone(String phone) async {
    return _queryAdapter.query(
        'SELECT * FROM customers WHERE phone = ?1 LIMIT 1',
        mapper: (Map<String, Object?> row) => CustomerEntity(
            id: row['id'] as String,
            name: row['name'] as String,
            taxId: row['tax_id'] as String?,
            phone: row['phone'] as String?,
            email: row['email'] as String?,
            address: row['address'] as String?,
            pointsBalance: row['points_balance'] as double,
            isActive: (row['is_active'] as int) != 0,
            createdAt: row['created_at'] as int,
            updatedAt: row['updated_at'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [phone]);
  }

  @override
  Future<List<CustomerEntity>> searchCustomers(
    String query,
    int limit,
  ) async {
    return _queryAdapter.queryList(
        'SELECT * FROM customers      WHERE is_active = 1        AND (         name LIKE \'%\' || ?1 || \'%\'          OR tax_id LIKE \'%\' || ?1 || \'%\'          OR phone LIKE \'%\' || ?1 || \'%\'       )     ORDER BY name ASC      LIMIT ?2',
        mapper: (Map<String, Object?> row) => CustomerEntity(id: row['id'] as String, name: row['name'] as String, taxId: row['tax_id'] as String?, phone: row['phone'] as String?, email: row['email'] as String?, address: row['address'] as String?, pointsBalance: row['points_balance'] as double, isActive: (row['is_active'] as int) != 0, createdAt: row['created_at'] as int, updatedAt: row['updated_at'] as int, syncStatus: row['sync_status'] as String),
        arguments: [query, limit]);
  }

  @override
  Future<int?> countCustomers() async {
    return _queryAdapter.query('SELECT COUNT(*) FROM customers',
        mapper: (Map<String, Object?> row) => row.values.first as int);
  }

  @override
  Future<void> saveCustomer(CustomerEntity customer) async {
    await _customerEntityInsertionAdapter.insert(
        customer, OnConflictStrategy.replace);
  }

  @override
  Future<void> saveCustomers(List<CustomerEntity> customers) async {
    await _customerEntityInsertionAdapter.insertList(
        customers, OnConflictStrategy.replace);
  }

  @override
  Future<void> updateCustomer(CustomerEntity customer) async {
    await _customerEntityUpdateAdapter.update(
        customer, OnConflictStrategy.replace);
  }
}

class _$CustomerPointTransactionDao extends CustomerPointTransactionDao {
  _$CustomerPointTransactionDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _customerPointTransactionEntityInsertionAdapter = InsertionAdapter(
            database,
            'customer_point_transactions',
            (CustomerPointTransactionEntity item) => <String, Object?>{
                  'id': item.id,
                  'customer_id': item.customerId,
                  'invoice_id': item.invoiceId,
                  'type': item.type,
                  'points': item.points,
                  'balance_after': item.balanceAfter,
                  'conversion_rate': item.conversionRate,
                  'reason': item.reason,
                  'created_at': item.createdAt,
                  'sync_status': item.syncStatus
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<CustomerPointTransactionEntity>
      _customerPointTransactionEntityInsertionAdapter;

  @override
  Future<List<CustomerPointTransactionEntity>> getTransactionsByCustomer(
      String customerId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM customer_point_transactions WHERE customer_id = ?1 ORDER BY created_at DESC',
        mapper: (Map<String, Object?> row) => CustomerPointTransactionEntity(id: row['id'] as String, customerId: row['customer_id'] as String, invoiceId: row['invoice_id'] as String?, type: row['type'] as String, points: row['points'] as double, balanceAfter: row['balance_after'] as double, conversionRate: row['conversion_rate'] as double, reason: row['reason'] as String?, createdAt: row['created_at'] as int, syncStatus: row['sync_status'] as String),
        arguments: [customerId]);
  }

  @override
  Future<List<CustomerPointTransactionEntity>> getTransactionsByInvoice(
      String invoiceId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM customer_point_transactions WHERE invoice_id = ?1',
        mapper: (Map<String, Object?> row) => CustomerPointTransactionEntity(
            id: row['id'] as String,
            customerId: row['customer_id'] as String,
            invoiceId: row['invoice_id'] as String?,
            type: row['type'] as String,
            points: row['points'] as double,
            balanceAfter: row['balance_after'] as double,
            conversionRate: row['conversion_rate'] as double,
            reason: row['reason'] as String?,
            createdAt: row['created_at'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [invoiceId]);
  }

  @override
  Future<List<CustomerPointTransactionEntity>> getTransactionsBySyncStatus(
      String status) async {
    return _queryAdapter.queryList(
        'SELECT * FROM customer_point_transactions WHERE sync_status = ?1',
        mapper: (Map<String, Object?> row) => CustomerPointTransactionEntity(
            id: row['id'] as String,
            customerId: row['customer_id'] as String,
            invoiceId: row['invoice_id'] as String?,
            type: row['type'] as String,
            points: row['points'] as double,
            balanceAfter: row['balance_after'] as double,
            conversionRate: row['conversion_rate'] as double,
            reason: row['reason'] as String?,
            createdAt: row['created_at'] as int,
            syncStatus: row['sync_status'] as String),
        arguments: [status]);
  }

  @override
  Future<void> updateCustomerBalance(
    String customerId,
    double newBalance,
    int updatedAt,
  ) async {
    await _queryAdapter.queryNoReturn(
        'UPDATE customers SET points_balance = ?2, updated_at = ?3 WHERE id = ?1',
        arguments: [customerId, newBalance, updatedAt]);
  }

  @override
  Future<void> insertTransaction(CustomerPointTransactionEntity entity) async {
    await _customerPointTransactionEntityInsertionAdapter.insert(
        entity, OnConflictStrategy.replace);
  }

  @override
  Future<void> insertTransactions(
      List<CustomerPointTransactionEntity> entities) async {
    await _customerPointTransactionEntityInsertionAdapter.insertList(
        entities, OnConflictStrategy.replace);
  }

  @override
  Future<void> recordPointTransactionAndUpdateBalance(
    CustomerPointTransactionEntity entity,
    String customerId,
    double newBalance,
    int updatedAt,
  ) async {
    if (database is sqflite.Transaction) {
      await super.recordPointTransactionAndUpdateBalance(
          entity, customerId, newBalance, updatedAt);
    } else {
      await (database as sqflite.Database)
          .transaction<void>((transaction) async {
        final transactionDatabase = _$AppDatabase(changeListener)
          ..database = transaction;
        await transactionDatabase.customerPointTransactionDao
            .recordPointTransactionAndUpdateBalance(
                entity, customerId, newBalance, updatedAt);
      });
    }
  }
}

class _$FulfillmentTopologyDao extends FulfillmentTopologyDao {
  _$FulfillmentTopologyDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _topologySnapshotEntityInsertionAdapter = InsertionAdapter(
            database,
            'topology_snapshots',
            (TopologySnapshotEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'revision': item.revision,
                  'hash': item.hash,
                  'payload': item.payload,
                  'received_at': item.receivedAt
                }),
        _shiftTopologyBindingEntityInsertionAdapter = InsertionAdapter(
            database,
            'shift_topology_bindings',
            (ShiftTopologyBindingEntity item) => <String, Object?>{
                  'shift_id': item.shiftId,
                  'tenant_id': item.tenantId,
                  'snapshot_id': item.snapshotId,
                  'bound_at': item.boundAt
                }),
        _emergencyTopologyAuditEntityInsertionAdapter = InsertionAdapter(
            database,
            'emergency_topology_audits',
            (EmergencyTopologyAuditEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'shift_id': item.shiftId,
                  'snapshot_id': item.snapshotId,
                  'actor_id': item.actorId,
                  'actor_role': item.actorRole,
                  'device_id': item.deviceId,
                  'reason': item.reason,
                  'occurred_at': item.occurredAt
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<TopologySnapshotEntity>
      _topologySnapshotEntityInsertionAdapter;

  final InsertionAdapter<ShiftTopologyBindingEntity>
      _shiftTopologyBindingEntityInsertionAdapter;

  final InsertionAdapter<EmergencyTopologyAuditEntity>
      _emergencyTopologyAuditEntityInsertionAdapter;

  @override
  Future<TopologySnapshotEntity?> findSnapshot(
    String id,
    String tenantId,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM topology_snapshots WHERE id = ?1 AND tenant_id = ?2',
        mapper: (Map<String, Object?> row) => TopologySnapshotEntity(
            id: row['id'] as String,
            tenantId: row['tenant_id'] as String,
            revision: row['revision'] as int,
            hash: row['hash'] as String,
            payload: row['payload'] as String,
            receivedAt: row['received_at'] as String),
        arguments: [id, tenantId]);
  }

  @override
  Future<ShiftTopologyBindingEntity?> findBinding(
    String shiftId,
    String tenantId,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM shift_topology_bindings WHERE shift_id = ?1 AND tenant_id = ?2',
        mapper: (Map<String, Object?> row) => ShiftTopologyBindingEntity(shiftId: row['shift_id'] as String, tenantId: row['tenant_id'] as String, snapshotId: row['snapshot_id'] as String, boundAt: row['bound_at'] as String),
        arguments: [shiftId, tenantId]);
  }

  @override
  Future<List<EmergencyTopologyAuditEntity>> findEmergencyAudits(
      String tenantId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM emergency_topology_audits WHERE tenant_id = ?1 ORDER BY occurred_at DESC',
        mapper: (Map<String, Object?> row) => EmergencyTopologyAuditEntity(id: row['id'] as String, tenantId: row['tenant_id'] as String, shiftId: row['shift_id'] as String, snapshotId: row['snapshot_id'] as String, actorId: row['actor_id'] as String, actorRole: row['actor_role'] as String, deviceId: row['device_id'] as String, reason: row['reason'] as String, occurredAt: row['occurred_at'] as String),
        arguments: [tenantId]);
  }

  @override
  Future<void> insertSnapshot(TopologySnapshotEntity snapshot) async {
    await _topologySnapshotEntityInsertionAdapter.insert(
        snapshot, OnConflictStrategy.abort);
  }

  @override
  Future<void> bindShift(ShiftTopologyBindingEntity binding) async {
    await _shiftTopologyBindingEntityInsertionAdapter.insert(
        binding, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertEmergencyAudit(EmergencyTopologyAuditEntity audit) async {
    await _emergencyTopologyAuditEntityInsertionAdapter.insert(
        audit, OnConflictStrategy.abort);
  }
}

class _$FulfillmentPersistenceDao extends FulfillmentPersistenceDao {
  _$FulfillmentPersistenceDao(
    this.database,
    this.changeListener,
  )   : _queryAdapter = QueryAdapter(database),
        _fulfillmentRecordEntityInsertionAdapter = InsertionAdapter(
            database,
            'fulfillment_records',
            (FulfillmentRecordEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'sale_id': item.saleId,
                  'topology_snapshot_id': item.topologySnapshotId,
                  'topology_revision': item.topologyRevision,
                  'channel': item.channel,
                  'route_state': item.routeState,
                  'delivery_state': item.deliveryState,
                  'lines_payload': item.linesPayload
                }),
        _printJobEntityInsertionAdapter = InsertionAdapter(
            database,
            'print_jobs',
            (PrintJobEntity item) => <String, Object?>{
                  'id': item.id,
                  'tenant_id': item.tenantId,
                  'fulfillment_id': item.fulfillmentId,
                  'document_kind': item.documentKind,
                  'sequence': item.sequence,
                  'payload': item.payload,
                  'state': item.state,
                  'retry_count': item.retryCount,
                  'idempotency_key': item.idempotencyKey
                }),
        _outboxEventEntityInsertionAdapter = InsertionAdapter(
            database,
            'fulfillment_outbox_events',
            (OutboxEventEntity item) => <String, Object?>{
                  'event_id': item.eventId,
                  'tenant_id': item.tenantId,
                  'device_id': item.deviceId,
                  'source_sequence': item.sourceSequence,
                  'aggregate_type': item.aggregateType,
                  'aggregate_id': item.aggregateId,
                  'idempotency_key': item.idempotencyKey,
                  'payload_hash': item.payloadHash,
                  'topology_revision': item.topologyRevision,
                  'state': item.state,
                  'attempts': item.attempts
                });

  final sqflite.DatabaseExecutor database;

  final StreamController<String> changeListener;

  final QueryAdapter _queryAdapter;

  final InsertionAdapter<FulfillmentRecordEntity>
      _fulfillmentRecordEntityInsertionAdapter;

  final InsertionAdapter<PrintJobEntity> _printJobEntityInsertionAdapter;

  final InsertionAdapter<OutboxEventEntity> _outboxEventEntityInsertionAdapter;

  @override
  Future<FulfillmentRecordEntity?> findFulfillment(
    String id,
    String tenantId,
  ) async {
    return _queryAdapter.query(
        'SELECT * FROM fulfillment_records WHERE id = ?1 AND tenant_id = ?2',
        mapper: (Map<String, Object?> row) => FulfillmentRecordEntity(
            id: row['id'] as String,
            tenantId: row['tenant_id'] as String,
            saleId: row['sale_id'] as String,
            topologySnapshotId: row['topology_snapshot_id'] as String,
            topologyRevision: row['topology_revision'] as int,
            channel: row['channel'] as String,
            routeState: row['route_state'] as String,
            deliveryState: row['delivery_state'] as String,
            linesPayload: row['lines_payload'] as String),
        arguments: [id, tenantId]);
  }

  @override
  Future<List<PrintJobEntity>> findRetryablePrintJobs(String tenantId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM print_jobs WHERE tenant_id = ?1 AND state IN (\'PENDING\', \'FAILED\') ORDER BY sequence',
        mapper: (Map<String, Object?> row) => PrintJobEntity(id: row['id'] as String, tenantId: row['tenant_id'] as String, fulfillmentId: row['fulfillment_id'] as String, documentKind: row['document_kind'] as String, sequence: row['sequence'] as int, payload: row['payload'] as String, state: row['state'] as String, retryCount: row['retry_count'] as int, idempotencyKey: row['idempotency_key'] as String),
        arguments: [tenantId]);
  }

  @override
  Future<List<OutboxEventEntity>> findPendingOutboxEvents(
      String tenantId) async {
    return _queryAdapter.queryList(
        'SELECT * FROM fulfillment_outbox_events WHERE tenant_id = ?1 AND state = \'PENDING\' ORDER BY source_sequence',
        mapper: (Map<String, Object?> row) => OutboxEventEntity(eventId: row['event_id'] as String, tenantId: row['tenant_id'] as String, deviceId: row['device_id'] as String, sourceSequence: row['source_sequence'] as int, aggregateType: row['aggregate_type'] as String, aggregateId: row['aggregate_id'] as String, idempotencyKey: row['idempotency_key'] as String, payloadHash: row['payload_hash'] as String, topologyRevision: row['topology_revision'] as int, state: row['state'] as String, attempts: row['attempts'] as int),
        arguments: [tenantId]);
  }

  @override
  Future<void> insertFulfillment(FulfillmentRecordEntity fulfillment) async {
    await _fulfillmentRecordEntityInsertionAdapter.insert(
        fulfillment, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertPrintJob(PrintJobEntity job) async {
    await _printJobEntityInsertionAdapter.insert(job, OnConflictStrategy.abort);
  }

  @override
  Future<void> insertOutboxEvent(OutboxEventEntity event) async {
    await _outboxEventEntityInsertionAdapter.insert(
        event, OnConflictStrategy.abort);
  }
}
