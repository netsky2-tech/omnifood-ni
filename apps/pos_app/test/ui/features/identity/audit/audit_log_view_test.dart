import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view_model.dart';

class _FakeAuditRepository implements AuditRepository {
  final List<AuditLog> testLogs;

  _FakeAuditRepository(this.testLogs);

  @override
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId}) async {
    return testLogs;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthRepositoryForNames implements AuthRepository {
  final Map<String, String> usersById;

  _FakeAuthRepositoryForNames(this.usersById);

  @override
  Future<List<User>> getAllUsers() async => usersById.entries
      .map((e) => User(
            id: e.key,
            name: e.value,
            role: UserRole.cashier,
            isActive: true,
          ))
      .toList();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  final List<AuditLog> sampleLogs = [
    AuditLog(
      id: 1,
      sequenceNo: 1,
      prevHash: 'GENESIS',
      entryHash: 'hash-1',
      action: 'SALE_COMPLETED',
      userId: 'cajero_01',
      deviceId: 'SUNMI-V2S-01',
      timestamp: DateTime(2026, 8, 27, 10, 30),
      metadata: '{"invoiceNumber": "001-001-01-00000001", "total": 150.0}',
    ),
    AuditLog(
      id: 2,
      sequenceNo: 2,
      prevHash: 'hash-1',
      entryHash: 'hash-2',
      action: 'INVOICE_VOIDED',
      userId: 'supervisor_01',
      deviceId: 'SUNMI-V2S-01',
      timestamp: DateTime(2026, 8, 27, 11, 0),
      metadata: '{"reason": "DGI technical voiding"}',
    ),
    AuditLog(
      id: 3,
      sequenceNo: 3,
      prevHash: 'hash-2',
      entryHash: 'hash-3',
      action: 'USER_LOGIN',
      userId: 'cajero_02',
      deviceId: 'POS-DESKTOP-01',
      timestamp: DateTime(2026, 8, 27, 11, 15),
      metadata: '{"role": "CASHIER"}',
    ),
  ];

  Widget buildTestWidget(AuditLogViewModel viewModel) {
    return ChangeNotifierProvider<AuditLogViewModel>.value(
      value: viewModel,
      child: const MaterialApp(
        home: AuditLogView(),
      ),
    );
  }

  group('AuditLogView operator attribution (D-14)', () {
    testWidgets('audit rows and detail show the operator name, never the raw user id',
        (tester) async {
      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);
      final authRepo = _FakeAuthRepositoryForNames({
        'cajero_01': 'María Pérez',
        'supervisor_01': 'Luis Rojas',
        'cajero_02': 'Ana Rostrán',
      });

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuditLogViewModel>.value(value: viewModel),
            Provider<AuthRepository>.value(value: authRepo),
          ],
          child: const MaterialApp(home: AuditLogView()),
        ),
      );
      await tester.pumpAndSettle();

      // Row subtitles resolve the person's name.
      expect(find.textContaining('Usuario: María Pérez'), findsOneWidget);
      expect(find.textContaining('Usuario: Luis Rojas'), findsOneWidget);
      expect(find.textContaining('Usuario: Ana Rostrán'), findsOneWidget);
      expect(find.textContaining('Usuario: cajero_01'), findsNothing);

      // Detail dialog shows the resolved name too.
      await tester.tap(find.text('INVOICE_VOIDED'));
      await tester.pumpAndSettle();
      expect(find.text('Luis Rojas'), findsOneWidget);
      expect(find.text('supervisor_01'), findsNothing);
      expect(
        find.textContaining(
            RegExp('[0-9a-f]{8}-[0-9a-f]{4}', caseSensitive: false)),
        findsNothing,
      );

      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });

    testWidgets('audit view survives a missing identity provider with the honest fallback',
        (tester) async {
      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      // No AuthRepository in the tree: rows still never show a broken id.
      expect(find.textContaining('Usuario: Operador no disponible'),
          findsWidgets);
      expect(find.textContaining('Usuario: cajero_01'), findsNothing);
    });
  });

  group('AuditLogView localized ledger actions', () {
    testWidgets('renders the Spanish ledger label as primary text, never the raw code',
        (tester) async {
      final repo = _FakeAuditRepository([
        AuditLog(
          id: 1,
          sequenceNo: 1,
          prevHash: 'GENESIS',
          entryHash: 'hash-1',
          action: 'SALE_CREATED',
          userId: 'cajero_01',
          deviceId: 'SUNMI-V2S-01',
          timestamp: DateTime(2026, 8, 27, 10, 30),
          metadata: '{"invoice_id": "inv-1"}',
        ),
      ]);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      // Primary text is the Spanish label, matching the owner dashboard copy.
      expect(find.text('Venta registrada'), findsOneWidget);
      // The raw machine code is never the entry's primary label.
      expect(find.text('SALE_CREATED'), findsNothing);

      // Forensic reachability: the raw code stays available as secondary
      // information in the entry's detail surface.
      await tester.tap(find.text('Venta registrada'));
      await tester.pumpAndSettle();
      expect(find.text('SALE_CREATED'), findsOneWidget);

      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });
  });

  group('AuditLogView metadata presentation (humanised, raw secondary)', () {
    // The POS's own audit writers emit these metadata keys
    // (sales_repository_impl / durable_print_service / sale_view). The
    // detail surface must render them as labelled Spanish rows — never as a
    // raw JSON dump — while keeping the full raw payload reachable as
    // secondary evidence.
    final posMetadataLog = AuditLog(
      id: 9,
      sequenceNo: 9,
      prevHash: 'GENESIS',
      entryHash: 'hash-9',
      action: 'SALE_VOIDED',
      userId: 'cajero_01',
      deviceId: 'SUNMI-V2S-01',
      timestamp: DateTime(2026, 8, 27, 12, 0),
      metadata:
          '{"invoice_id": "inv-77", "number": "31", "total": "250.00", "reason_code": "CLIENTE_DESISTE", "unknown_extra_key": "valor opaco"}',
    );

    testWidgets('metadata renders as humanised labelled rows, never a raw JSON dump',
        (tester) async {
      final repo = _FakeAuditRepository([posMetadataLog]);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Anulación de factura'));
      await tester.pumpAndSettle();

      // Every POS-written key gets its Spanish label, and the values render
      // verbatim.
      expect(find.textContaining('Factura (ID)'), findsOneWidget);
      expect(find.textContaining('Número de factura'), findsOneWidget);
      expect(find.textContaining('Total:'), findsOneWidget);
      expect(find.text('250.00'), findsOneWidget);
      expect(find.textContaining('Código del motivo'), findsOneWidget);
      expect(find.textContaining('Anulación de factura'), findsWidgets);

      // Unknown keys degrade honestly: humanised (underscores to spaces),
      // never hidden and never a JSON dump.
      expect(find.textContaining('unknown extra key'), findsOneWidget);
      expect(find.textContaining('valor opaco'), findsOneWidget);

      // The raw JSON blob with quoted English keys is NOT the primary
      // presentation: nothing on screen shows it before the operator asks.
      expect(find.textContaining('"invoice_id"'), findsNothing);
      expect(find.textContaining('"reason_code"'), findsNothing);
    });

    testWidgets('the raw JSON payload stays reachable via the secondary ver-crudo affordance',
        (tester) async {
      final repo = _FakeAuditRepository([posMetadataLog]);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Anulación de factura'));
      await tester.pumpAndSettle();

      // Secondary affordance is collapsed by default.
      expect(find.text('Ver crudo'), findsOneWidget);
      expect(find.textContaining('"invoice_id"'), findsNothing);

      await tester.tap(find.text('Ver crudo'));
      await tester.pumpAndSettle();

      // The full raw payload is now visible: evidence is not destroyed.
      expect(find.textContaining('"invoice_id"'), findsOneWidget);
      expect(find.textContaining('"total"'), findsOneWidget);
    });

    testWidgets('non-JSON metadata degrades verbatim instead of crashing', (tester) async {
      final repo = _FakeAuditRepository([
        AuditLog(
          id: 10,
          sequenceNo: 10,
          prevHash: 'GENESIS',
          entryHash: 'hash-10',
          action: 'DRAWER_OPENED_MANUALLY',
          userId: 'cajero_01',
          deviceId: 'SUNMI-V2S-01',
          timestamp: DateTime(2026, 8, 27, 12, 30),
          metadata: 'texto no parseable',
        ),
      ]);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Apertura manual de gaveta'));
      await tester.pumpAndSettle();

      expect(find.text('texto no parseable'), findsOneWidget);
    });
  });

  group('AuditLogView UI/UX & Responsiveness', () {
    testWidgets('renders log list, action badges and category chips on Sunmi V2s handheld (360x720dp)', (tester) async {
      tester.view.physicalSize = const Size(360, 720);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      expect(find.text('Registro de Auditoría'), findsOneWidget);
      expect(find.text('SALE_COMPLETED'), findsOneWidget);
      expect(find.text('INVOICE_VOIDED'), findsOneWidget);
      expect(find.text('VENTA'), findsOneWidget);
      expect(find.text('ANULACIÓN'), findsOneWidget);

      // Tap to inspect metadata modal
      await tester.tap(find.text('INVOICE_VOIDED'));
      await tester.pumpAndSettle();

      expect(find.text('METADATOS REGISTRADOS:'), findsOneWidget);
      expect(find.textContaining('DGI technical voiding'), findsOneWidget);
      expect(find.text('CERRAR'), findsOneWidget);

      await tester.tap(find.text('CERRAR'));
      await tester.pumpAndSettle();
    });

    testWidgets('filters logs by search query and category chips', (tester) async {
      final repo = _FakeAuditRepository(sampleLogs);
      final viewModel = AuditLogViewModel(repo);

      await tester.pumpWidget(buildTestWidget(viewModel));
      await tester.pumpAndSettle();

      // 1. Filter by category chip ANULACIONES
      await tester.tap(find.text('ANULACIONES'));
      await tester.pumpAndSettle();

      expect(find.text('INVOICE_VOIDED'), findsOneWidget);
      expect(find.text('SALE_COMPLETED'), findsNothing);

      // 2. Clear category, filter by search query
      await tester.tap(find.text('TODOS'));
      await tester.pumpAndSettle();

      final searchField = find.byType(TextField);
      await tester.enterText(searchField, 'cajero_01');
      await tester.pumpAndSettle();

      expect(find.text('SALE_COMPLETED'), findsOneWidget);
      expect(find.text('INVOICE_VOIDED'), findsNothing);
    });
  });
}
