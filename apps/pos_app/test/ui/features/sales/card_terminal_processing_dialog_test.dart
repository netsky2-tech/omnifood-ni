import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/mock_simulator_terminal_adapter.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';
import 'package:pos_app/domain/services/sales/card_payment_orchestrator.dart';
import 'package:pos_app/ui/features/sales/widgets/card_terminal_processing_dialog.dart';

void main() {
  group('CardTerminalProcessingDialog Widget Tests', () {
    late CardPaymentOrchestrator orchestrator;
    late MockSimulatorTerminalAdapter terminal;

    setUp(() {
      orchestrator = CardPaymentOrchestrator();
      terminal = MockSimulatorTerminalAdapter(
        terminalId: 'DATAFONO-BAC-WIDGET',
        acquirer: AcquirerBank.bac,
      );
    });

    tearDown(() {
      orchestrator.dispose();
    });

    Widget createWidgetUnderTest({
      required CardPaymentIntent intent,
      ValueChanged<CardAuthorizationResult>? onCompleted,
      VoidCallback? onFallbackToManual,
    }) {
      return MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => CardTerminalProcessingDialog(
                    orchestrator: orchestrator,
                    terminal: terminal,
                    intent: intent,
                    onCompleted: onCompleted,
                    onFallbackToManual: onFallbackToManual,
                  ),
                );
              },
              child: const Text('Open Dialog'),
            ),
          ),
        ),
      );
    }

    testWidgets('renders initial dialog with amount and waiting card message', (tester) async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-WIDGET-01',
        invoiceId: 'INV-01',
        amount: 1500.0,
        currency: 'NIO',
      );

      await tester.pumpWidget(createWidgetUnderTest(intent: intent));
      await tester.tap(find.text('Open Dialog'));
      await tester.pump();

      expect(find.text('Terminal Bancaria'), findsOneWidget);
      expect(find.textContaining('BAC Credomatic'), findsOneWidget);
      expect(find.text('C\$ 1500.00'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byKey(const Key('card_terminal_fallback_manual_btn')), findsOneWidget);
      expect(find.byKey(const Key('card_terminal_cancel_btn')), findsOneWidget);
    });

    testWidgets('shows approved state and triggers onCompleted callback', (tester) async {
      terminal.customAuthCode = 'AUTH-7788';
      terminal.customBatchNumber = 'B-100';
      terminal.customLast4 = '9999';

      CardAuthorizationResult? completedResult;

      const intent = CardPaymentIntent(
        transactionId: 'TRX-WIDGET-02',
        invoiceId: 'INV-02',
        amount: 800.0,
        currency: 'NIO',
      );

      await tester.pumpWidget(createWidgetUnderTest(
        intent: intent,
        onCompleted: (res) => completedResult = res,
      ));

      await tester.tap(find.text('Open Dialog'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text('¡Pago Aprobado!'), findsOneWidget);
      expect(find.textContaining('AUTH-7788'), findsOneWidget);
      expect(find.textContaining('Lote: B-100'), findsOneWidget);
      expect(completedResult?.authCode, 'AUTH-7788');
    });

    testWidgets('tapping fallback to manual triggers onFallbackToManual callback immediately', (tester) async {
      bool fallbackTriggered = false;

      const intent = CardPaymentIntent(
        transactionId: 'TRX-WIDGET-03',
        invoiceId: 'INV-03',
        amount: 500.0,
      );

      await tester.pumpWidget(createWidgetUnderTest(
        intent: intent,
        onFallbackToManual: () => fallbackTriggered = true,
      ));

      await tester.tap(find.text('Open Dialog'));
      await tester.pump();

      final fallbackBtn = find.byKey(const Key('card_terminal_fallback_manual_btn'));
      expect(fallbackBtn, findsOneWidget);

      await tester.tap(fallbackBtn);
      await tester.pumpAndSettle();

      expect(fallbackTriggered, isTrue);
    });

    testWidgets('tapping cancel aborts terminal operation', (tester) async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-WIDGET-04',
        invoiceId: 'INV-04',
        amount: 250.0,
      );

      await tester.pumpWidget(createWidgetUnderTest(intent: intent));
      await tester.tap(find.text('Open Dialog'));
      await tester.pump();

      final cancelBtn = find.byKey(const Key('card_terminal_cancel_btn'));
      expect(cancelBtn, findsOneWidget);

      await tester.tap(cancelBtn);
      await tester.pumpAndSettle();

      expect(terminal.operationCancelled, isTrue);
      expect(find.text('Terminal Bancaria'), findsNothing);
    });

    testWidgets('shows error state when declined and allows retry', (tester) async {
      terminal.shouldFailSale = true;
      terminal.failureErrorMessage = 'Fondos Insuficientes';

      const intent = CardPaymentIntent(
        transactionId: 'TRX-WIDGET-05',
        invoiceId: 'INV-05',
        amount: 3000.0,
      );

      await tester.pumpWidget(createWidgetUnderTest(intent: intent));
      await tester.tap(find.text('Open Dialog'));
      await tester.pumpAndSettle();

      expect(find.text('Fondos Insuficientes'), findsOneWidget);
      expect(find.byKey(const Key('card_terminal_retry_btn')), findsOneWidget);

      // Reset failure and tap retry
      terminal.shouldFailSale = false;
      await tester.tap(find.byKey(const Key('card_terminal_retry_btn')));
      await tester.pumpAndSettle();

      expect(find.text('¡Pago Aprobado!'), findsOneWidget);
    });
  });
}
