import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';

/// Real local audit repository writing directly to SQLite audit_logs table
/// with zero mocks, matching production Floor persistence.
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
      'tenant-prod-soho',
      _deviceId,
      usuarioAutorizadorId ?? 'system',
      (sequenceNo, prevHash) => AuditLogEntity(
        id: null,
        tenantId: 'tenant-prod-soho',
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

/// Simple stateful auth repository providing the logged-in user without mocks.
class MemoryAuthRepository implements AuthRepository {
  User? _user;

  void setCurrentUser(User? user) {
    _user = user;
  }

  @override
  Future<User?> getCurrentUser() async => _user;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late AppDatabase database;
  late MemoryAuthRepository authRepo;
  late RealDatabaseAuditRepository auditRepo;

  const terminalId = 'TERM-MAN-01';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    authRepo = MemoryAuthRepository();
    auditRepo = RealDatabaseAuditRepository(database, terminalId);
  });

  tearDown(() async {
    await database.close();
  });

  group('Issue #940 (Paso B) - Real E2E SQLite Lifecycle Flow without Mocks', () {
    test(
        'Complete lifecycle: Operator 1 opens shift -> attempt duplicate via openSession blocked -> Operator 1 leaves shift orphaned -> Operator 2 cannot see or close it -> Owner detects orphan shift -> Owner administratively closes it with reason & audit log -> Terminal is clean',
        () async {
      // -----------------------------------------------------------------------
      // ETAPA 1: Cajero Juan (Operador 1) inicia sesión y abre turno
      // -----------------------------------------------------------------------
      final juan = const User(
        id: 'user-juan-01',
        name: 'Juan Pérez',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-prod-soho',
      );
      authRepo.setCurrentUser(juan);

      final vmJuan = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        auditRepository: auditRepo,
        authRepository: authRepo,
        currentUserId: juan.id,
        currentUserName: juan.name,
        currentTerminalId: terminalId,
        currentUserRole: juan.role,
        openAccountsLoader: () async => const [],
      );

      await vmJuan.init();
      expect(vmJuan.hasActiveShift, isFalse);
      expect(vmJuan.openTerminalShifts, isEmpty);

      // Abre turno con fondo dual: C$ 1,000 NIO y $40 USD
      final openedJuan = await vmJuan.openShift(
        initialFloatNio: 1000.0,
        initialFloatUsd: 40.0,
        notes: 'Apertura de turno matutino Juan',
      );
      expect(openedJuan, isTrue);
      expect(vmJuan.hasActiveShift, isTrue);
      final shiftJuanId = vmJuan.activeShift!.id;

      // Juan registra un ingreso de sencillo de C$ 200
      final movOk = await vmJuan.recordMovement(
        type: 'CASH_IN',
        amountNio: 200.0,
        amountUsd: 0.0,
        reason: 'Sencillo inicial',
      );
      expect(movOk, isTrue);
      expect(vmJuan.activeShift!.expectedNio, 1200.0);

      // Juan registra una venta en efectivo de C$ 150 en SQLite real
      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-juan-01',
          number: 'FAC-001',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: juan.id,
          subtotal: 150.0,
          totalTax: 0.0,
          total: 150.0,
          paymentStatus: 'PAID',
          shiftId: shiftJuanId,
          terminalId: terminalId,
        ),
      );
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-juan-01',
          invoiceId: 'inv-juan-01',
          amount: 150.0,
          currency: 'NIO',
          exchangeRate: 36.50,
          method: 'cash',
          changeGiven: 0.0,
          changeCurrency: 'NIO',
          reconciliationSyncStatus: 'synced',
          createdAt: DateTime.now().millisecondsSinceEpoch,
        ),
      ]);

      // -----------------------------------------------------------------------
      // ETAPA 2: Prevención de turnos huérfanos por doble apertura (Guard openSession)
      // -----------------------------------------------------------------------
      // Si por error de interfaz o re-intento Juan llama openSession en la ruta de ventas:
      final saleVmJuan = SaleViewModel.withLoyalty(
        FakeSalesRepository(),
        FakeInventoryRepository(),
        authRepo,
        database,
        autoLoad: false,
        terminalId: terminalId,
      );

      // El guard de SaleViewModel.openSession debe detectar el turno activo de Juan y bloquear la duplicación
      await saleVmJuan.openSession(500.0);
      expect(saleVmJuan.errorMessage,
          'Ya existe un turno de caja activo en esta terminal.');

      // Verificamos en Floor SQLite que NO se creó una segunda sesión:
      final allSessionsInDb = await database.cashierSessionDao.getAllSessions();
      expect(allSessionsInDb, hasLength(1),
          reason: 'El guard previno la duplicación de turnos en el mismo terminal');

      // -----------------------------------------------------------------------
      // ETAPA 3: Juan se retira / abandona el turno (la sesión queda abierta en BD)
      // -----------------------------------------------------------------------
      // Juan cierra sesión en auth sin hacer Corte Z (sesión huérfana en terminal)
      authRepo.setCurrentUser(null);

      // Verificamos que en la base de datos la sesión sigue abierta:
      final orphanCheck =
          await database.cashierSessionDao.getSessionById(shiftJuanId);
      expect(orphanCheck, isNotNull);
      expect(orphanCheck!.isClosed, isFalse);

      // -----------------------------------------------------------------------
      // ETAPA 4: Cajera Ana (Operador 2) ingresa en la misma terminal física
      // -----------------------------------------------------------------------
      final ana = const User(
        id: 'user-ana-02',
        name: 'Ana García',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-prod-soho',
      );
      authRepo.setCurrentUser(ana);

      final vmAna = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        auditRepository: auditRepo,
        authRepository: authRepo,
        currentUserId: ana.id,
        currentUserName: ana.name,
        currentTerminalId: terminalId,
        currentUserRole: ana.role,
        openAccountsLoader: () async => const [],
      );

      await vmAna.init();

      // Ana NO tiene turno activo (porque la sesión de Juan no le pertenece):
      expect(vmAna.hasActiveShift, isFalse);
      expect(vmAna.activeShift, isNull);

      // Pero gracias al fix del Paso B, Ana SÍ tiene visibilidad del turno huérfano en la terminal:
      expect(vmAna.hasOrphanShifts, isTrue);
      expect(vmAna.orphanShifts, hasLength(1));
      expect(vmAna.orphanShifts.first.id, shiftJuanId);
      expect(vmAna.orphanShifts.first.userId, juan.id);

      // Como Ana es cajera (no supervisor), si intenta cerrarlo administrativamente, es RECHAZADA:
      final anaCloseRefused = await vmAna.closeOrphanShift(
        shiftId: shiftJuanId,
        reason: 'Quiero abrir mi turno',
        countedNio: 1000.0,
        countedUsd: 40.0,
      );
      expect(anaCloseRefused, isFalse);
      expect(vmAna.errorMessage,
          'Solo un supervisor o dueño puede cerrar turnos huérfanos.');

      // -----------------------------------------------------------------------
      // ETAPA 5: El Dueño (Supervisor Carlos) audita y cierra el turno huérfano
      // -----------------------------------------------------------------------
      final carlosOwner = const User(
        id: 'user-carlos-owner',
        name: 'Carlos Propietario',
        role: UserRole.owner,
        isActive: true,
        tenantId: 'tenant-prod-soho',
      );
      authRepo.setCurrentUser(carlosOwner);

      final vmCarlos = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        auditRepository: auditRepo,
        authRepository: authRepo,
        currentUserId: carlosOwner.id,
        currentUserName: carlosOwner.name,
        currentTerminalId: terminalId,
        currentUserRole: carlosOwner.role,
        openAccountsLoader: () async => const [],
      );

      await vmCarlos.init();
      expect(vmCarlos.hasOrphanShifts, isTrue);

      // 1. Intento de cerrar sin motivo obligatorio: RECHAZADO
      final emptyReasonRefused = await vmCarlos.closeOrphanShift(
        shiftId: shiftJuanId,
        reason: '   ',
        countedNio: 1350.0,
        countedUsd: 40.0,
      );
      expect(emptyReasonRefused, isFalse);
      expect(vmCarlos.errorMessage,
          'Debe ingresar un motivo para el cierre administrativo.');

      // 2. Cierre administrativo formal con motivo y arqueo
      // Teórico esperado en gaveta:
      // Base (Fondo C$ 1,000 + Cash In C$ 200 = 1,200) + Venta C$ 150 = C$ 1,350.00 NIO.
      // Dólares: $40.00 USD.
      // Arqueo físico contado por el dueño: C$ 1,350.00 NIO y $40.00 USD (Diferencia = 0)
      final closeSuccess = await vmCarlos.closeOrphanShift(
        shiftId: shiftJuanId,
        reason: 'Cajero Juan abandonó el mostrador por urgencia personal',
        countedNio: 1350.0,
        countedUsd: 40.0,
        notes: 'Arqueo físico cuadrado en presencia del encargado',
      );
      expect(closeSuccess, isTrue);

      // -----------------------------------------------------------------------
      // ETAPA 6: Verificación de Integridad en SQLite Real
      // -----------------------------------------------------------------------
      // 1. La sesión en cashier_sessions está cerrada y tiene consecutivo Z
      final closedSessionInDb =
          await database.cashierSessionDao.getSessionById(shiftJuanId);
      expect(closedSessionInDb, isNotNull);
      expect(closedSessionInDb!.isClosed, isTrue);
      expect(closedSessionInDb.closedAt, isNotNull);
      expect(closedSessionInDb.closingCountedNio, 1350.0);
      expect(closedSessionInDb.closingCountedUsd, 40.0);
      expect(closedSessionInDb.expectedNio, 1350.0);
      expect(closedSessionInDb.expectedUsd, 40.0);
      expect(closedSessionInDb.differenceNio, 0.0);
      expect(closedSessionInDb.differenceUsd, 0.0);
      expect(closedSessionInDb.zReportSequence, 1);
      expect(closedSessionInDb.supervisorId, carlosOwner.id);
      expect(closedSessionInDb.notes,
          contains('[CIERRE ADMINISTRATIVO] Motivo: Cajero Juan abandonó'));
      expect(closedSessionInDb.notes,
          contains('Arqueo físico cuadrado en presencia'));

      // 2. La bitácora forense audit_logs en SQLite real tiene el evento CRITICAL
      final auditLogs = await database.auditDao.findAllLogs();
      expect(auditLogs, isNotEmpty);
      final forensicEvent = auditLogs.firstWhere(
          (log) => log.action == 'ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT');
      expect(forensicEvent, isNotNull);
      expect(forensicEvent.usuarioAutorizadorId, carlosOwner.id);
      expect(forensicEvent.metodoAutorizacion, 'SUPERVISOR_OVERRIDE');

      final meta = jsonDecode(forensicEvent.metadata!) as Map<String, dynamic>;
      expect(meta['shift_id'], shiftJuanId);
      expect(meta['terminal_id'], terminalId);
      expect(meta['original_user_id'], juan.id);
      expect(meta['supervisor_id'], carlosOwner.id);
      expect(meta['reason'],
          'Cajero Juan abandonó el mostrador por urgencia personal');
      expect(meta['z_sequence'], 1);

      // 3. El estado de turnos huérfanos en la terminal pasa a ser CERO
      await vmAna.init();
      expect(vmAna.hasOrphanShifts, isFalse);
      expect(vmAna.orphanShifts, isEmpty);

      // 4. Ahora la cajera Ana puede abrir su turno normalmente
      authRepo.setCurrentUser(ana);
      final anaOpened = await vmAna.openShift(
        initialFloatNio: 800.0,
        initialFloatUsd: 20.0,
        notes: 'Turno tarde Ana',
      );
      expect(anaOpened, isTrue);
      expect(vmAna.hasActiveShift, isTrue);
      expect(vmAna.activeShift!.userId, ana.id);
    });
  });
}
