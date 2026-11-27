import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_backup_card.dart';

void main() {
  group('#526 B3 UI: TerminalBackupCard role gating', () {
    testWidgets('CASHIER sees restricted notice and no export/restore buttons',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TerminalBackupCard(
              currentUserRoleOverride: UserRole.cashier,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('terminal_backup_restricted_notice')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('terminal_backup_export_btn')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('terminal_backup_restore_btn')),
        findsNothing,
      );
    });

    testWidgets('OWNER sees Export and Restore buttons', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TerminalBackupCard(
              currentUserRoleOverride: UserRole.owner,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('terminal_backup_export_btn')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('terminal_backup_restore_btn')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('terminal_backup_restricted_notice')),
        findsNothing,
      );
    });
  });
}
