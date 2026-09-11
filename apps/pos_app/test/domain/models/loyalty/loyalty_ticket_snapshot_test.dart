import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';

void main() {
  group('TicketLineSnapshot — Value Object', () {
    test('crea línea NORMAL con monto neto', () {
      final line = TicketLineSnapshot(
        lineId: 'line-1',
        productId: 'prod-1',
        quantity: 2,
        netAmount: 250.0,
        source: TicketLineSource.normal,
      );

      expect(line.lineId, equals('line-1'));
      expect(line.productId, equals('prod-1'));
      expect(line.quantity, equals(2));
      expect(line.netAmount, equals(250.0));
      expect(line.source, equals(TicketLineSource.normal));
    });

    test('crea línea LOYALTY_REWARD', () {
      final line = TicketLineSnapshot(
        lineId: 'line-2',
        productId: 'prod-free',
        quantity: 1,
        netAmount: 0.0,
        source: TicketLineSource.loyaltyReward,
      );

      expect(line.source, equals(TicketLineSource.loyaltyReward));
      expect(line.netAmount, equals(0.0));
    });

    test('equality por todos los campos', () {
      final a = TicketLineSnapshot(
        lineId: 'l1', productId: 'p1', quantity: 1,
        netAmount: 100.0, source: TicketLineSource.normal,
      );
      final b = TicketLineSnapshot(
        lineId: 'l1', productId: 'p1', quantity: 1,
        netAmount: 100.0, source: TicketLineSource.normal,
      );
      final c = TicketLineSnapshot(
        lineId: 'l2', productId: 'p1', quantity: 1,
        netAmount: 100.0, source: TicketLineSource.normal,
      );

      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('quantity debe ser positivo', () {
      expect(
        () => TicketLineSnapshot(
          lineId: 'l1', productId: 'p1', quantity: 0,
          netAmount: 100.0, source: TicketLineSource.normal,
        ),
        throwsArgumentError,
      );
    });

    test('netAmount no puede ser negativo', () {
      expect(
        () => TicketLineSnapshot(
          lineId: 'l1', productId: 'p1', quantity: 1,
          netAmount: -10.0, source: TicketLineSource.normal,
        ),
        throwsArgumentError,
      );
    });
  });

  group('LoyaltyTicketSnapshot — Domain Model', () {
    test('crea snapshot con líneas', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-1',
        customerId: 'customer-1',
        occurredAt: DateTime.utc(2026, 9, 1, 12),
        lines: [
          TicketLineSnapshot(
            lineId: 'l1', productId: 'prod-1', quantity: 2,
            netAmount: 250.0, source: TicketLineSource.normal,
          ),
          TicketLineSnapshot(
            lineId: 'l2', productId: 'prod-2', quantity: 1,
            netAmount: 150.0, source: TicketLineSource.normal,
          ),
        ],
      );

      expect(snapshot.tenantId, equals('tenant-1'));
      expect(snapshot.lines.length, equals(2));
      expect(snapshot.totalNetAmount, equals(400.0));
    });

    test('totalNetAmount excluye líneas LOYALTY_REWARD', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-1',
        customerId: 'customer-1',
        occurredAt: DateTime.utc(2026, 9, 1, 12),
        lines: [
          TicketLineSnapshot(
            lineId: 'l1', productId: 'prod-1', quantity: 2,
            netAmount: 250.0, source: TicketLineSource.normal,
          ),
          TicketLineSnapshot(
            lineId: 'l2', productId: 'prod-free', quantity: 1,
            netAmount: 0.0, source: TicketLineSource.loyaltyReward,
          ),
        ],
      );

      expect(snapshot.totalNetAmount, equals(250.0));
      expect(snapshot.normalLines.length, equals(1));
      expect(snapshot.loyaltyRewardLines.length, equals(1));
    });

    test('totalNetAmount suma todas las líneas normales', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-1',
        customerId: 'customer-1',
        occurredAt: DateTime.utc(2026, 9, 1, 12),
        lines: [
          TicketLineSnapshot(
            lineId: 'l1', productId: 'prod-1', quantity: 3,
            netAmount: 150.0, source: TicketLineSource.normal,
          ),
          TicketLineSnapshot(
            lineId: 'l2', productId: 'prod-2', quantity: 1,
            netAmount: 200.0, source: TicketLineSource.normal,
          ),
          TicketLineSnapshot(
            lineId: 'l3', productId: 'prod-3', quantity: 2,
            netAmount: 50.0, source: TicketLineSource.normal,
          ),
        ],
      );

      expect(snapshot.totalNetAmount, equals(400.0));
      expect(snapshot.normalLines.length, equals(3));
    });

    test('customerId puede ser null (customer no identificado)', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-1',
        occurredAt: DateTime.utc(2026, 9, 1, 12),
        lines: [],
      );

      expect(snapshot.customerId, isNull);
    });

    test('lines vacío produce totalNetAmount = 0', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'terminal-1',
        ticketId: 'ticket-1',
        occurredAt: DateTime.utc(2026, 9, 1, 12),
        lines: [],
      );

      expect(snapshot.totalNetAmount, equals(0.0));
      expect(snapshot.normalLines, isEmpty);
      expect(snapshot.loyaltyRewardLines, isEmpty);
    });

    test('equality por todos los campos requeridos', () {
      final at = DateTime.utc(2026, 9, 1, 12);
      final a = LoyaltyTicketSnapshot(
        tenantId: 't1', branchId: 'b1', terminalId: 'term1',
        ticketId: 'tk1', customerId: 'c1', occurredAt: at, lines: [],
      );
      final b = LoyaltyTicketSnapshot(
        tenantId: 't1', branchId: 'b1', terminalId: 'term1',
        ticketId: 'tk1', customerId: 'c1', occurredAt: at, lines: [],
      );
      final c = LoyaltyTicketSnapshot(
        tenantId: 't2', branchId: 'b1', terminalId: 'term1',
        ticketId: 'tk1', customerId: 'c1', occurredAt: at, lines: [],
      );

      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });
  });
}
