import '../../../domain/ports/card_terminal_port.dart';

/// Implementation of [CardTerminalPort] for detached/decoupled card processing (PRD Modo Dos Capas).
///
/// In this mode, the physical terminal is operated independently by the cashier.
/// Fast-checkout requests yield 'PENDIENTE' voucher records for deferred reconciliation before Corte Z.
class ManualStandaloneTerminalAdapter implements CardTerminalPort {
  @override
  final String terminalId;

  @override
  final AcquirerBank acquirer;

  @override
  TerminalConnectionMode get connectionMode => TerminalConnectionMode.manualStandalone;

  ManualStandaloneTerminalAdapter({
    this.terminalId = 'DATAFONO-MANUAL-01',
    this.acquirer = AcquirerBank.generic,
  });

  @override
  Future<TerminalStatus> checkStatus() async {
    // Manual standalone terminal is always treated as ready from POS software perspective
    return TerminalStatus.ready;
  }

  @override
  Future<CardAuthorizationResult> processSale(CardPaymentIntent intent) async {
    // If cashier provided a manual auth code upfront (Strict mode or quick entry)
    if (intent.manualAuthCode != null && intent.manualAuthCode!.trim().isNotEmpty) {
      final code = intent.manualAuthCode!.trim();
      return CardAuthorizationResult.success(
        authCode: code,
        batchNumber: intent.manualBatchNumber?.trim() ?? '001',
        cardBrand: intent.manualCardBrand ?? CardBrand.visa,
        cardType: CardType.credit,
        last4: intent.manualLast4?.trim() ?? '0000',
        terminalId: terminalId,
        acquirer: acquirer,
        voucherText: 'COMPROBANTE MANUAL - AUT: $code - BANCO: ${acquirer.displayName}',
        reconciliationStatus: code.toUpperCase() == 'PENDIENTE' ? 'PENDIENTE' : 'CONCILIADO',
        authorizedAt: DateTime.now(),
      );
    }

    // Default fast-checkout: Voucher status PENDIENTE
    return CardAuthorizationResult.pending(
      authCode: 'PENDIENTE',
      batchNumber: intent.manualBatchNumber ?? '001',
      cardBrand: intent.manualCardBrand ?? CardBrand.visa,
      cardType: CardType.credit,
      last4: intent.manualLast4 ?? '0000',
      terminalId: terminalId,
      acquirer: acquirer,
      voucherText: 'COMPROBANTE DIFERIDO - REGISTRO PENDIENTE',
      authorizedAt: DateTime.now(),
    );
  }

  @override
  Future<CardReversalResult> processReversal(
    String transactionId, {
    String? originalAuthCode,
    double? amount,
    String currency = 'NIO',
  }) async {
    return CardReversalResult.success(
      reversalCode: 'REV-MANUAL-${DateTime.now().millisecondsSinceEpoch}',
      message: 'Reverso manual registrado localmente para transacción $transactionId',
    );
  }

  @override
  Future<SettlementResult> processSettlement({String? batchNumber}) async {
    return SettlementResult.success(
      batchNumber: batchNumber ?? '001',
      transactionCount: 0,
      totalAmountNio: 0.0,
      totalAmountUsd: 0.0,
      acquirer: acquirer,
      terminalId: terminalId,
      settlementText: 'Cierre de lote manual verificado por cajero.',
    );
  }

  @override
  Future<void> cancelCurrentOperation() async {
    // No-op in manual mode
  }
}
