import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/ui/features/cash/widgets/x_report_dialog.dart';
import 'package:pos_app/ui/features/cash/widgets/z_report_dialog.dart';

/// D-14/#4-#6: X/Z report operator rows must show a person's NAME, never a
/// user id. The label text changes from "Cajero ID"/"Supervisor Autoriza" to
/// "Cajero"/"Supervisor"; unresolved identities get the honest fallback
/// ("Operador no disponible" / "Supervisor no disponible"), never the UUID.
CashierSessionEntity closedShift() => CashierSessionEntity(
      id: 'shift-1',
      userId: 'user-cajero-1',
      terminalId: 'term-main',
      openedAt: 1716000000000,
      closedAt: 1716028800000,
      tipoModelo: 'CAJA_CENTRAL',
      openingBalanceNio: 1000.0,
      openingBalanceUsd: 50.0,
      closingCountedNio: 1050.0,
      closingCountedUsd: 50.0,
      expectedNio: 1000.0,
      expectedUsd: 50.0,
      differenceNio: 50.0,
      differenceUsd: 0.0,
      zReportSequence: 5,
      isClosed: true,
      supervisorId: 'sup-01',
      syncStatus: 'pending',
    );

void main() {
  testWidgets('X report shows the resolved cashier name under a "Cajero" row',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: XReportDialog(
            shift: closedShift(),
            movements: const [],
            effectiveExpectedNio: 1000.0,
            effectiveExpectedUsd: 50.0,
            cashierName: 'María Pérez',
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Cajero'), findsOneWidget);
    expect(find.text('María Pérez'), findsOneWidget);
    expect(find.text('Cajero ID'), findsNothing);
    expect(find.text('user-cajero-1'), findsNothing);
    expect(
      find.textContaining(
          RegExp('[0-9a-f]{8}-[0-9a-f]{4}', caseSensitive: false)),
      findsNothing,
    );
  });

  testWidgets('Z report shows resolved cashier and supervisor names', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ZReportDialog(
            shift: closedShift(),
            cashierName: 'María Pérez',
            supervisorName: 'Luis Rojas',
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Cajero'), findsOneWidget);
    expect(find.text('María Pérez'), findsOneWidget);
    expect(find.text('Supervisor'), findsOneWidget);
    expect(find.text('Luis Rojas'), findsOneWidget);
    expect(find.text('Cajero ID'), findsNothing);
    expect(find.text('Supervisor Autoriza'), findsNothing);
    expect(find.text('user-cajero-1'), findsNothing);
    expect(find.text('sup-01'), findsNothing);
  });

  testWidgets('unresolved identities get the honest fallback, never the raw id',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ZReportDialog(shift: closedShift()),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Operador no disponible'), findsOneWidget);
    expect(find.text('Supervisor no disponible'), findsOneWidget);
    expect(find.text('user-cajero-1'), findsNothing);
    expect(find.text('sup-01'), findsNothing);
  });
}
