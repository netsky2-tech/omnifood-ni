import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';

class MockDio extends Mock implements Dio {
  @override
  BaseOptions get options => super.noSuchMethod(
        Invocation.getter(#options),
        returnValue: BaseOptions(),
        returnValueForMissingStub: BaseOptions(),
      );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase database;
  late LocalAuthService localAuth;
  late MockDio mockDio;
  late AuthRepositoryImpl authRepo;
  late AuditRepositoryImpl auditRepo;
  late TenantCapabilityCache capabilityCache;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    localAuth = LocalAuthService();
    mockDio = MockDio();

    capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-phase-5',
      nowUtc: () => DateTime.now().toUtc(),
    );

    authRepo = AuthRepositoryImpl(
      database.userDao,
      database.securityProfileDao,
      localAuth,
      mockDio,
      capabilityCache: capabilityCache,
    );

    auditRepo = AuditRepositoryImpl(
      database.auditDao,
      authRepo,
      mockDio,
      'pos-terminal-phase-5',
      capabilityCache: capabilityCache,
      forensicAlertDao: database.forensicAlertDao,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 5: Cierre de Turno por Declaración a Ciegas (Blind Count)', () {
    test('Conteo ciego -> Sellado Z-Report -> Detección de Faltante C\$ 50.00 -> Cierre de Sesión y Logout', () async {
      // 1. Setup Cajero y Sesión Abierta con expectativa teórica
      const cashierId = 'cajero-blind-01';
      await database.userDao.insertUsers([
        UserEntity(id: cashierId, name: 'Cajero Blind', role: 'CASHIER', pinHash: '', isActive: true, tenantId: 'tenant-demo'),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(userId: cashierId, pinHash: localAuth.hashPin('123456'), isPinEnabled: true, isTotpEnabled: false),
      ]);

      await authRepo.loginOffline(cashierId, '123456');

      // Sesión abierta donde el sistema calculó teóricamente:
      // Esperado Efectivo NIO: C$ 3,500.00
      // Esperado USD: $20.00
      // Esperado Tarjetas: C$ 500.00
      final initialSession = CashierSessionEntity(
        id: 'shift-blind-001',
        userId: cashierId,
        openedAt: DateTime.now().subtract(const Duration(hours: 8)).millisecondsSinceEpoch,
        tipoModelo: 'CAJA_CENTRAL',
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 0.0,
        expectedNio: 3500.0,
        expectedUsd: 20.0,
        isClosed: false,
      );
      await database.cashierSessionDao.insertSession(initialSession);

      // 2. Iniciación: El Cajero presiona "Cerrar Turno".
      // En la interfaz de conteo ciego, los campos de saldos esperados están ocultos/no visibles para el cajero.
      final activeShift = await database.cashierSessionDao.getActiveSession();
      expect(activeShift, isNotNull);
      expect(activeShift!.isClosed, isFalse);

      // 3. Conteo Físico (Declaración a Ciegas por el Cajero):
      const declaredCashNio = 3450.0; // Falta C$ 50.00 respecto a los C$ 3,500.00 teóricos
      const declaredCashUsd = 20.0;
      const declaredCards = 500.0;

      // 4. Sellado y Arqueo (Z-Report):
      final diffNio = declaredCashNio - activeShift.expectedNio; // 3450 - 3500 = -50.00 (Faltante)
      final diffUsd = declaredCashUsd - activeShift.expectedUsd; // 20 - 20 = 0.00

      expect(diffNio, equals(-50.0));
      expect(diffUsd, equals(0.0));

      final closedShift = CashierSessionEntity(
        id: activeShift.id,
        userId: activeShift.userId,
        openedAt: activeShift.openedAt,
        closedAt: DateTime.now().millisecondsSinceEpoch,
        tipoModelo: activeShift.tipoModelo,
        openingBalanceNio: activeShift.openingBalanceNio,
        openingBalanceUsd: activeShift.openingBalanceUsd,
        closingCountedNio: declaredCashNio,
        closingCountedUsd: declaredCashUsd,
        expectedNio: activeShift.expectedNio,
        expectedUsd: activeShift.expectedUsd,
        differenceNio: diffNio,
        differenceUsd: diffUsd,
        zReportSequence: 101,
        isClosed: true,
        notes: 'Arqueo Z-Report con faltante declarado',
      );

      await database.cashierSessionDao.updateSession(closedShift);

      // Si hay discrepancia/faltante, se registra alerta en el Audit Trail
      if (diffNio < 0) {
        await auditRepo.logForensic(
          'pos:shift:discrepancy_alert',
          metadata: '{"shift_id":"${activeShift.id}","faltante_nio":${diffNio.abs()},"esperado_nio":${activeShift.expectedNio},"contado_nio":$declaredCashNio,"z_report":101}',
          metodoAutorizacion: 'SYSTEM',
        );
      }

      // 5. Verificaciones Finales:
      // A) No hay turnos abiertos en la base de datos
      final remainingActive = await database.cashierSessionDao.getActiveSession();
      expect(remainingActive, isNull);

      // B) El turno cerrado tiene estado isClosed = true y diferencia registrada
      final persistedShift = await database.cashierSessionDao.getSessionById(activeShift.id);
      expect(persistedShift, isNotNull);
      expect(persistedShift!.isClosed, isTrue);
      expect(persistedShift.differenceNio, equals(-50.0));
      expect(persistedShift.zReportSequence, equals(101));

      // C) La alerta de discrepancia existe en el Audit Trail
      final logs = await auditRepo.getLocalLogs(userId: cashierId);
      final discrepancyLog = logs.firstWhere((l) => l.action == 'pos:shift:discrepancy_alert');
      expect(discrepancyLog.metadata, contains('"faltante_nio":50.0'));

      // D) El cajero cierra sesión y la terminal vuelve al estado Login/Lock
      await authRepo.logout();
      final currentUserAfterLogout = await authRepo.getCurrentUser();
      expect(currentUserAfterLogout, isNull);
    });
  });
}
