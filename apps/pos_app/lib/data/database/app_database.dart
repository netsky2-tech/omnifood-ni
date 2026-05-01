import 'dart:async';
import 'package:floor/floor.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../daos/user_dao.dart';
import '../daos/audit_log_dao.dart';
import '../daos/inventory/insumo_dao.dart';
import '../daos/inventory/recipe_dao.dart';
import '../daos/inventory/movement_dao.dart';
import '../daos/inventory/purchase_dao.dart';
import '../daos/inventory/supplier_dao.dart';
import '../daos/inventory/warehouse_dao.dart';
import '../daos/inventory/uom_conversion_dao.dart';
import '../daos/inventory/batch_dao.dart';
import '../models/user_entity.dart';
import '../models/audit_log_entity.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/inventory/movement_entity.dart';
import '../models/inventory/supplier_entity.dart';
import '../models/inventory/warehouse_entity.dart';
import '../models/inventory/purchase_entity.dart';
import '../models/inventory/uom_conversion_entity.dart';
import '../models/inventory/batch_entity.dart';

part 'app_database.g.dart'; // generated code

@Database(version: 5, entities: [
  UserEntity,
  AuditLogEntity,
  InsumoEntity,
  ProductEntity,
  RecipeEntity,
  MovementEntity,
  SupplierEntity,
  WarehouseEntity,
  PurchaseEntity,
  UomConversionEntity,
  BatchEntity,
])
abstract class AppDatabase extends FloorDatabase {
  UserDao get userDao;
  AuditDao get auditDao;
  InsumoDao get insumoDao;
  ProductDao get productDao;
  RecipeDao get recipeDao;
  MovementDao get movementDao;
  SupplierDao get supplierDao;
  WarehouseDao get warehouseDao;
  PurchaseDao get purchaseDao;
  UomConversionDao get uomConversionDao;
  BatchDao get batchDao;
}
