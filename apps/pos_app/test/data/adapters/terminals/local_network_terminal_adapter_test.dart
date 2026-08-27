import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/terminals/local_network_terminal_adapter.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';

void main() {
  group('LocalNetworkTerminalAdapter Socket Tests', () {
    late ServerSocket mockServer;
    late int serverPort;
    late LocalNetworkTerminalAdapter adapter;
    late StreamController<Map<String, dynamic>> responseEmitter;

    setUp(() async {
      responseEmitter = StreamController<Map<String, dynamic>>.broadcast();
      mockServer = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      serverPort = mockServer.port;

      mockServer.listen((clientSocket) {
        clientSocket
            .cast<List<int>>()
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .listen((line) {
          final request = jsonDecode(line) as Map<String, dynamic>;
          final action = request['action'];

          if (action == 'STATUS') {
            clientSocket.write(jsonEncode({'status': 'READY'}) + '\n');
          } else if (action == 'SALE') {
            if (request['amount'] == 9999.0) {
              // Simulate decline
              clientSocket.write(jsonEncode({
                'status': 'DECLINED',
                'error_code': 'INSUFFICIENT_FUNDS',
                'message': 'Fondos insuficientes en cuenta',
              }) + '\n');
            } else {
              clientSocket.write(jsonEncode({
                'status': 'APPROVED',
                'auth_code': 'AUTH-LOCAL-88',
                'batch': 'LOTE-001',
                'brand': 'VISA',
                'type': 'CREDITO',
                'last4': '4433',
                'voucher_text': 'APROBADO EN PINPAD TCP',
              }) + '\n');
            }
          } else if (action == 'REVERSAL') {
            clientSocket.write(jsonEncode({
              'status': 'APPROVED',
              'reversal_code': 'REV-TCP-999',
              'message': 'Reverso completado en terminal IP',
            }) + '\n');
          } else if (action == 'SETTLEMENT') {
            clientSocket.write(jsonEncode({
              'status': 'APPROVED',
              'batch': 'LOTE-001',
              'count': 5,
              'amount_nio': 3500.0,
              'amount_usd': 50.0,
              'settlement_text': 'CIERRE DE LOTE EXITOSO',
            }) + '\n');
          }
        });
      });

      adapter = LocalNetworkTerminalAdapter(
        terminalId: 'DATAFONO-IP-01',
        host: InternetAddress.loopbackIPv4.address,
        port: serverPort,
        acquirer: AcquirerBank.bac,
      );
    });

    tearDown(() async {
      await mockServer.close();
      await responseEmitter.close();
    });

    test('checkStatus returns ready when socket responds properly', () async {
      final status = await adapter.checkStatus();
      expect(status, TerminalStatus.ready);
      expect(adapter.connectionMode, TerminalConnectionMode.localNetworkTcp);
      expect(adapter.acquirer, AcquirerBank.bac);
    });

    test('checkStatus returns offline if server is unreachable', () async {
      final badAdapter = LocalNetworkTerminalAdapter(
        terminalId: 'BAD-IP',
        host: '127.0.0.1',
        port: 65432, // Closed port
      );
      final status = await badAdapter.checkStatus();
      expect(status, TerminalStatus.offline);
    });

    test('processSale receives approved response and parses metadata accurately', () async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-TCP-01',
        invoiceId: 'INV-100',
        amount: 850.0,
        currency: 'NIO',
        cashierName: 'Juan Cajero',
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isTrue);
      expect(result.authCode, 'AUTH-LOCAL-88');
      expect(result.batchNumber, 'LOTE-001');
      expect(result.cardBrand, CardBrand.visa);
      expect(result.cardType, CardType.credit);
      expect(result.last4, '4433');
      expect(result.terminalId, 'DATAFONO-IP-01');
      expect(result.reconciliationStatus, 'CONCILIADO');
    });

    test('processSale handles declined transactions from terminal server', () async {
      const intent = CardPaymentIntent(
        transactionId: 'TRX-TCP-DECLINE',
        invoiceId: 'INV-101',
        amount: 9999.0, // Triggers decline in mock
      );

      final result = await adapter.processSale(intent);

      expect(result.isSuccess, isFalse);
      expect(result.errorCode, 'INSUFFICIENT_FUNDS');
      expect(result.errorMessage, contains('Fondos insuficientes'));
      expect(result.reconciliationStatus, 'RECHAZADO');
    });

    test('processReversal sends command and parses approval', () async {
      final reversal = await adapter.processReversal('TRX-TCP-01');

      expect(reversal.isSuccess, isTrue);
      expect(reversal.reversalCode, 'REV-TCP-999');
      expect(reversal.message, contains('Reverso completado'));
    });

    test('processSettlement computes count and multi-currency balances', () async {
      final settlement = await adapter.processSettlement(batchNumber: 'LOTE-001');

      expect(settlement.isSuccess, isTrue);
      expect(settlement.batchNumber, 'LOTE-001');
      expect(settlement.transactionCount, 5);
      expect(settlement.totalAmountNio, 3500.0);
      expect(settlement.totalAmountUsd, 50.0);
    });
  });
}
