import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';

import '../../../data/repositories/sales/sales_repository_impl_test.mocks.dart';

/// Real database audit repository implementing prepareLog with forensic hash chaining in SQLite
class RealSqliteAuditRepository implements AuditRepository {
  final AppDatabase database;
  final String _deviceId;
  final AuthRepository authRepo;

  RealSqliteAuditRepository(this.database, this._deviceId, this.authRepo);

  @override
  String get deviceId => _deviceId;

  @override
  Future<AuditLog?> prepareLog(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    final user = await authRepo.getCurrentUser();
    if (user == null) return null;

    final logs = await database.auditDao.findAllLogs();
    final seq = logs.length + 1;
    final prevHash = logs.isEmpty ? 'GENESIS' : logs.first.entryHash;
    final entryHash = 'hash-seq-$seq-$action';

    return AuditLog(
      id: null,
      tenantId: 'tenant-foodpark-01',
      deviceId: _deviceId,
      action: action,
      userId: user.id,
      timestamp: DateTime.now(),
      sequenceNo: seq,
      prevHash: prevHash,
      entryHash: entryHash,
      metadata: metadata,
      metodoAutorizacion: metodoAutorizacion,
      usuarioAutorizadorId: usuarioAutorizadorId,
    );
  }

  @override
  Future<void> log(String action, {String? metadata}) async {
    final logEntry = await prepareLog(action, metadata: metadata);
    if (logEntry != null) {
      await database.auditDao.insertLog(
        AuditLogEntity(
          id: null,
          tenantId: 'tenant-foodpark-01',
          deviceId: _deviceId,
          userId: logEntry.userId,
          sequenceNo: logEntry.sequenceNo ?? 1,
          prevHash: logEntry.prevHash ?? 'GENESIS',
          entryHash: logEntry.entryHash ?? 'hash',
          timestamp: logEntry.timestamp.toIso8601String(),
          action: logEntry.action,
          metadata: logEntry.metadata,
          isSynced: false,
          remoteRefUuid: 'remote-${logEntry.sequenceNo}',
          metodoAutorizacion: logEntry.metodoAutorizacion,
          usuarioAutorizadorId: logEntry.usuarioAutorizadorId,
        ),
      );
    }
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MemoryAuthRepository implements AuthRepository {
  User? _currentUser;
  final Map<String, String> _pins = {};
  final Map<String, User> _users = {};

  void registerUser(User user, {String? pin}) {
    _users[user.id] = user;
    if (pin != null) {
      _pins[user.id] = pin;
    }
  }

  void setCurrentUser(User? user) {
    _currentUser = user;
  }

  @override
  Future<User?> getCurrentUser() async => _currentUser;

  @override
  Future<List<CredentialMatch>> identifyByCredential({
    required String credential,
    required SupervisionPolicy policy,
    String? userId,
  }) async {
    final matches = <CredentialMatch>[];
    for (final entry in _pins.entries) {
      if (entry.value == credential && (userId == null || userId == entry.key)) {
        final user = _users[entry.key];
        if (user != null) {
          final isSupervisor = policy.authorizes(user.role.name.toUpperCase());
          matches.add(CredentialMatch(
            userId: user.id,
            userName: user.name,
            userRole: user.role.name.toUpperCase(),
            isAuthorizingRole: isSupervisor,
          ));
        }
      }
    }
    return matches;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late AppDatabase database;
  late TenantConfigService configService;
  late MemoryAuthRepository authRepo;
  late RealSqliteAuditRepository auditRepo;
  late SalesRepositoryImpl salesRepo;

  const cashierUser = User(
    id: 'user-cajero-01',
    name: 'Carlos Cajero',
    role: UserRole.cashier,
    isActive: true,
    tenantId: 'tenant-foodpark-01',
  );

  const managerUser = User(
    id: 'user-manager-01',
    name: 'Roberto Morales',
    role: UserRole.manager,
    isActive: true,
    tenantId: 'tenant-foodpark-01',
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    configService = TenantConfigService(database.localConfigDao);
    authRepo = MemoryAuthRepository();
    authRepo.registerUser(cashierUser, pin: '1234');
    authRepo.registerUser(managerUser, pin: '9999');
    authRepo.setCurrentUser(cashierUser);

    auditRepo = RealSqliteAuditRepository(database, 'terminal-q80-01', authRepo);

    final mockReverse = MockReverseSaleInventoryUseCase();
    when(mockReverse.execute(any, any)).thenAnswer((_) async => []);

    salesRepo = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: MockDgiNumberingService(),
      movementEngine: MockMovementEngine(),
      auditRepository: auditRepo,
      processInventoryUseCase: MockProcessSaleInventoryUseCase(),
      reverseInventoryUseCase: mockReverse,
      inventoryRepository: MockInventoryRepository(),
    );

    // Turno activo en SQLite
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: 'shift-real-01',
        userId: cashierUser.id,
        terminalId: 'terminal-q80-01',
        openedAt: DateTime.now().millisecondsSinceEpoch,
        isClosed: false,
      ),
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedRealInvoice({required String id, required String number}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: id,
        number: number,
        createdAt: now,
        userId: cashierUser.id,
        terminalId: 'terminal-q80-01',
        shiftId: 'shift-real-01',
        subtotal: 500.0,
        totalTax: 75.0,
        total: 575.0,
        isCanceled: false,
        paymentStatus: 'PAID',
        syncStatus: 'PENDING',
        type: 'REGULAR',
      ),
    );
  }

  group('E2E Real Floor/SQLite: Anulaciones con PIN de Supervisor Configurable', () {
    test(
        'Ciclo E2E completo: Factura QSR libre -> Factura Restaurante con PIN -> Hash Forense Encadenado Inmutable',
        () async {
      // -----------------------------------------------------------------------
      // ETAPA 1: Modo Foodpark QSR (Anulación Ágil en SQLite)
      // -----------------------------------------------------------------------
      await configService.setOperationMode(TenantOperationMode.foodparkQsr);
      final qsrPolicy = await configService.getSupervisionPolicy();
      expect(qsrPolicy.supervisorRequiredForVoid, isFalse,
          reason: 'En Foodpark QSR la anulación es ágil sin PIN');

      await seedRealInvoice(id: 'inv-qsr-001', number: '001-001-01-00000001');

      // Cajero anula directamente en SQLite sin supervisor
      await salesRepo.voidInvoice(
        'inv-qsr-001',
        'ERROR_DE_CAPTURA',
        reasonDetail: 'Error en digitación de pedido',
      );

      // Verificación en SQLite: Factura cancelada
      final voidedQsrInvoice = await database.invoiceDao.getInvoiceById('inv-qsr-001');
      expect(voidedQsrInvoice, isNotNull);
      expect(voidedQsrInvoice!.isCanceled, isTrue);
      expect(voidedQsrInvoice.voidReason, contains('ERROR_DE_CAPTURA'));

      // Verificación en SQLite: Registro forense generado
      final auditLogsAfterQsr = await database.auditDao.findAllLogs();
      expect(auditLogsAfterQsr.length, 1);
      final firstLog = auditLogsAfterQsr.first;
      expect(firstLog.action, 'SALE_VOIDED');
      expect(firstLog.sequenceNo, 1);
      expect(firstLog.prevHash, 'GENESIS');
      expect(firstLog.metodoAutorizacion, isNull);
      expect(firstLog.usuarioAutorizadorId, isNull);

      // -----------------------------------------------------------------------
      // ETAPA 2: Modo Restaurante (Anulación Supervisada con PIN en SQLite)
      // -----------------------------------------------------------------------
      await configService.setOperationMode(TenantOperationMode.restaurant);
      await configService.setSupervisionPolicy(
        SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant),
      );
      final restaurantPolicy = await configService.getSupervisionPolicy();
      expect(restaurantPolicy.supervisorRequiredForVoid, isTrue,
          reason: 'En Restaurante se exige PIN de supervisor');

      await seedRealInvoice(id: 'inv-rest-002', number: '001-001-01-00000002');

      // El cajero no es autorizador
      expect(restaurantPolicy.requiresSupervisorForVoid(cashierUser.role.name), isTrue);

      // El supervisor Roberto Morales autoriza con su PIN 9999
      final supervisorMatches = await authRepo.identifyByCredential(
        credential: '9999',
        policy: restaurantPolicy,
      );
      expect(supervisorMatches.length, 1);
      final supervisor = supervisorMatches.first;
      expect(supervisor.userId, managerUser.id);
      expect(supervisor.isAuthorizingRole, isTrue);

      // Se ejecuta la anulación con la atribución forense del supervisor
      await salesRepo.voidInvoice(
        'inv-rest-002',
        'CLIENTE_DESISTE',
        reasonDetail: 'Cliente canceló antes del despacho',
        supervisorId: supervisor.userId,
        authMethod: 'PIN',
      );

      // Verificación en SQLite: Factura cancelada
      final voidedRestInvoice = await database.invoiceDao.getInvoiceById('inv-rest-002');
      expect(voidedRestInvoice, isNotNull);
      expect(voidedRestInvoice!.isCanceled, isTrue);
      expect(voidedRestInvoice.voidReason, contains('CLIENTE_DESISTE'));

      // Verificación en SQLite: Tabla audit_logs con trazabilidad y encadenamiento inmutable
      final allAuditLogs = await database.auditDao.findAllLogs();
      expect(allAuditLogs.length, 2);

      // findAllLogs ordena por timestamp DESC: el más reciente es first
      final secondLog = allAuditLogs.first;
      expect(secondLog.action, 'SALE_VOIDED');
      expect(secondLog.sequenceNo, 2);
      expect(secondLog.prevHash, firstLog.entryHash,
          reason: 'El hash encadenado vincula inmutablemente al log anterior');
      expect(secondLog.metodoAutorizacion, 'PIN');
      expect(secondLog.usuarioAutorizadorId, managerUser.id);

      final metadata = jsonDecode(secondLog.metadata!) as Map<String, dynamic>;
      expect(metadata['invoice_id'], 'inv-rest-002');
      expect(metadata['reason_code'], 'CLIENTE_DESISTE');
    });
  });
}
