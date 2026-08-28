import 'dart:async';
import '../../ports/card_terminal_port.dart';
import '../../models/sales/payment.dart';

/// Transaction lifecycle stage
enum CardTransactionStage {
  idle,
  initiating,
  waitingCard,
  authorized,
  declined,
  timedOut,
  reversing,
  reversed,
  reversalFailed,
  error,
}

/// Immutable state container emitted during transaction lifecycle
class CardTransactionState {
  final CardTransactionStage stage;
  final CardPaymentIntent? intent;
  final CardAuthorizationResult? authResult;
  final CardReversalResult? reversalResult;
  final SettlementResult? settlementResult;
  final String? message;
  final DateTime timestamp;

  const CardTransactionState({
    required this.stage,
    this.intent,
    this.authResult,
    this.reversalResult,
    this.settlementResult,
    this.message,
    required this.timestamp,
  });

  factory CardTransactionState.initial() => CardTransactionState(
        stage: CardTransactionStage.idle,
        timestamp: DateTime.now(),
      );

  CardTransactionState copyWith({
    CardTransactionStage? stage,
    CardPaymentIntent? intent,
    CardAuthorizationResult? authResult,
    CardReversalResult? reversalResult,
    SettlementResult? settlementResult,
    String? message,
  }) {
    return CardTransactionState(
      stage: stage ?? this.stage,
      intent: intent ?? this.intent,
      authResult: authResult ?? this.authResult,
      reversalResult: reversalResult ?? this.reversalResult,
      settlementResult: settlementResult ?? this.settlementResult,
      message: message ?? this.message,
      timestamp: DateTime.now(),
    );
  }
}

/// Orchestrator service managing async card transactions, idempotency, timeouts and auto-reversals
class CardPaymentOrchestrator {
  final StreamController<CardTransactionState> _stateController =
      StreamController<CardTransactionState>.broadcast(sync: true);

  CardTransactionState _currentState = CardTransactionState.initial();

  Stream<CardTransactionState> get stateStream => _stateController.stream;
  CardTransactionState get currentState => _currentState;

  bool get isProcessing =>
      _currentState.stage == CardTransactionStage.initiating ||
      _currentState.stage == CardTransactionStage.waitingCard ||
      _currentState.stage == CardTransactionStage.reversing;

  DateTime? _lastExecutionTime;
  String? _lastTransactionId;
  static const Duration idempotencyCooldown = Duration(milliseconds: 3000);

  void _emit(CardTransactionState newState) {
    _currentState = newState;
    if (!_stateController.isClosed) {
      _stateController.add(newState);
    }
  }

  /// Executes an asynchronous card payment on the specified [terminal].
  ///
  /// Enforces idempotency, monitors timeout, and automatically dispatches
  /// a reversal order ([enableAutoReversal]) if timeout/communication fails after transmission.
  Future<CardAuthorizationResult> executePayment({
    required CardTerminalPort terminal,
    required CardPaymentIntent intent,
    Duration timeout = const Duration(seconds: 45),
    bool enableAutoReversal = true,
  }) async {
    // 1. Concurrency Guard
    if (isProcessing) {
      final errorResult = CardAuthorizationResult.failure(
        errorMessage: 'Una transacción de tarjeta ya se encuentra en proceso.',
        errorCode: 'CONCURRENT_TRANSACTION_BLOCKED',
        acquirer: terminal.acquirer,
      );
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.error,
        authResult: errorResult,
        message: errorResult.errorMessage,
      ));
      return errorResult;
    }

    // 2. Idempotency Guard (Rapid duplicate tap prevention on active/successful transactions)
    final now = DateTime.now();
    final isTerminalFailedStage = _currentState.stage == CardTransactionStage.declined ||
        _currentState.stage == CardTransactionStage.error ||
        _currentState.stage == CardTransactionStage.reversed ||
        _currentState.stage == CardTransactionStage.reversalFailed ||
        _currentState.stage == CardTransactionStage.timedOut;

    if (!isTerminalFailedStage &&
        _lastTransactionId == intent.transactionId &&
        _lastExecutionTime != null &&
        now.difference(_lastExecutionTime!) < idempotencyCooldown) {
      final errorResult = CardAuthorizationResult.failure(
        errorMessage: 'Petición duplicada detectada. Por favor espere unos segundos.',
        errorCode: 'DUPLICATE_INVOCATION_BLOCKED',
        acquirer: terminal.acquirer,
      );
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.error,
        authResult: errorResult,
        message: errorResult.errorMessage,
      ));
      return errorResult;
    }

    _lastExecutionTime = now;
    _lastTransactionId = intent.transactionId;

    // 3. Initiate Transaction
    _emit(_currentState.copyWith(
      stage: CardTransactionStage.initiating,
      intent: intent,
      message: 'Iniciando comunicación con el datáfono...',
    ));

    try {
      // Transition to waiting for card interaction
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.waitingCard,
        message: 'Por favor inserte, deslice o aproxime la tarjeta en la terminal.',
      ));

      final result = await terminal.processSale(intent).timeout(
        timeout,
        onTimeout: () {
          throw TimeoutException('Tiempo de espera agotado en la terminal ($timeout)');
        },
      );

      if (result.isSuccess) {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.authorized,
          authResult: result,
          message: 'Transacción Aprobada (${result.authCode})',
        ));
        return result;
      } else if (result.errorCode == 'TIMEOUT') {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.timedOut,
          authResult: result,
          message: result.errorMessage ?? 'Tiempo de espera agotado',
        ));

        if (enableAutoReversal) {
          return await _triggerAutoReversal(
            terminal: terminal,
            intent: intent,
            reason: 'TIMEOUT_AUTO_REVERSAL',
          );
        }

        return result;
      } else {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.declined,
          authResult: result,
          message: result.errorMessage ?? 'Transacción Declinada',
        ));
        return result;
      }
    } on TimeoutException catch (e) {
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.timedOut,
        message: e.message ?? 'Tiempo de espera agotado',
      ));

      if (enableAutoReversal) {
        return await _triggerAutoReversal(
          terminal: terminal,
          intent: intent,
          reason: 'TIMEOUT_AUTO_REVERSAL',
        );
      }

      return CardAuthorizationResult.failure(
        errorMessage: 'Tiempo de espera de comunicación agotado en la terminal.',
        errorCode: 'TIMEOUT',
        acquirer: terminal.acquirer,
      );
    } catch (e) {
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.error,
        message: 'Error de comunicación: $e',
      ));

      if (enableAutoReversal) {
        return await _triggerAutoReversal(
          terminal: terminal,
          intent: intent,
          reason: 'COMM_ERROR_AUTO_REVERSAL',
        );
      }

      return CardAuthorizationResult.failure(
        errorMessage: 'Error inesperado durante la transacción: $e',
        errorCode: 'TRANSACTION_EXCEPTION',
        acquirer: terminal.acquirer,
      );
    }
  }

  /// Internal helper to dispatch an immediate automatic reversal
  Future<CardAuthorizationResult> _triggerAutoReversal({
    required CardTerminalPort terminal,
    required CardPaymentIntent intent,
    required String reason,
  }) async {
    _emit(_currentState.copyWith(
      stage: CardTransactionStage.reversing,
      message: 'Despachando reverso automático de seguridad a la terminal...',
    ));

    try {
      final reversal = await terminal.processReversal(
        intent.transactionId,
        amount: intent.amount,
        currency: intent.currency,
      );

      if (reversal.isSuccess) {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.reversed,
          reversalResult: reversal,
          message: 'Transacción cancelada y reversada exitosamente por seguridad.',
        ));

        return CardAuthorizationResult.failure(
          errorMessage: 'Transacción cancelada y reversada automáticamente por timeout/error.',
          errorCode: 'AUTO_REVERSED',
          acquirer: terminal.acquirer,
        );
      } else {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.reversalFailed,
          reversalResult: reversal,
          message: 'Fallo al ejecutar reverso automático: ${reversal.message}',
        ));

        return CardAuthorizationResult.failure(
          errorMessage: 'Transacción fallida. Advertencia: No se pudo confirmar el reverso automático en el hardware.',
          errorCode: 'REVERSAL_FAILED',
          acquirer: terminal.acquirer,
        );
      }
    } catch (err) {
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.reversalFailed,
        message: 'Excepción durante reverso automático: $err',
      ));

      return CardAuthorizationResult.failure(
        errorMessage: 'Fallo crítico al ejecutar reverso automático: $err',
        errorCode: 'REVERSAL_CRITICAL_ERROR',
        acquirer: terminal.acquirer,
      );
    }
  }

  /// Dispatches an explicit reversal for a given transaction
  Future<CardReversalResult> executeReversal({
    required CardTerminalPort terminal,
    required String transactionId,
    String? originalAuthCode,
    double? amount,
    String currency = 'NIO',
  }) async {
    _emit(_currentState.copyWith(
      stage: CardTransactionStage.reversing,
      message: 'Procesando reverso de transacción $transactionId...',
    ));

    try {
      final res = await terminal.processReversal(
        transactionId,
        originalAuthCode: originalAuthCode,
        amount: amount,
        currency: currency,
      );

      if (res.isSuccess) {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.reversed,
          reversalResult: res,
          message: 'Reverso completado exitosamente.',
        ));
      } else {
        _emit(_currentState.copyWith(
          stage: CardTransactionStage.reversalFailed,
          reversalResult: res,
          message: res.message,
        ));
      }
      return res;
    } catch (e) {
      final fail = CardReversalResult.failure('Excepción en reverso: $e');
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.reversalFailed,
        reversalResult: fail,
        message: fail.message,
      ));
      return fail;
    }
  }

  /// Dispatches a batch settlement (Cierre de Lote)
  Future<SettlementResult> executeSettlement({
    required CardTerminalPort terminal,
    String? batchNumber,
  }) async {
    _emit(_currentState.copyWith(
      stage: CardTransactionStage.initiating,
      message: 'Procesando Cierre de Lote en terminal ${terminal.terminalId}...',
    ));

    try {
      final result = await terminal.processSettlement(batchNumber: batchNumber);
      _emit(_currentState.copyWith(
        stage: result.isSuccess ? CardTransactionStage.idle : CardTransactionStage.error,
        settlementResult: result,
        message: result.settlementText ?? result.errorMessage,
      ));
      return result;
    } catch (e) {
      final errResult = SettlementResult.failure('Error en cierre de lote: $e', acquirer: terminal.acquirer);
      _emit(_currentState.copyWith(
        stage: CardTransactionStage.error,
        settlementResult: errResult,
        message: errResult.errorMessage,
      ));
      return errResult;
    }
  }

  /// Converts a successful [CardAuthorizationResult] into domain [Payment] model
  Payment mapToPayment({
    required String paymentId,
    required String invoiceId,
    required double amount,
    required String currency,
    required double exchangeRate,
    required double amountNio,
    required CardAuthorizationResult auth,
  }) {
    return Payment(
      id: paymentId,
      invoiceId: invoiceId,
      method: PaymentMethod.card,
      amount: amount,
      currency: currency,
      exchangeRate: exchangeRate,
      amountNio: amountNio,
      voucherCode: auth.authCode,
      cardBrand: auth.cardBrand?.name.toUpperCase(),
      cardType: auth.cardType?.name.toUpperCase(),
      bankPos: auth.acquirer.displayName,
      reconciliationStatus: auth.reconciliationStatus,
      last4: auth.last4,
      batchNumber: auth.batchNumber,
      reconciledAt: auth.reconciliationStatus == 'CONCILIADO' ? auth.authorizedAt : null,
      createdAt: DateTime.now(),
    );
  }

  /// Resets the orchestrator state to idle
  void reset() {
    _emit(CardTransactionState.initial());
  }

  /// Disposes stream controller
  void dispose() {
    _stateController.close();
  }
}
