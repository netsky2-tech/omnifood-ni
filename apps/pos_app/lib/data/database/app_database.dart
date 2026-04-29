import 'dart:async';
import 'package:floor/floor.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../daos/user_dao.dart';
import '../daos/audit_log_dao.dart';
import '../models/user_entity.dart';
import '../models/audit_log_entity.dart';

part 'app_database.g.dart'; // generated code

@Database(version: 1, entities: [UserEntity, AuditLogEntity])
abstract class AppDatabase extends FloorDatabase {
  UserDao get userDao;
  AuditDao get auditDao;
}
