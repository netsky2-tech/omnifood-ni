import '../../../domain/ports/card_terminal_port.dart';

/// In-memory Mock implementation of [CardTerminalPort] for deterministic unit and integration testing.
class MockSimulatorTerminalAdapter implements CardTerminalPort {
  @override
  final String terminalId;

  @override
  final AcquirerBank acquirer;

  @override
  TerminalConnectionMode get connectionMode => TerminalConnectionMode.mockSimulator;

  TerminalStatus simulatedStatus = TerminalStatus.ready;
  bool shouldFailSale = false;
  bool shouldFailReversal = false;
  bool shouldFailSettlement = false;
  bool shouldTimeout = false;

  String failureErrorMessage = 'Error simulado de comunicación con el datáfono';
  String? failureErrorCode;

  String customAuthCode = 'AUTH123456';
  String customBatchNumber = 'BATCH099';
  String customLast4 = '4321';
  CardBrand customCardBrand = CardBrand.visa;
  CardType customCardType = CardType.credit;

  final List<CardPaymentIntent> processedSales = [];
  final List<String> reversedTransactions = [];
  final List<String> settlementHistory = [];
  bool operationCancelled = false;

  MockSimulatorTerminalAdapter({
    this.terminalId = 'DATAFONO-MOCK-01',
    this.acquirer = AcquirerBank.bac,
  });

  void reset() {
    simulatedStatus = TerminalStatus.ready;
    shouldFailSale = false;
    shouldFailReversal = false;
    shouldFailSettlement = false;
    shouldTimeout = false;
    failureErrorMessage = 'Error simulado de comunicación con el datáfono';
    failureErrorCode = null;
    customAuthCode = 'AUTH123456';
    customBatchNumber = 'BATCH099';
    customLast4 = '4321';
    customCardBrand = CardBrand.visa;
    customCardType = CardType.credit;
    processedSales.clear();
    reversedTransactions.clear();
    settlementHistory.clear();
    operationCancelled = false;
  }

  @override
  Future<TerminalStatus> checkStatus() async {
    return simulatedStatus;
  }

  @override
  Future<CardAuthorizationResult> processSale(CardPaymentIntent intent) async {
    processedSales.add(intent);

    if (simulatedStatus != TerminalStatus.ready) {
      return CardAuthorizationResult.failure(
        errorMessage: 'Datáfono fuera de línea o con error: $simulatedStatus',
        errorCode: 'TERMINAL_NOT_READY',
        acquirer: acquirer,
      );
    }

    if (shouldTimeout) {
      return CardAuthorizationResult.failure(
        errorMessage: 'Tiempo de espera de comunicación agotado (Timeout 45s)',
        errorCode: 'TIMEOUT',
        acquirer: acquirer,
      );
    }

    if (shouldFailSale) {
      return CardAuthorizationResult.failure(
        errorMessage: failureErrorMessage,
        errorCode: failureErrorCode ?? 'TRANSACTION_DECLINED',
        acquirer: acquirer,
      );
    }

    return CardAuthorizationResult.success(
      authCode: customAuthCode,
      batchNumber: customBatchNumber,
      cardBrand: customCardBrand,
      cardType: customCardType,
      last4: customLast4,
      terminalId: terminalId,
      acquirer: acquirer,
      voucherText: 'TRANSACCION APROBADA - AUT: $customAuthCode - LOTE: $customBatchNumber - BANCO: ${acquirer.displayName}',
      reconciliationStatus: 'CONCILIADO',
      rawResponse: {
        'terminal_id': terminalId,
        'auth_code': customAuthCode,
        'batch': customBatchNumber,
        'pan_mask': '************$customLast4',
        'amount': intent.amount,
        'currency': intent.currency,
      },
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
    reversedTransactions.add(transactionId);

    if (shouldFailReversal) {
      return CardReversalResult.failure('Fallo al procesar reverso simulado');
    }

    return CardReversalResult.success(
      reversalCode: 'REV-MOCK-$transactionId',
      message: 'Reverso aprobado para transacción $transactionId',
      rawResponse: {
        'transaction_id': transactionId,
        'reversal_status': 'APPROVED',
      },
    );
  }

  @override
  Future<SettlementResult> processSettlement({String? batchNumber}) async {
    final batch = batchNumber ?? customBatchNumber;
    settlementHistory.add(batch);

    if (shouldFailSettlement) {
      return SettlementResult.failure('Fallo al cerrar lote bancario simulado', acquirer: acquirer);
    }

    return SettlementResult.success(
      batchNumber: batch,
      transactionCount: processedSales.length,
      totalAmountNio: processedSales
          .where((s) => s.currency == 'NIO')
          .fold<double>(0.0, (sum, s) => sum + s.amount),
      totalAmountUsd: processedSales
          .where((s) => s.currency == 'USD')
          .fold<double>(0.0, (sum, s) => sum + s.amount),
      acquirer: acquirer,
      terminalId: terminalId,
      settlementText: 'CIERRE DE LOTE EXITOSO - TOTAL TRX: ${processedSales.length}',
    );
  }

  @override
  Future<void> cancelCurrentOperation() async {
    operationCancelled = true;
  }
}
