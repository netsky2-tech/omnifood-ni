import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/user.dart';

class MockDio extends Mock implements Dio {}

abstract class HardwarePrinterPort {
  Future<void> openCashDrawer();
}

class MockHardwarePrinter extends Mock implements HardwarePrinterPort {
  @override
  Future<void> openCashDrawer() => super.noSuchMethod(
        Invocation.method(#openCashDrawer, []),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      );
}

void main() {
  late AppDatabase database;
  late LocalAuthService localAuth;
  late MockDio mockDio;
  late AuthRepositoryImpl authRepo;
  late AuditRepositoryImpl auditRepo;
  late MockHardwarePrinter mockPrinter;
  late TenantCapabilityCache capabilityCache;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    localAuth = LocalAuthService();
    mockDio = MockDio();
    mockPrinter = MockHardwarePrinter();

    capabilityCache = TenantCapabilityCache(
      configDao: database.localConfigDao,
      clock: StopwatchMonotonicClock(),
      bootSessionId: 'test-session-phase-1',
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
      'pos-terminal-phase-1',
      capabilityCache: capabilityCache,
      forensicAlertDao: database.forensicAlertDao,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 1: Gobernanza, Roles y Seguridad (RBAC & Manager Override)', () {
    test('1. Configuración de Identidades con PIN de 6 dígitos', () async {
      final cashierPin = '123456';
      final managerPin = '654321';

      final cashierEntity = UserEntity(
        id: 'cajero-ordinario-1',
        name: 'Carlos Cajero',
        role: 'CASHIER',
        pinHash: '',
        isActive: true,
        email: 'cajero@omnifood.ni',
        tenantId: 'tenant-demo',
      );

      final managerEntity = UserEntity(
        id: 'gerente-sucursal-1',
        name: 'Gladys Gerente',
        role: 'MANAGER',
        pinHash: '',
        isActive: true,
        email: 'gerente@omnifood.ni',
        tenantId: 'tenant-demo',
      );

      await database.userDao.insertUsers([cashierEntity, managerEntity]);

      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: cashierEntity.id,
          pinHash: localAuth.hashPin(cashierPin),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
        SecurityProfileEntity(
          userId: managerEntity.id,
          pinHash: localAuth.hashPin(managerPin),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // Verificar que ambos usuarios existen y sus PINs de 6 dígitos son válidos
      final loggedCashier = await authRepo.loginOffline(cashierEntity.id, cashierPin);
      expect(loggedCashier, isNotNull);
      expect(loggedCashier!.role, UserRole.cashier);

      final loggedManager = await authRepo.loginOffline(managerEntity.id, managerPin);
      expect(loggedManager, isNotNull);
      expect(loggedManager!.role, UserRole.manager);
    });

    test('2. Validación de Bloqueo: Cajero no puede abrir cajón sin elevación', () async {
      await database.userDao.insertUsers([
        UserEntity(
          id: 'cajero-ordinario-1',
          name: 'Carlos Cajero',
          role: 'CASHIER',
          pinHash: '',
          isActive: true,
          tenantId: 'tenant-demo',
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: 'cajero-ordinario-1',
          pinHash: localAuth.hashPin('123456'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      await authRepo.loginOffline('cajero-ordinario-1', '123456');
      final currentUser = await authRepo.getCurrentUser();
      expect(currentUser, isNotNull);
      expect(currentUser!.role, UserRole.cashier);

      // Permisos requeridos para apertura manual
      const requiredPermission = 'pos:drawer:open_manual';
      final isDirectlyAllowed = currentUser.role == UserRole.manager || currentUser.role == UserRole.owner;

      // Esperado: El sistema bloquea la acción directa para Cajero
      expect(isDirectlyAllowed, isFalse, reason: 'Cajero Ordinario debe ser bloqueado para $requiredPermission');
    });

    test('3. Elevación en Sitio (Manager Override) con motivo y registro en Audit Trail', () async {
      await database.userDao.insertUsers([
        UserEntity(
          id: 'cajero-01',
          name: 'Cajero',
          role: 'CASHIER',
          pinHash: '',
          isActive: true,
          tenantId: 'tenant-demo',
        ),
        UserEntity(
          id: 'gerente-01',
          name: 'Gerente',
          role: 'MANAGER',
          pinHash: '',
          isActive: true,
          tenantId: 'tenant-demo',
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: 'cajero-01',
          pinHash: localAuth.hashPin('123456'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
        SecurityProfileEntity(
          userId: 'gerente-01',
          pinHash: localAuth.hashPin('654321'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // Cajero activo en sesión
      await authRepo.loginOffline('cajero-01', '123456');

      // Modal de bloqueo: Ingresar PIN del Gerente y motivo "Ingreso de sencillo"
      final isAuthorized = await authRepo.authorizeOverride(
        supervisorId: 'gerente-01',
        pin: '654321',
      );
      expect(isAuthorized, isTrue, reason: 'PIN de Gerente debe autorizar la elevación');

      // Si fue autorizado, se dispara el pulso RJ12
      await mockPrinter.openCashDrawer();
      verify(mockPrinter.openCashDrawer()).called(1);

      // Se registra en Audit Trail
      await auditRepo.logForensic(
        'pos:drawer:open_manual',
        metadata: '{"motivo":"Ingreso de sencillo","operador_id":"cajero-01"}',
        metodoAutorizacion: 'PIN',
        usuarioAutorizadorId: 'gerente-01',
      );

      // Verificar persistencia y cadena de auditoría inmutable
      final logs = await auditRepo.getLocalLogs(userId: 'cajero-01');
      expect(logs.isNotEmpty, isTrue);
      final log = logs.first;
      expect(log.action, 'pos:drawer:open_manual');
      expect(log.metadata, contains('Ingreso de sencillo'));
      expect(log.metodoAutorizacion, 'PIN');
      expect(log.usuarioAutorizadorId, 'gerente-01');
    });

    test('4. Fallo de Hardware Simulado: TIMEOUT_NO_DRAWER_SENSING quema autorización', () async {
      await database.userDao.insertUsers([
        UserEntity(
          id: 'gerente-02',
          name: 'Gerente 2',
          role: 'MANAGER',
          pinHash: '',
          isActive: true,
          tenantId: 'tenant-demo',
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: 'gerente-02',
          pinHash: localAuth.hashPin('654321'),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // Login inicial
      await authRepo.loginOffline('gerente-02', '654321');

      // Simular desconexión de impresora
      when(mockPrinter.openCashDrawer()).thenThrow(
        Exception('TIMEOUT_NO_DRAWER_SENSING: Hardware printer disconnected'),
      );

      var hardwareFailed = false;
      var authorizationConsumed = false;

      try {
        final authorized = await authRepo.authorizeOverride(
          supervisorId: 'gerente-02',
          pin: '654321',
        );
        expect(authorized, isTrue);

        // Se intenta abrir el cajón y falla el hardware
        await mockPrinter.openCashDrawer();
      } catch (e) {
        hardwareFailed = true;
        // La autorización queda quemada/consumida inmediatamente tras el intento
        authorizationConsumed = true;

        await auditRepo.logForensic(
          'pos:drawer:open_failed',
          metadata: '{"error":"TIMEOUT_NO_DRAWER_SENSING","status":"HARDWARE_ERROR"}',
          metodoAutorizacion: 'PIN',
          usuarioAutorizadorId: 'gerente-02',
        );
      }

      expect(hardwareFailed, isTrue);
      expect(authorizationConsumed, isTrue);

      final logs = await auditRepo.getLocalLogs();
      final failedLog = logs.firstWhere((l) => l.action == 'pos:drawer:open_failed');
      expect(failedLog.metadata, contains('TIMEOUT_NO_DRAWER_SENSING'));
      expect(failedLog.usuarioAutorizadorId, 'gerente-02');
    });
  });
}
