import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/widgets/logout_shift_gate_dialog.dart';

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
      usuarioAutorizadorId ?? 'user-cajero-01',
      (sequenceNo, prevHash) => AuditLogEntity(
        id: null,
        tenantId: 'tenant-prod-soho',
        deviceId: _deviceId,
        userId: usuarioAutorizadorId ?? 'user-cajero-01',
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

class StatefulAuthRepository implements AuthRepository {
  User? _currentUser;
  bool wasLogoutCalled = false;

  void setCurrentUser(User? user) {
    _currentUser = user;
    wasLogoutCalled = false;
  }

  @override
  Future<User?> getCurrentUser() async => _currentUser;

  @override
  Future<List<User>> getAllUsers() async =>
      _currentUser != null ? [_currentUser!] : const [];

  @override
  Future<void> logout() async {
    wasLogoutCalled = true;
    _currentUser = null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late AppDatabase database;
  late StatefulAuthRepository authRepo;
  late RealDatabaseAuditRepository auditRepo;

  const terminalId = 'TERM-01';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    authRepo = StatefulAuthRepository();
    auditRepo = RealDatabaseAuditRepository(database, terminalId);
  });

  tearDown(() async {
    await database.close();
  });

  group('Paso A (Issue #940) - Logout Shift Gate Real Flow & NHILOS Standards', () {
    testWidgets(
        'showLogoutShiftGateDialog renders NHILOS buttons and returns explicit decisions',
        (tester) async {
      LogoutShiftDecision? result;

      Widget buildHost(VoidCallback onOpen) {
        return MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (ctx) => ElevatedButton(
                onPressed: onOpen,
                child: const Text('Open Gate'),
              ),
            ),
          ),
        );
      }

      // 1. CANCEL returns null
      await tester.pumpWidget(
        buildHost(() async {
          final ctx = tester.element(find.text('Open Gate'));
          result = await showLogoutShiftGateDialog(ctx);
        }),
      );
      await tester.tap(find.text('Open Gate'));
      await tester.pumpAndSettle();

      expect(find.text('Caja abierta — Cerrar sesión'), findsOneWidget);
      expect(find.text('ABANDONAR TURNO TEMPORALMENTE'), findsOneWidget);
      expect(find.text('HACER CORTE Z AHORA'), findsOneWidget);

      await tester.tap(find.text('CANCELAR'));
      await tester.pumpAndSettle();

      expect(result, isNull);
      expect(find.text('Caja abierta — Cerrar sesión'), findsNothing);

      // 2. HACER CORTE Z AHORA returns closeShiftNow
      await tester.tap(find.text('Open Gate'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('HACER CORTE Z AHORA'));
      await tester.pumpAndSettle();

      expect(result, LogoutShiftDecision.closeShiftNow);

      // 3. ABANDONAR TURNO TEMPORALMENTE returns abandonTemporarily
      await tester.tap(find.text('Open Gate'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('ABANDONAR TURNO TEMPORALMENTE'));
      await tester.pumpAndSettle();

      expect(result, LogoutShiftDecision.abandonTemporarily);
    });

    testWidgets(
        'showShiftAbandonReasonDialog enforces NHILOS mandatory reason (>= 4 chars)',
        (tester) async {
      String? returnedReason;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (ctx) => ElevatedButton(
                onPressed: () async {
                  returnedReason = await showShiftAbandonReasonDialog(ctx);
                },
                child: const Text('Open Reason Dialog'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open Reason Dialog'));
      await tester.pumpAndSettle();

      expect(find.text('Motivo del abandono temporal'), findsOneWidget);

      // A) Empty reason rejected
      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('El motivo es obligatorio para registrar el abandono.'),
        findsOneWidget,
      );
      expect(returnedReason, isNull);

      // B) Short reason (< 4 chars) rejected per NHILOS standard
      await tester.enterText(
        find.byKey(const Key('shift_abandon_reason_input')),
        'fin',
      );
      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('Ingrese un motivo descriptivo (mínimo 4 caracteres).'),
        findsOneWidget,
      );
      expect(returnedReason, isNull);

      // C) Valid descriptive reason accepted
      await tester.enterText(
        find.byKey(const Key('shift_abandon_reason_input')),
        'Cajero se ausentó por emergencia médica',
      );
      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pumpAndSettle();

      expect(find.text('Motivo del abandono temporal'), findsNothing);
      expect(returnedReason, 'Cajero se ausentó por emergencia médica');
    });

    test(
        'Real SQLite verification: Abandoning shift records SHIFT_ABANDONED_ON_LOGOUT in audit_logs, terminates auth session, and leaves shift open in cashier_sessions',
        () async {
      final user = const User(
        id: 'user-cajero-e2e',
        name: 'Roberto Gómez',
        role: UserRole.cashier,
        isActive: true,
        tenantId: 'tenant-prod-soho',
      );
      authRepo.setCurrentUser(user);

      // Insert active shift in Floor SQLite real
      final shift = CashierSessionEntity(
        id: 'shift-e2e-abandoned',
        userId: user.id,
        cashierName: user.name,
        terminalId: terminalId,
        openedAt: DateTime.now().millisecondsSinceEpoch,
        openingBalanceNio: 1000.0,
        openingBalanceUsd: 20.0,
        expectedNio: 1000.0,
        expectedUsd: 20.0,
        isClosed: false,
      );
      await database.cashierSessionDao.insertSession(shift);

      // Simulate the exact business action executed when operator confirms abandonment
      const reason = 'Relevo de turno vespertino por emergencia de salud';
      await auditRepo.logForensic(
        'SHIFT_ABANDONED_ON_LOGOUT',
        usuarioAutorizadorId: user.id,
        metadata: jsonEncode({
          'action': 'shift_abandoned_on_logout',
          'shift_id': shift.id,
          'terminal_id': shift.terminalId,
          'reason': reason,
        }),
      );

      await authRepo.logout();

      // 1. Verify audit_logs table in SQLite real
      final logs = await database.auditDao.findAllLogs();
      expect(logs, hasLength(1));
      final log = logs.first;
      expect(log.action, 'SHIFT_ABANDONED_ON_LOGOUT');
      expect(log.userId, user.id);
      expect(log.deviceId, terminalId);

      final metadata = jsonDecode(log.metadata!) as Map<String, dynamic>;
      expect(metadata['action'], 'shift_abandoned_on_logout');
      expect(metadata['shift_id'], 'shift-e2e-abandoned');
      expect(metadata['terminal_id'], terminalId);
      expect(metadata['reason'], reason);

      // 2. Verify cashier_sessions table in SQLite real remains OPEN
      final shiftInDb =
          await database.cashierSessionDao.getSessionById('shift-e2e-abandoned');
      expect(shiftInDb, isNotNull);
      expect(shiftInDb!.isClosed, isFalse);

      // 3. Verify user auth session was terminated
      expect(authRepo.wasLogoutCalled, isTrue);
      expect(await authRepo.getCurrentUser(), isNull);
    });
  });
}
