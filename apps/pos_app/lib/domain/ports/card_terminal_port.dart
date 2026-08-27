import 'dart:async';

/// Bank acquirers operating in Nicaragua
enum AcquirerBank {
  bac,
  banpro,
  lafise,
  bdf,
  ficohsa,
  mipos,
  generic;

  String get displayName {
    switch (this) {
      case AcquirerBank.bac:
        return 'BAC Credomatic';
      case AcquirerBank.banpro:
        return 'BANPRO Grupo Promerica';
      case AcquirerBank.lafise:
        return 'LAFISE Bancentro';
      case AcquirerBank.bdf:
        return 'Banco de Finanzas (BDF)';
      case AcquirerBank.ficohsa:
        return 'Banco Ficohsa';
      case AcquirerBank.mipos:
        return 'MiPOS Red';
      case AcquirerBank.generic:
        return 'Datáfono Genérico';
    }
  }

  static AcquirerBank fromString(String? val) {
    if (val == null) return AcquirerBank.generic;
    final normalized = val.trim().toUpperCase();
    if (normalized.contains('BAC')) return AcquirerBank.bac;
    if (normalized.contains('BANPRO')) return AcquirerBank.banpro;
    if (normalized.contains('LAFISE')) return AcquirerBank.lafise;
    if (normalized.contains('BDF')) return AcquirerBank.bdf;
    if (normalized.contains('FICOHSA')) return AcquirerBank.ficohsa;
    if (normalized.contains('MIPOS')) return AcquirerBank.mipos;
    return AcquirerBank.generic;
  }
}

/// Connection mode between POS and Card Terminal
enum TerminalConnectionMode {
  manualStandalone, // Desacoplado / 2 Capas (Manual)
  localNetworkTcp,  // Datáfono IP / Socket TCP en red local
  smartPosAidl,     // Dispositivo All-In-One Android con lector integrado
  mockSimulator;    // Entorno de prueba / TDD

  static TerminalConnectionMode fromString(String? val) {
    if (val == null) return TerminalConnectionMode.manualStandalone;
    final normalized = val.trim().toUpperCase();
    if (normalized == 'LOCAL_NETWORK_TCP' || normalized == 'LOCAL_NETWORK' || normalized == 'IP') {
      return TerminalConnectionMode.localNetworkTcp;
    }
    if (normalized == 'SMART_POS_AIDL' || normalized == 'AIDL' || normalized == 'ANDROID') {
      return TerminalConnectionMode.smartPosAidl;
    }
    if (normalized == 'MOCK_SIMULATOR' || normalized == 'MOCK' || normalized == 'SIMULATOR') {
      return TerminalConnectionMode.mockSimulator;
    }
    return TerminalConnectionMode.manualStandalone;
  }
}

/// Operational status of the card terminal hardware
enum TerminalStatus {
  ready,
  busy,
  offline,
  paperOut,
  error,
}

/// Card brand
enum CardBrand {
  visa,
  mastercard,
  amex,
  diners,
  discover,
  other;

  static CardBrand fromString(String? val) {
    if (val == null) return CardBrand.other;
    final normalized = val.trim().toUpperCase();
    if (normalized.contains('VISA')) return CardBrand.visa;
    if (normalized.contains('MASTER') || normalized.contains('MC')) return CardBrand.mastercard;
    if (normalized.contains('AMEX') || normalized.contains('AMERICAN')) return CardBrand.amex;
    if (normalized.contains('DINERS')) return CardBrand.diners;
    if (normalized.contains('DISCOVER')) return CardBrand.discover;
    return CardBrand.other;
  }
}

/// Card funding type
enum CardType {
  credit,
  debit;

  static CardType fromString(String? val) {
    if (val == null) return CardType.credit;
    final normalized = val.trim().toUpperCase();
    if (normalized.contains('DEB')) return CardType.debit;
    return CardType.credit;
  }
}

/// Intent payload describing a payment request to be executed on a terminal
class CardPaymentIntent {
  final String transactionId;
  final String invoiceId;
  final double amount;
  final String currency; // 'NIO' or 'USD'
  final String? cashierName;
  final String? customReference;
  final String? manualAuthCode; // For manual override entry
  final String? manualBatchNumber;
  final String? manualLast4;
  final CardBrand? manualCardBrand;

  const CardPaymentIntent({
    required this.transactionId,
    required this.invoiceId,
    required this.amount,
    this.currency = 'NIO',
    this.cashierName,
    this.customReference,
    this.manualAuthCode,
    this.manualBatchNumber,
    this.manualLast4,
    this.manualCardBrand,
  });
}

/// Result of an authorization attempt on a card terminal
class CardAuthorizationResult {
  final bool isSuccess;
  final String? authCode;
  final String? batchNumber;
  final CardBrand? cardBrand;
  final CardType? cardType;
  final String? last4;
  final String? terminalId;
  final AcquirerBank acquirer;
  final String? voucherText;
  final String reconciliationStatus; // 'PENDIENTE', 'CONCILIADO', 'MANUAL_OVERRIDE', 'RECHAZADO', 'REVERSADO'
  final String? errorCode;
  final String? errorMessage;
  final Map<String, dynamic>? rawResponse;
  final DateTime authorizedAt;

  CardAuthorizationResult({
    required this.isSuccess,
    this.authCode,
    this.batchNumber,
    this.cardBrand,
    this.cardType,
    this.last4,
    this.terminalId,
    this.acquirer = AcquirerBank.generic,
    this.voucherText,
    required this.reconciliationStatus,
    this.errorCode,
    this.errorMessage,
    this.rawResponse,
    DateTime? authorizedAt,
  }) : authorizedAt = authorizedAt ?? DateTime.now();

  factory CardAuthorizationResult.success({
    required String authCode,
    String? batchNumber,
    CardBrand cardBrand = CardBrand.visa,
    CardType cardType = CardType.credit,
    String? last4,
    String? terminalId,
    AcquirerBank acquirer = AcquirerBank.generic,
    String? voucherText,
    String reconciliationStatus = 'CONCILIADO',
    Map<String, dynamic>? rawResponse,
    DateTime? authorizedAt,
  }) {
    return CardAuthorizationResult(
      isSuccess: true,
      authCode: authCode,
      batchNumber: batchNumber,
      cardBrand: cardBrand,
      cardType: cardType,
      last4: last4,
      terminalId: terminalId,
      acquirer: acquirer,
      voucherText: voucherText,
      reconciliationStatus: reconciliationStatus,
      rawResponse: rawResponse,
      authorizedAt: authorizedAt,
    );
  }

  factory CardAuthorizationResult.pending({
    String authCode = 'PENDIENTE',
    String? batchNumber,
    CardBrand? cardBrand,
    CardType? cardType,
    String? last4,
    String? terminalId,
    AcquirerBank acquirer = AcquirerBank.generic,
    String? voucherText,
    DateTime? authorizedAt,
  }) {
    return CardAuthorizationResult(
      isSuccess: true,
      authCode: authCode,
      batchNumber: batchNumber,
      cardBrand: cardBrand,
      cardType: cardType,
      last4: last4,
      terminalId: terminalId,
      acquirer: acquirer,
      voucherText: voucherText,
      reconciliationStatus: 'PENDIENTE',
      authorizedAt: authorizedAt,
    );
  }

  factory CardAuthorizationResult.failure({
    required String errorMessage,
    String? errorCode,
    AcquirerBank acquirer = AcquirerBank.generic,
    Map<String, dynamic>? rawResponse,
  }) {
    return CardAuthorizationResult(
      isSuccess: false,
      reconciliationStatus: 'RECHAZADO',
      errorCode: errorCode,
      errorMessage: errorMessage,
      acquirer: acquirer,
      rawResponse: rawResponse,
    );
  }
}

/// Result of an auto-reversal or explicit cancellation
class CardReversalResult {
  final bool isSuccess;
  final String? reversalCode;
  final String? message;
  final Map<String, dynamic>? rawResponse;
  final DateTime reversedAt;

  CardReversalResult({
    required this.isSuccess,
    this.reversalCode,
    this.message,
    this.rawResponse,
    DateTime? reversedAt,
  }) : reversedAt = reversedAt ?? DateTime.now();

  factory CardReversalResult.success({
    required String reversalCode,
    String? message,
    Map<String, dynamic>? rawResponse,
    DateTime? reversedAt,
  }) {
    return CardReversalResult(
      isSuccess: true,
      reversalCode: reversalCode,
      message: message ?? 'Reverso de tarjeta procesado exitosamente',
      rawResponse: rawResponse,
      reversedAt: reversedAt,
    );
  }

  factory CardReversalResult.failure(String message, {Map<String, dynamic>? rawResponse}) {
    return CardReversalResult(
      isSuccess: false,
      message: message,
      rawResponse: rawResponse,
    );
  }
}

/// Summary result of a Batch Settlement (Cierre de Lote)
class SettlementResult {
  final bool earthlySuccess = true;
  final bool isSuccess;
  final String? batchNumber;
  final int transactionCount;
  final double totalAmountNio;
  final double totalAmountUsd;
  final AcquirerBank acquirer;
  final String? terminalId;
  final String? settlementText;
  final String? errorMessage;
  final DateTime settledAt;

  SettlementResult({
    required this.isSuccess,
    this.batchNumber,
    this.transactionCount = 0,
    this.totalAmountNio = 0.0,
    this.totalAmountUsd = 0.0,
    this.acquirer = AcquirerBank.generic,
    this.terminalId,
    this.settlementText,
    this.errorMessage,
    DateTime? settledAt,
  }) : settledAt = settledAt ?? DateTime.now();

  factory SettlementResult.success({
    required String batchNumber,
    required int transactionCount,
    required double totalAmountNio,
    double totalAmountUsd = 0.0,
    AcquirerBank acquirer = AcquirerBank.generic,
    String? terminalId,
    String? settlementText,
    DateTime? settledAt,
  }) {
    return SettlementResult(
      isSuccess: true,
      batchNumber: batchNumber,
      transactionCount: transactionCount,
      totalAmountNio: totalAmountNio,
      totalAmountUsd: totalAmountUsd,
      acquirer: acquirer,
      terminalId: terminalId,
      settlementText: settlementText,
      settledAt: settledAt,
    );
  }

  factory SettlementResult.failure(String errorMessage, {AcquirerBank acquirer = AcquirerBank.generic}) {
    return SettlementResult(
      isSuccess: false,
      errorMessage: errorMessage,
      acquirer: acquirer,
    );
  }
}

/// Hexagonal Output Port for Card Terminals / Datáfonos (BAC, Banpro, Lafise, SmartPOS, MiPOS)
abstract class CardTerminalPort {
  /// Unique identifier of the terminal device
  String get terminalId;

  /// Connection mode for this terminal instance
  TerminalConnectionMode get connectionMode;

  /// Bank acquirer affiliated with this terminal
  AcquirerBank get acquirer;

  /// Checks the connectivity and readiness of the terminal device
  Future<TerminalStatus> checkStatus();

  /// Requests card authorization for a specific payment intent
  Future<CardAuthorizationResult> processSale(CardPaymentIntent intent);

  /// Requests auto-reversal or transaction void
  Future<CardReversalResult> processReversal(
    String transactionId, {
    String? originalAuthCode,
    double? amount,
    String currency = 'NIO',
  });

  /// Triggers a batch settlement (Cierre de Lote Bancario)
  Future<SettlementResult> processSettlement({String? batchNumber});

  /// Aborts or cancels an ongoing waiting operation (if supported)
  Future<void> cancelCurrentOperation();
}
