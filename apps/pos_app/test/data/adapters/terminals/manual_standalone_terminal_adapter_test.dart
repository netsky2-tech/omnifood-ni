import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/manual_standalone_terminal_adapter.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';

void main() {
  group('ManualStandaloneTerminalAdapter Tests (PRD Modo Dos Capas)', () {
    late ManualStandaloneTerminalAdapter adapter;

    setUp(() {
      adapter = ManualStandaloneTerminalAdapter(
        terminalId: 'DATAFONO-BAC-01',
        acquirer: AcquirerBank.bac,
      );
    });

    test('checkStatus returns ready', () async {
      final status = await adapter.checkStatus();
      expect(status, TerminalStatus.ready);
      expect(adapter.connectionMode, TerminalConnectionMode.manualStandalone);
      expect(adapter.acquirer, AcquirerBank.bac);
    });

    test('processSale in Fast-Checkout mode yields PENDIENTE voucher record', () async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-001',
        invoiceId: 'INV-100',
        amount: 350.0,
        currency: 'NIO',
        cashierName: 'Juan Perez',
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isTrue);
      expect(result.authCode, 'PENDIENTE');
      expect(result.reconciliationStatus, 'PENDIENTE');
      expect(result.terminalId, 'DATAFONO-BAC-01');
      expect(result.acquirer, AcquirerBank.bac);
      expect(result.last4, '0000');
    });

    test('processSale with manualAuthCode yields CONCILIADO record', () async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-002',
        invoiceId: 'INV-101',
        amount: 1200.0,
        currency: 'NIO',
        manualAuthCode: '887766',
        manualBatchNumber: '005',
        manualLast4: '1234',
        manualCardBrand: CardBrand.mastercard,
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isTrue);
      expect(result.authCode, '887766');
      expect(result.batchNumber, '005');
      expect(result.last4, '1234');
      expect(result.cardBrand, CardBrand.mastercard);
      expect(result.reconciliationStatus, 'CONCILIADO');
    });

    test('processReversal generates manual reversal receipt', () async {
      final reversal = await adapter.processReversal('TRX-001', amount: 350.0);
      expect(reversal.isSuccess, isTrue);
      expect(reversal.reversalCode, contains('REV-MANUAL'));
    });

    test('processSettlement returns valid manual batch summary', () async {
      final settlement = await adapter.processSettlement(batchNumber: 'BATCH-001');
      expect(settlement.isSuccess, isTrue);
      expect(settlement.batchNumber, 'BATCH-001');
      expect(settlement.acquirer, AcquirerBank.bac);
    });
  });
}
