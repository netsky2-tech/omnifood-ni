import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/config/business_profile/fiscal_authorization_expiry_notice_widget.dart';

void main() {
  group('D-21 (U4 #554): FiscalAuthorizationExpiryNotice widget', () {
    testWidgets('renders nothing when the expiry value is absent',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNotice(rawExpiresAt: null),
        ),
      ));

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });

    testWidgets('renders nothing for a corrupt expiry value',
        (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNotice(rawExpiresAt: '31/12/2026'),
        ),
      ));

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });

    testWidgets('shows the amber upcoming notice inside the 30-day window',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNotice(
            rawExpiresAt: '2026-07-15',
            today: DateTime(2026, 6, 15),
          ),
        ),
      ));

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsOneWidget);
      expect(
          find.text('Su código de autorización DGI vence el 2026-07-15 (en 30 días).'),
          findsOneWidget);
    });

    testWidgets('shows the stronger venció notice once expired',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNotice(
            rawExpiresAt: '2026-06-10',
            today: DateTime(2026, 6, 15),
          ),
        ),
      ));

      expect(
          find.text('Su código de autorización DGI venció el 2026-06-10.'),
          findsOneWidget);
    });

    testWidgets('loader renders the notice from the loaded config value',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNoticeLoader(
            loadExpiresAt: () async => '2026-07-15',
            today: DateTime(2026, 6, 15),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsOneWidget);
      expect(
          find.text('Su código de autorización DGI vence el 2026-07-15 (en 30 días).'),
          findsOneWidget);
    });

    testWidgets('loader renders nothing when the config has no value',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNoticeLoader(
            loadExpiresAt: () async => null,
            today: DateTime(2026, 6, 15),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });

    testWidgets('loader degrades to no notice when loading fails',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FiscalAuthorizationExpiryNoticeLoader(
            loadExpiresAt: () async => throw Exception('dao unavailable'),
            today: DateTime(2026, 6, 15),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('fiscal_authorization_expiry_notice')),
          findsNothing);
    });
  });
}
