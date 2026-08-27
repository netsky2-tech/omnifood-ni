import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/mock_simulator_terminal_adapter.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';
import 'package:pos_app/domain/services/sales/card_payment_orchestrator.dart';

void main() {
  group('CardPaymentOrchestrator Unit & Triangulation Tests', () {
    late CardPaymentOrchestrator orchestrator;
    late MockSimulatorTerminalAdapter terminal;

    setUp(() {
      orchestrator = CardPaymentOrchestrator();
      terminal = MockSimulatorTerminalAdapter(
        terminalId: 'DATAFONO-BAC-TEST',
        acquirer: AcquirerBank.bac,
      );
    });

    tearDown(() {
      orchestrator.dispose();
    });

    test('Happy Path: processes sale and emits full lifecycle stream', () async {
      terminal.customAuthCode = 'AUTH-9911';
      terminal.customBatchNumber = 'B-500';
      terminal.customLast4 = '1122';
      terminal.customCardBrand = CardBrand.visa;

      final states = <CardTransactionStage>[];
      orchestrator.stateStream.listen((s) => states.add(s.stage));

      const intent = CardPaymentIntent(
        transactionId: 'TRX-HAPPY-01',
        invoiceId: 'INV-1000',
        amount: 750.0,
        currency: 'NIO',
      );

      final result = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent,
      );

      expect(result.isSuccess, isTrue);
      expect(result.authCode, 'AUTH-9911');
      expect(result.reconciliationStatus, 'CONCILIADO');
      expect(result.last4, '1122');
      expect(result.acquirer, AcquirerBank.bac);

      // Verify stream stages
      expect(states, [
        CardTransactionStage.initiating,
        CardTransactionStage.waitingCard,
        CardTransactionStage.authorized,
      ]);

      // Verify mapping to domain Payment
      final payment = orchestrator.mapToPayment(
        paymentId: 'pay-uuid-01',
        invoiceId: 'INV-1000',
        amount: 750.0,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 750.0,
        auth: result,
      );

      expect(payment.id, 'pay-uuid-01');
      expect(payment.method, PaymentMethod.card);
      expect(payment.amount, 750.0);
      expect(payment.voucherCode, 'AUTH-9911');
      expect(payment.cardBrand, 'VISA');
      expect(payment.bankPos, 'BAC Credomatic');
      expect(payment.last4, '1122');
      expect(payment.reconciliationStatus, 'CONCILIADO');
    });

    test('Concurrency Guard: blocks second payment when first is actively processing', () async {
      // Simulate slow terminal operation
      final completer = Completer<CardAuthorizationResult>();
      
      terminal.simulatedStatus = TerminalStatus.ready;

      const intent1 = CardPaymentIntent(
        transactionId: 'TRX-CONC-01',
        invoiceId: 'INV-1001',
        amount: 200.0,
      );

      const intent2 = CardPaymentIntent(
        transactionId: 'TRX-CONC-02',
        invoiceId: 'INV-1002',
        amount: 400.0,
      );

      // Launch first payment without awaiting immediately
      final future1 = orchestrator.executePayment(
        terminal: terminal,
        intent: intent1,
      );

      // While future1 is running, attempt second payment
      final result2 = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent2,
      );

      expect(result2.isSuccess, isFalse);
      expect(result2.errorCode, 'CONCURRENT_TRANSACTION_BLOCKED');
      expect(result2.errorMessage, contains('ya se encuentra en proceso'));

      // Complete future1
      final result1 = await future1;
      expect(result1.isSuccess, isTrue);
    });

    test('Idempotency Guard: blocks rapid duplicate taps with same transaction ID', () async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-RAPID-01',
        invoiceId: 'INV-2000',
        amount: 500.0,
      );

      final result1 = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent,
      );
      expect(result1.isSuccess, isTrue);

      // Immediate second tap with identical transaction ID within cooldown
      final result2 = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent,
      );

      expect(result2.isSuccess, isFalse);
      expect(result2.errorCode, 'DUPLICATE_INVOCATION_BLOCKED');
      expect(result2.errorMessage, contains('Petición duplicada detectada'));
    });

    test('Timeout & Auto-Reversal: triggers automatic reversal when terminal times out', () async {
      terminal.shouldTimeout = true;

      final states = <CardTransactionStage>[];
      orchestrator.stateStream.listen((s) => states.add(s.stage));

      const intent = CardPaymentIntent(
        transactionId: 'TRX-TIMEOUT-01',
        invoiceId: 'INV-3000',
        amount: 920.0,
        currency: 'NIO',
      );

      final result = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent,
        timeout: const Duration(milliseconds: 100), // Short timeout for test
        enableAutoReversal: true,
      );

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'AUTO_REVERSED');
      expect(result.errorMessage, contains('reversada automáticamente'));

      // Verify terminal recorded reversal
      expect(terminal.reversedTransactions, contains('TRX-TIMEOUT-01'));

      // Verify state sequence
      expect(states, [
        CardTransactionStage.initiating,
        CardTransactionStage.waitingCard,
        CardTransactionStage.timedOut,
        CardTransactionStage.reversing,
        CardTransactionStage.reversed,
      ]);
    });

    test('Decline Handling: emits declined stage with specific error code', () async {
      terminal.shouldFailSale = true;
      terminal.failureErrorCode = 'INSUFFICIENT_FUNDS';
      terminal.failureErrorMessage = 'Fondos Insuficientes en la Cuenta';

      const intent = CardPaymentIntent(
        transactionId: 'TRX-DECLINE-01',
        invoiceId: 'INV-4000',
        amount: 3000.0,
      );

      final result = await orchestrator.executePayment(
        terminal: terminal,
        intent: intent,
      );

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'INSUFFICIENT_FUNDS');
      expect(result.errorMessage, 'Fondos Insuficientes en la Cuenta');
      expect(orchestrator.currentState.stage, CardTransactionStage.declined);
    });

    test('Explicit Reversal Execution: executes and updates state', () async {
      final reversal = await orchestrator.executeReversal(
        terminal: terminal,
        transactionId: 'TRX-MANUAL-REV-01',
        originalAuthCode: 'AUTH-1234',
        amount: 500.0,
      );

      expect(reversal.isSuccess, isTrue);
      expect(reversal.reversalCode, contains('TRX-MANUAL-REV-01'));
      expect(orchestrator.currentState.stage, CardTransactionStage.reversed);
      expect(terminal.reversedTransactions, contains('TRX-MANUAL-REV-01'));
    });

    test('Batch Settlement Execution: processes batch summary', () async {
      // Seed two simulated sales
      await orchestrator.executePayment(
        terminal: terminal,
        intent: const CardPaymentIntent(
          transactionId: 'T-SETTLE-1',
          invoiceId: 'INV-1',
          amount: 600.0,
          currency: 'NIO',
        ),
      );
      await orchestrator.executePayment(
        terminal: terminal,
        intent: const CardPaymentIntent(
          transactionId: 'T-SETTLE-2',
          invoiceId: 'INV-2',
          amount: 40.0,
          currency: 'USD',
        ),
      );

      final settlement = await orchestrator.executeSettlement(
        terminal: terminal,
        batchNumber: 'LOTE-TEST-001',
      );

      expect(settlement.isSuccess, isTrue);
      expect(settlement.batchNumber, 'LOTE-TEST-001');
      expect(settlement.transactionCount, 2);
      expect(settlement.totalAmountNio, 600.0);
      expect(settlement.totalAmountUsd, 40.0);
      expect(settlement.acquirer, AcquirerBank.bac);
      expect(orchestrator.currentState.stage, CardTransactionStage.idle);
    });
  });
}
