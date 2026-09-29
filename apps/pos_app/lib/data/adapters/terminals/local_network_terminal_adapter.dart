import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import '../../../domain/ports/card_terminal_port.dart';

/// Adapter implementing [CardTerminalPort] over local TCP/IP socket connection to SmartPOS / PinPads.
class LocalNetworkTerminalAdapter implements CardTerminalPort {
  @override
  final String terminalId;

  final String host;
  final int port;

  @override
  final AcquirerBank acquirer;

  final Duration socketTimeout;

  /// M8 (Batch 3): timeout for the STATUS answer once the socket connected.
  /// Exposed for tests; a timeout here is a TRANSIENT condition (the terminal
  /// accepted the connection but did not answer), not definitive offline.
  final Duration statusTimeout;

  @override
  TerminalConnectionMode get connectionMode => TerminalConnectionMode.localNetworkTcp;

  Socket? _activeSocket;

  LocalNetworkTerminalAdapter({
    required this.terminalId,
    required this.host,
    this.port = 9000,
    this.acquirer = AcquirerBank.bac,
    this.socketTimeout = const Duration(seconds: 45),
    this.statusTimeout = const Duration(seconds: 3),
  });

  @override
  Future<TerminalStatus> checkStatus() async {
    try {
      final socket = await Socket.connect(host, port, timeout: const Duration(seconds: 3));
      final payload = jsonEncode({'action': 'STATUS', 'terminal_id': terminalId}) + '\n';
      socket.write(payload);
      await socket.flush();

      final completer = Completer<String>();
      socket.cast<List<int>>().transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
        if (!completer.isCompleted) completer.complete(line);
      }, onError: (err) {
        if (!completer.isCompleted) completer.completeError(err);
      });

      final response = await completer.future.timeout(statusTimeout);
      await socket.close();

      final data = jsonDecode(response) as Map<String, dynamic>;
      if (data['status'] == 'READY') {
        return TerminalStatus.ready;
      } else if (data['status'] == 'PAPER_OUT') {
        return TerminalStatus.paperOut;
      } else if (data['status'] == 'BUSY') {
        return TerminalStatus.busy;
      }
      return TerminalStatus.ready;
    } on SocketException catch (e) {
      // M8 (Batch 3): a socket-level failure (connection refused, network
      // unreachable) means the terminal is DEFINITIVELY unreachable —
      // `offline` remains the accurate status.
      developer.log(
        'Terminal $terminalId unreachable at $host:$port; reporting '
        'definitive offline.',
        name: 'LocalNetworkTerminalAdapter',
        level: 900, // WARNING
        error: e,
      );
      return TerminalStatus.offline;
    } on TimeoutException catch (e) {
      // M8 (Batch 3): the socket connected but the terminal did not answer
      // in time. That is a TRANSIENT condition (slow terminal, congested
      // network), not a definitive offline state.
      developer.log(
        'Terminal $terminalId connected but STATUS answer timed out after '
        '$statusTimeout; reporting transient error.',
        name: 'LocalNetworkTerminalAdapter',
        level: 900, // WARNING
        error: e,
      );
      return TerminalStatus.error;
    } catch (e, st) {
      // M8 (Batch 3): malformed or unexpected response — the terminal IS
      // reachable (it answered), so it is degraded, not offline.
      developer.log(
        'Terminal $terminalId returned an unexpected STATUS response; '
        'reporting error.',
        name: 'LocalNetworkTerminalAdapter',
        level: 900, // WARNING
        error: e,
        stackTrace: st,
      );
      return TerminalStatus.error;
    }
  }

  @override
  Future<CardAuthorizationResult> processSale(CardPaymentIntent intent) async {
    Socket? socket;
    try {
      socket = await Socket.connect(host, port, timeout: const Duration(seconds: 5));
      _activeSocket = socket;

      final requestPayload = jsonEncode({
        'action': 'SALE',
        'terminal_id': terminalId,
        'transaction_id': intent.transactionId,
        'invoice_id': intent.invoiceId,
        'amount': intent.amount,
        'currency': intent.currency,
        'cashier': intent.cashierName,
      }) + '\n';

      socket.write(requestPayload);
      await socket.flush();

      final completer = Completer<String>();
      socket.cast<List<int>>().transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
        if (!completer.isCompleted) completer.complete(line);
      }, onError: (err) {
        if (!completer.isCompleted) completer.completeError(err);
      });

      final responseStr = await completer.future.timeout(socketTimeout);
      final data = jsonDecode(responseStr) as Map<String, dynamic>;

      if (data['status'] == 'APPROVED') {
        return CardAuthorizationResult.success(
          authCode: data['auth_code'] ?? '000000',
          batchNumber: data['batch'] ?? '001',
          cardBrand: CardBrand.fromString(data['brand']?.toString()),
          cardType: CardType.fromString(data['type']?.toString()),
          last4: data['last4']?.toString() ?? '0000',
          terminalId: terminalId,
          acquirer: acquirer,
          voucherText: data['voucher_text'] ?? 'APROBADO',
          reconciliationStatus: 'CONCILIADO',
          rawResponse: data,
          authorizedAt: DateTime.now(),
        );
      } else {
        return CardAuthorizationResult.failure(
          errorMessage: data['message'] ?? 'Transacción Declinada en Terminal',
          errorCode: data['error_code'] ?? 'DECLINED',
          acquirer: acquirer,
          rawResponse: data,
        );
      }
    } on TimeoutException {
      return CardAuthorizationResult.failure(
        errorMessage: 'Tiempo de espera agotado al conectar con el datáfono ($socketTimeout)',
        errorCode: 'TIMEOUT',
        acquirer: acquirer,
      );
    } catch (e) {
      return CardAuthorizationResult.failure(
        errorMessage: 'Error de comunicación TCP con datáfono en $host:$port ($e)',
        errorCode: 'COMMUNICATION_ERROR',
        acquirer: acquirer,
      );
    } finally {
      try {
        await socket?.close();
      } catch (_) {}
      _activeSocket = null;
    }
  }

  @override
  Future<CardReversalResult> processReversal(
    String transactionId, {
    String? originalAuthCode,
    double? amount,
    String currency = 'NIO',
  }) async {
    Socket? socket;
    try {
      socket = await Socket.connect(host, port, timeout: const Duration(seconds: 5));
      final payload = jsonEncode({
        'action': 'REVERSAL',
        'terminal_id': terminalId,
        'transaction_id': transactionId,
        'auth_code': originalAuthCode,
        'amount': amount,
        'currency': currency,
      }) + '\n';

      socket.write(payload);
      await socket.flush();

      final completer = Completer<String>();
      socket.cast<List<int>>().transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
        if (!completer.isCompleted) completer.complete(line);
      });

      final responseStr = await completer.future.timeout(const Duration(seconds: 15));
      final data = jsonDecode(responseStr) as Map<String, dynamic>;

      if (data['status'] == 'APPROVED') {
        return CardReversalResult.success(
          reversalCode: data['reversal_code'] ?? 'REV-$transactionId',
          message: data['message'] ?? 'Reverso aprobado en datáfono',
          rawResponse: data,
        );
      } else {
        return CardReversalResult.failure(data['message'] ?? 'Fallo en reverso', rawResponse: data);
      }
    } catch (e) {
      return CardReversalResult.failure('Error de red al reversar: $e');
    } finally {
      try {
        await socket?.close();
      } catch (_) {}
    }
  }

  @override
  Future<SettlementResult> processSettlement({String? batchNumber}) async {
    Socket? socket;
    try {
      socket = await Socket.connect(host, port, timeout: const Duration(seconds: 5));
      final payload = jsonEncode({
        'action': 'SETTLEMENT',
        'terminal_id': terminalId,
        'batch': batchNumber,
      }) + '\n';

      socket.write(payload);
      await socket.flush();

      final completer = Completer<String>();
      socket.cast<List<int>>().transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
        if (!completer.isCompleted) completer.complete(line);
      });

      final responseStr = await completer.future.timeout(const Duration(seconds: 20));
      final data = jsonDecode(responseStr) as Map<String, dynamic>;

      if (data['status'] == 'APPROVED') {
        return SettlementResult.success(
          batchNumber: data['batch'] ?? batchNumber ?? '001',
          transactionCount: (data['count'] as num?)?.toInt() ?? 0,
          totalAmountNio: (data['amount_nio'] as num?)?.toDouble() ?? 0.0,
          totalAmountUsd: (data['amount_usd'] as num?)?.toDouble() ?? 0.0,
          acquirer: acquirer,
          terminalId: terminalId,
          settlementText: data['settlement_text'] ?? 'CIERRE DE LOTE EXITOSO',
        );
      } else {
        return SettlementResult.failure(data['message'] ?? 'Fallo en cierre de lote', acquirer: acquirer);
      }
    } catch (e) {
      return SettlementResult.failure('Error en socket de cierre de lote: $e', acquirer: acquirer);
    } finally {
      try {
        await socket?.close();
      } catch (_) {}
    }
  }

  @override
  Future<void> cancelCurrentOperation() async {
    try {
      _activeSocket?.destroy();
    } catch (_) {}
    _activeSocket = null;
  }
}
