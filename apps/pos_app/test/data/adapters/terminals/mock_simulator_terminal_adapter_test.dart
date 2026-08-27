import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/mock_simulator_terminal_adapter.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';

void main() {
  group('MockSimulatorTerminalAdapter Tests', () {
    late MockSimulatorTerminalAdapter adapter;

    setUp(() {
      adapter = MockSimulatorTerminalAdapter(
        terminalId: 'DATAFONO-BANPRO-SIM',
        acquirer: AcquirerBank.banpro,
      );
    });

    test('successful simulated sale with authorization and card metadata', () async {
      adapter.customAuthCode = '778899';
      adapter.customBatchNumber = 'B-101';
      adapter.customLast4 = '5566';
      adapter.customCardBrand = CardBrand.visa;

      const intent = CardPaymentIntent(
        transactionId: 'TRX-SIM-01',
        invoiceId: 'INV-200',
        amount: 850.0,
        currency: 'NIO',
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isTrue);
      expect(result.authCode, '778899');
      expect(result.batchNumber, 'B-101');
      expect(result.last4, '5566');
      expect(result.cardBrand, CardBrand.visa);
      expect(result.reconciliationStatus, 'CONCILIADO');
      expect(result.acquirer, AcquirerBank.banpro);
      expect(adapter.processedSales.length, 1);
      expect(result.rawResponse?['pan_mask'], '************5566');
    });

    test('handles terminal offline status gracefully', () async {
      adapter.simulatedStatus = TerminalStatus.offline;

      const intent = CardPaymentIntent(
        transactionId: 'TRX-SIM-02',
        invoiceId: 'INV-201',
        amount: 500.0,
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'TERMINAL_NOT_READY');
      expect(result.reconciliationStatus, 'RECHAZADO');
    });

    test('handles communication timeout simulation', () async {
      adapter.shouldTimeout = true;

      const intent = CardPaymentIntent(
        transactionId: 'TRX-SIM-03',
        invoiceId: 'INV-202',
        amount: 150.0,
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'TIMEOUT');
      expect(result.errorMessage, contains('Timeout'));
    });

    test('simulated decline with custom error code', () async {
      adapter.shouldFailSale = true;
      adapter.failureErrorCode = 'CARD_EXPIRED';
      adapter.failureErrorMessage = 'Tarjeta Vencida';

      const intent = CardPaymentIntent(
        transactionId: 'TRX-SIM-04',
        invoiceId: 'INV-203',
        amount: 200.0,
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'CARD_EXPIRED');
      expect(result.errorMessage, 'Tarjeta Vencida');
    });

    test('processes reversal and tracks history', () async {
      final reversal = await adapter.processReversal('TRX-SIM-01', amount: 850.0);

      expect(reversal.isSuccess, isTrue);
      expect(reversal.reversalCode, contains('REV-MOCK-TRX-SIM-01'));
      expect(adapter.reversedTransactions, contains('TRX-SIM-01'));
    });

    test('processes batch settlement calculating multi-currency sums', () async {
      // Process 2 NIO sales and 1 USD sale
      await adapter.processSale(const CardPaymentIntent(
        transactionId: 'T1',
        invoiceId: 'I1',
        amount: 500.0,
        currency: 'NIO',
      ));
      await adapter.processSale(const CardPaymentIntent(
        transactionId: 'T2',
        invoiceId: 'I2',
        amount: 300.0,
        currency: 'NIO',
      ));
      await adapter.processSale(const CardPaymentIntent(
        transactionId: 'T3',
        invoiceId: 'I3',
        amount: 25.0,
        currency: 'USD',
      ));

      final settlement = await adapter.processSettlement(batchNumber: 'LOTE-555');

      expect(settlement.isSuccess, isTrue);
      expect(settlement.batchNumber, 'LOTE-555');
      expect(settlement.transactionCount, 3);
      expect(settlement.totalAmountNio, 800.0);
      expect(settlement.totalAmountUsd, 25.0);
      expect(settlement.acquirer, AcquirerBank.banpro);
    });

    test('cancelCurrentOperation sets operationCancelled flag', () async {
      expect(adapter.operationCancelled, isFalse);
      await adapter.cancelCurrentOperation();
      expect(adapter.operationCancelled, isTrue);
    });
  });
}
