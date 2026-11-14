import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

/// Real local audit repository writing directly to SQLite audit_logs table
class RealDatabaseAuditRepository implements AuditRepository {
  final AppDatabase database;
  final String _deviceId;

  RealDatabaseAuditRepository(this.database, this._deviceId);

  @override
  String get deviceId => _deviceId;

  @override
  Future<void> log(String action, {String? metadata}) async {
    return logForensic(action, metadata: metadata);
  }

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    await database.auditDao.appendForensicLog(
      'tenant-foodpark-01',
      _deviceId,
      usuarioAutorizadorId ?? 'system',
      (sequenceNo, prevHash) => AuditLogEntity(
        id: null,
        tenantId: 'tenant-foodpark-01',
        deviceId: _deviceId,
        userId: usuarioAutorizadorId ?? 'system',
        sequenceNo: sequenceNo,
        prevHash: prevHash,
        entryHash: 'hash-$sequenceNo',
        timestamp: DateTime.now().toIso8601String(),
        action: action,
        metadata: metadata,
        isSynced: false,
        remoteRefUuid: 'remote-uuid-$sequenceNo',
        metodoAutorizacion: metodoAutorizacion,
        usuarioAutorizadorId: usuarioAutorizadorId,
      ),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Simple stateful auth repository providing real credential evaluation
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
  late RealDatabaseAuditRepository auditRepo;
  late MemoryAuthRepository authRepo;
  late CashShiftViewModel cashViewModel;

  const cashierUser = User(
    id: 'user-cajero-01',
    name: 'Carlos Cajero',
    role: UserRole.cashier,
    isActive: true,
  );

  const managerUser = User(
    id: 'user-manager-01',
    name: 'Roberto Morales',
    role: UserRole.manager,
    isActive: true,
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    configService = TenantConfigService(database.localConfigDao);
    auditRepo = RealDatabaseAuditRepository(database, 'terminal-q80-01');
    authRepo = MemoryAuthRepository();
    authRepo.registerUser(cashierUser, pin: '1234');
    authRepo.registerUser(managerUser, pin: '9999');
    authRepo.setCurrentUser(cashierUser);

    cashViewModel = CashShiftViewModel.fromDatabase(
      database: database,
      currentUserId: cashierUser.id,
      currentUserName: cashierUser.name,
      currentTerminalId: 'terminal-q80-01',
    );
    cashViewModel.setUserRole(UserRole.cashier);
  });

  tearDown(() async {
    await database.close();
  });

  group('E2E Real Floor/SQLite: Arqueo Ciego y Ciclo de Caja por Modo de Operación', () {
    test('Ciclo E2E completo: Apertura -> Ventas -> Arqueo Ciego Foodpark -> Ajuste Manager -> Restaurante PIN -> Corte Z', () async {
      // -----------------------------------------------------------------------
      // ETAPA 1: Configuración de Foodpark QSR en SQLite Real
      // -----------------------------------------------------------------------
      await configService.setOperationMode(TenantOperationMode.foodparkQsr);
      final initialPolicy = await configService.getSupervisionPolicy();

      expect(initialPolicy.blindCountEnabled, isTrue,
          reason: 'En Foodpark/QSR los saldos esperados están protegidos por defecto');
      expect(initialPolicy.supervisorRequiredForPartialXReport, isFalse,
          reason: 'En Foodpark/QSR la lectura Corte X es libre sin PIN para no trabar la fila');
      expect(initialPolicy.selfAuthorizationAllowedCloseBox, isTrue,
          reason: 'En Foodpark/QSR el cierre de caja no se bloquea');

      // -----------------------------------------------------------------------
      // ETAPA 2: Apertura de Turno con Fondo Inicial Real en SQLite
      // -----------------------------------------------------------------------
      await cashViewModel.init();
      expect(cashViewModel.hasActiveShift, isFalse);

      final opened = await cashViewModel.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 20.0,
        notes: 'Apertura turno Carlos Cajero',
      );
      expect(opened, isTrue);
      expect(cashViewModel.hasActiveShift, isTrue);
      final activeShift = cashViewModel.activeShift!;
      expect(activeShift.openingBalanceNio, 1000.0);
      expect(activeShift.openingBalanceUsd, 20.0);

      // -----------------------------------------------------------------------
      // ETAPA 3: Registro de Ingreso Real en SQLite
      // -----------------------------------------------------------------------
      final cashInOk = await cashViewModel.recordMovement(
        type: 'CASH_IN',
        amountNio: 500.0,
        amountUsd: 0.0,
        reason: 'Cobro de ventas en mostrador',
      );
      expect(cashInOk, isTrue);
      expect(cashViewModel.effectiveExpectedNio, 1500.0);
      expect(cashViewModel.effectiveExpectedUsd, 20.0);

      // -----------------------------------------------------------------------
      // ETAPA 4: Verificación de Arqueo Ciego por Rol
      // -----------------------------------------------------------------------
      // El cajero NO tiene permiso para ver los saldos teóricos esperados
      expect(initialPolicy.canViewExpectedCash(cashierUser.role.name), isFalse,
          reason: 'El cajero ve C\$ ••••••');

      // El manager sí puede ver los saldos teóricos esperados
      expect(initialPolicy.canViewExpectedCash(managerUser.role.name), isTrue,
          reason: 'El manager ve las cifras reales C\$ 1500.00');

      // -----------------------------------------------------------------------
      // ETAPA 5: El Manager decide deshabilitar el arqueo ciego para su Foodpark
      // -----------------------------------------------------------------------
      final customQsrPolicy = initialPolicy.copyWith(blindCountEnabled: false);
      await configService.setSupervisionPolicy(customQsrPolicy);

      // Re-consultar desde SQLite real
      final reloadedPolicy = await configService.getSupervisionPolicy();
      expect(reloadedPolicy.blindCountEnabled, isFalse);
      expect(reloadedPolicy.canViewExpectedCash(cashierUser.role.name), isTrue,
          reason: 'Ahora el cajero puede ver los saldos esperados por decisión del manager');

      // -----------------------------------------------------------------------
      // ETAPA 6: Transición a Modo RESTAURANT y Protección de Corte X
      // -----------------------------------------------------------------------
      await configService.setOperationMode(TenantOperationMode.restaurant);
      await configService.setSupervisionPolicy(
        SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant),
      );

      final restaurantPolicy = await configService.getSupervisionPolicy();
      expect(restaurantPolicy.blindCountEnabled, isTrue);
      expect(restaurantPolicy.supervisorRequiredForPartialXReport, isTrue,
          reason: 'En restaurante el Corte X exige PIN de supervisor');

      // Cajero intenta consultar Corte X: requiere autorización de supervisor
      final isAuthorizing = restaurantPolicy.authorizes(cashierUser.role.name);
      expect(isAuthorizing, isFalse);

      // Se ejecuta la autorización de supervisor mediante PIN '9999' de Roberto Morales
      final matches = await authRepo.identifyByCredential(
        credential: '9999',
        policy: restaurantPolicy,
      );
      expect(matches.length, 1);
      final supervisorMatch = matches.first;
      expect(supervisorMatch.userId, managerUser.id);
      expect(supervisorMatch.isAuthorizingRole, isTrue);

      // Se registra forensemente la auditoría en SQLite real
      await auditRepo.logForensic(
        'SUPERVISOR_OVERRIDE_X_REPORT',
        metodoAutorizacion: 'PIN',
        usuarioAutorizadorId: supervisorMatch.userId,
        metadata: jsonEncode({
          'action': 'view_x_report',
          'shift_id': activeShift.id,
          'blind_count_protected': restaurantPolicy.blindCountEnabled,
        }),
      );

      // Verificar que el log de auditoría se persistió inmutablemente en SQLite
      final auditLogs = await database.auditDao.findAllLogs();
      expect(auditLogs.isNotEmpty, isTrue);
      final lastLog = auditLogs.last;
      expect(lastLog.action, 'SUPERVISOR_OVERRIDE_X_REPORT');
      expect(lastLog.usuarioAutorizadorId, managerUser.id);
      expect(lastLog.metodoAutorizacion, 'PIN');

      // -----------------------------------------------------------------------
      // ETAPA 7: Cierre de Turno (Corte Z) con Conteo Ciego en SQLite Real
      // -----------------------------------------------------------------------
      // El cajero realiza el conteo físico a ciegas: C$ 1,500.00 y $20.00 USD
      final closed = await cashViewModel.closeShiftWithBlindCount(
        countedNio: 1500.0,
        countedUsd: 20.0,
        notes: 'Arqueo ciego cuadrado exacto al centavo',
        supervisorId: null,
      );
      expect(closed, isTrue);

      // Verificar en SQLite real que la sesión está cerrada sin discrepancia
      final closedShift = cashViewModel.lastClosedShift!;
      expect(closedShift.isClosed, isTrue);
      expect(closedShift.closingCountedNio, 1500.0);
      expect(closedShift.closingCountedUsd, 20.0);
      expect(closedShift.differenceNio, 0.0);
      expect(closedShift.differenceUsd, 0.0);
    });
  });
}
