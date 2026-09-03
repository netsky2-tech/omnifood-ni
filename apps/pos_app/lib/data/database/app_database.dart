import 'dart:async';
import 'package:floor/floor.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../daos/user_dao.dart';
import '../daos/audit_log_dao.dart';
import '../daos/security_profile_dao.dart';
import '../daos/inventory/insumo_dao.dart';
import '../daos/inventory/recipe_dao.dart';
import '../daos/inventory/recipe_version_document_dao.dart';
import '../daos/inventory/count_line_dao.dart';
import '../daos/inventory/count_session_dao.dart';
import '../daos/inventory/forensic_alert_dao.dart';
import '../daos/inventory/movement_dao.dart';
import '../daos/inventory/movement_sync_state_dao.dart';
import '../daos/inventory/kardex_recalculate_queue_dao.dart';
import '../daos/inventory/kardex_correction_dao.dart';
import '../daos/inventory/inventory_dao.dart';
import '../daos/inventory/purchase_dao.dart';
import '../daos/inventory/production_order_document_dao.dart';
import '../daos/inventory/production_transaction_dao.dart';
import '../daos/inventory/supplier_dao.dart';
import '../daos/inventory/warehouse_dao.dart';
import '../daos/inventory/uom_conversion_dao.dart';
import '../daos/inventory/batch_dao.dart';
import '../daos/catalog/catalog_value_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/daos/sales/tax_config_dao.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/daos/sales/cash_movement_dao.dart';
import 'package:pos_app/data/daos/sales/hold_ticket_dao.dart';
import 'package:pos_app/data/daos/sales/promotion_dao.dart';
import 'package:pos_app/data/daos/sales/restaurant_area_dao.dart';
import 'package:pos_app/data/daos/sales/restaurant_table_dao.dart';
import 'package:pos_app/data/daos/kitchen/kitchen_order_dao.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/fulfillment/fulfillment_topology_dao.dart';
import 'package:pos_app/data/daos/fulfillment/fulfillment_persistence_dao.dart';
import '../daos/customer/customer_dao.dart';
import '../models/customer/customer_entity.dart';
import '../daos/customer/customer_point_transaction_dao.dart';
import '../models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_version_document_entity.dart';
import 'package:pos_app/data/models/inventory/count_line_entity.dart';
import 'package:pos_app/data/models/inventory/count_session_document_entity.dart';
import 'package:pos_app/data/models/inventory/forensic_alert_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/movement_sync_state_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_recalculate_queue_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/models/inventory/supplier_entity.dart';
import 'package:pos_app/data/models/inventory/warehouse_entity.dart';
import 'package:pos_app/data/models/inventory/purchase_entity.dart';
import 'package:pos_app/data/models/inventory/production_order_document_entity.dart';
import 'package:pos_app/data/models/inventory/uom_conversion_entity.dart';
import 'package:pos_app/data/models/inventory/batch_entity.dart';
import 'package:pos_app/data/models/catalog/catalog_value_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/models/sales/tax_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/data/models/sales/hold_ticket_entity.dart';
import 'package:pos_app/data/models/sales/promotion_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_entity.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_item_entity.dart';
import 'package:pos_app/data/models/fulfillment/topology_persistence_entities.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';

part 'app_database.g.dart'; // generated code

@Database(
  version: 43,
  entities: [
    UserEntity,
    SecurityProfileEntity,
    AuditLogEntity,
    LocalConfigEntity,
    InsumoEntity,
    ProductEntity,
    ProductVariantEntity,
    ProductModifierEntity,
    RecipeEntity,
    RecipeVersionDocumentEntity,
    CountSessionDocumentEntity,
    CountLineEntity,
    ForensicAlertEntity,
    MovementEntity,
    MovementSyncStateEntity,
    KardexRecalculateQueueEntity,
    KardexCorrectionEntity,
    SupplierEntity,
    WarehouseEntity,
    PurchaseEntity,
    ProductionOrderDocumentEntity,
    UomConversionEntity,
    BatchEntity,
    CatalogValueEntity,
    InvoiceEntity,
    InvoiceItemEntity,
    InvoiceItemModifierEntity,
    PaymentEntity,
    TaxConfigEntity,
    CashierSessionEntity,
    CashMovementEntity,
    HoldTicketEntity,
    HoldTicketItemEntity,
    PromotionEntity,
    RestaurantAreaEntity,
    RestaurantTableEntity,
    KitchenOrderEntity,
    KitchenOrderItemEntity,
    CustomerEntity,
    CustomerPointTransactionEntity,
    TopologySnapshotEntity,
    ShiftTopologyBindingEntity,
    EmergencyTopologyAuditEntity,
    FulfillmentRecordEntity,
    PrintJobEntity,
    OutboxEventEntity,
  ],
)
abstract class AppDatabase extends FloorDatabase {
  UserDao get userDao;
  SecurityProfileDao get securityProfileDao;
  AuditDao get auditDao;
  LocalConfigDao get localConfigDao;
  InsumoDao get insumoDao;
  ProductDao get productDao;
  RecipeDao get recipeDao;
  RecipeVersionDocumentDao get recipeVersionDocumentDao;
  CountSessionDao get countSessionDao;
  CountLineDao get countLineDao;
  ForensicAlertDao get forensicAlertDao;
  MovementDao get movementDao;
  MovementSyncStateDao get movementSyncStateDao;
  KardexRecalculateQueueDao get kardexRecalculateQueueDao;
  KardexCorrectionDao get kardexCorrectionDao;
  InventoryDao get inventoryDao;
  SupplierDao get supplierDao;
  WarehouseDao get warehouseDao;
  PurchaseDao get purchaseDao;
  ProductionOrderDocumentDao get productionOrderDocumentDao;
  ProductionTransactionDao get productionTransactionDao;
  UomConversionDao get uomConversionDao;
  BatchDao get batchDao;
  CatalogValueDao get catalogValueDao;
  InvoiceDao get invoiceDao;
  InvoiceItemDao get invoiceItemDao;
  PaymentDao get paymentDao;
  TaxConfigDao get taxConfigDao;
  SalesTransactionDao get salesTransactionDao;
  CashierSessionDao get cashierSessionDao;
  CashMovementDao get cashMovementDao;
  HoldTicketDao get holdTicketDao;
  PromotionDao get promotionDao;
  RestaurantAreaDao get restaurantAreaDao;
  RestaurantTableDao get restaurantTableDao;
  KitchenOrderDao get kitchenOrderDao;
  CustomerDao get customerDao;
  CustomerPointTransactionDao get customerPointTransactionDao;
  FulfillmentTopologyDao get fulfillmentTopologyDao;
  FulfillmentPersistenceDao get fulfillmentPersistenceDao;
}
