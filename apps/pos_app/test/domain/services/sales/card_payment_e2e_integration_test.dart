import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/manual_standalone_terminal_adapter.dart';
import 'package:pos_app/data/adapters/terminals/mock_simulator_terminal_adapter.dart';
import 'package:pos_app/domain/models/sales/batch_settlement.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';
import 'package:pos_app/domain/services/sales/card_payment_orchestrator.dart';
import 'package:pos_app/domain/services/sales/split_payment_calculator.dart';

void main() {
  group('Card Payment Flow E2E Integration Tests (Bloque 13)', () {
    late CardPaymentOrchestrator orchestrator;
    late MockSimulatorTerminalAdapter mockTerminal;
    late ManualStandaloneTerminalAdapter manualTerminal;

    setUp(() {
      orchestrator = CardPaymentOrchestrator();
      mockTerminal = MockSimulatorTerminalAdapter(
        terminalId: 'DATAFONO-BAC-SMART',
        acquirer: AcquirerBank.bac,
      );
      manualTerminal = ManualStandaloneTerminalAdapter(
        terminalId: 'DATAFONO-MANUAL-01',
        acquirer: AcquirerBank.banpro,
      );
    });

    tearDown(() {
      orchestrator.dispose();
    });

    test('E2E Flow 1: Split payment (Cash + Card via Orchestrator) completes with full voucher metadata', () async {
      // 1. Setup split payment calculator for C$ 1,500 total invoice
      var calc = const SplitPaymentCalculator(
        totalNio: 1500.0,
        commercialRate: 36.50,
      );

      // 2. Customer pays C$ 500 in Cash
      final cashP = calc.createCashPayment(
        tenderAmount: 500.0,
        tenderCurrency: 'NIO',
      );
      calc = calc.addPayment(cashP);
      expect(calc.remainingNio, 1000.0);

      // 3. Customer pays remaining C$ 1,000 with Card on BAC Terminal
      mockTerminal.customAuthCode = 'AUTH-776655';
      mockTerminal.customBatchNumber = 'BATCH-010';
      mockTerminal.customLast4 = '9900';
      mockTerminal.customCardBrand = CardBrand.visa;

      final authResult = await orchestrator.executePayment(
        terminal: mockTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-E2E-001',
          invoiceId: 'INV-E2E-100',
          amount: 1000.0,
          currency: 'NIO',
          cashierName: 'Maria Cajera',
        ),
      );

      expect(authResult.isSuccess, isTrue);
      expect(authResult.authCode, 'AUTH-776655');

      // 4. Inject card payment into split calculator
      final cardP = calc.createCardPayment(
        amount: 1000.0,
        currency: 'NIO',
        voucherCode: authResult.authCode,
        cardBrand: authResult.cardBrand?.name.toUpperCase(),
        cardType: authResult.cardType?.name.toUpperCase(),
        bankPos: authResult.acquirer.displayName,
        last4: authResult.last4,
        batchNumber: authResult.batchNumber,
      );
      calc = calc.addPayment(cardP);

      expect(calc.isFullyPaid, isTrue);
      expect(calc.remainingNio, 0.0);
      expect(calc.payments.length, 2);

      final cardPayment = calc.payments.firstWhere((p) => p.method == PaymentMethod.card);
      expect(cardPayment.voucherCode, 'AUTH-776655');
      expect(cardPayment.bankPos, 'BAC Credomatic');
      expect(cardPayment.last4, '9900');
      expect(cardPayment.reconciliationStatus, 'CONCILIADO');
    });

    test('E2E Flow 2: Hardware Failure -> Auto-Reversal -> Instant Fallback to Standalone Mode', () async {
      // 1. Initial attempt fails with network timeout
      mockTerminal.shouldTimeout = true;

      final failedResult = await orchestrator.executePayment(
        terminal: mockTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-E2E-FAIL-01',
          invoiceId: 'INV-E2E-200',
          amount: 800.0,
          currency: 'NIO',
        ),
        timeout: const Duration(milliseconds: 50),
        enableAutoReversal: true,
      );

      expect(failedResult.isSuccess, isFalse);
      expect(failedResult.errorCode, 'AUTO_REVERSED');
      expect(mockTerminal.reversedTransactions, contains('TRX-E2E-FAIL-01'));

      // 2. Cashier taps "Fallback a Modo Manual" without delaying checkout line
      final manualResult = await orchestrator.executePayment(
        terminal: manualTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-E2E-MANUAL-01',
          invoiceId: 'INV-E2E-200',
          amount: 800.0,
          currency: 'NIO',
        ),
      );

      expect(manualResult.isSuccess, isTrue);
      expect(manualResult.authCode, 'PENDIENTE');
      expect(manualResult.reconciliationStatus, 'PENDIENTE');
      expect(manualResult.acquirer, AcquirerBank.banpro);
    });

    test('E2E Flow 3: End of Shift Batch Settlement links card batch with active session', () async {
      // Process 3 sales throughout the day
      await orchestrator.executePayment(
        terminal: mockTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-1',
          invoiceId: 'INV-1',
          amount: 450.0,
          currency: 'NIO',
        ),
      );
      await orchestrator.executePayment(
        terminal: mockTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-2',
          invoiceId: 'INV-2',
          amount: 350.0,
          currency: 'NIO',
        ),
      );
      await orchestrator.executePayment(
        terminal: mockTerminal,
        intent: const CardPaymentIntent(
          transactionId: 'TRX-3',
          invoiceId: 'INV-3',
          amount: 20.0,
          currency: 'USD',
        ),
      );

      // Execute End of Shift Settlement
      final settlementResult = await orchestrator.executeSettlement(
        terminal: mockTerminal,
        batchNumber: 'LOTE-DIARIO-01',
      );

      expect(settlementResult.isSuccess, isTrue);
      expect(settlementResult.transactionCount, 3);
      expect(settlementResult.totalAmountNio, 800.0);
      expect(settlementResult.totalAmountUsd, 20.0);

      // Construct BatchSettlement entity linked to shift session
      final batchDoc = BatchSettlement(
        id: 'settle-e2e-01',
        batchNumber: settlementResult.batchNumber!,
        terminalId: mockTerminal.terminalId,
        bankPos: settlementResult.acquirer.displayName,
        totalTransactions: settlementResult.transactionCount,
        totalAmountNio: settlementResult.totalAmountNio,
        totalAmountUsd: settlementResult.totalAmountUsd,
        status: 'SETTLED',
        openedAt: DateTime.now().subtract(const Duration(hours: 8)),
        settledAt: settlementResult.settledAt,
        sessionId: 'shift-caja-principal-01',
        settledByUserId: 'supervisor-01',
      );

      expect(batchDoc.isSettled, isTrue);
      expect(batchDoc.totalTransactions, 3);
      expect(batchDoc.totalAmountNio, 800.0);
      expect(batchDoc.totalAmountUsd, 20.0);
      expect(batchDoc.sessionId, 'shift-caja-principal-01');
    });
  });
}
