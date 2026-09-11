import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';

void main() {
  const routing = FulfillmentRoutingPolicy();
  const print = PrintOutcomePolicy();

  test(
    'topology, policy, channel, and DGI identity contracts are immutable',
    () {
      final topology = FulfillmentTopology(
        tenantId: 'tenant-1',
        contractVersion: 1,
        revision: 4,
        operationMode: TenantOperationMode.foodparkQsr,
        channels: {FulfillmentChannel.kds, FulfillmentChannel.print},
      );
      const identity = DgiInvoiceIdentity(
        invoiceId: 'invoice-1',
        invoiceNumber: '001-001-01-00000001',
      );

      expect(
        topology.channels,
        containsAll([FulfillmentChannel.kds, FulfillmentChannel.print]),
      );
      expect(InventoryPolicy.directStock.requiresDirectStockLink, isTrue);
      expect(InventoryPolicy.notTracked.requiresDirectStockLink, isFalse);
      expect(
        topology.copyWith(revision: 5),
        FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 5,
          operationMode: TenantOperationMode.foodparkQsr,
          channels: {FulfillmentChannel.kds, FulfillmentChannel.print},
        ),
      );
      expect(
        identity,
        const DgiInvoiceIdentity(
          invoiceId: 'invoice-1',
          invoiceNumber: '001-001-01-00000001',
        ),
      );
      expect(identity.cancel(), isNot(same(identity)));
      expect(identity.cancel().isCanceled, isTrue);
      expect(identity.cancel().invoiceNumber, identity.invoiceNumber);
    },
  );

  test('valid profiles retain each physical line in its explicit group', () {
    final result = routing.route(
      lines: [
        FulfillmentLine(id: 'a', profile: RouteProfile.prepare('grill')),
        FulfillmentLine(
          id: 'b',
          profile: RouteProfile.directHandoff('counter'),
        ),
      ],
      acceptedRevision: 3,
    );

    expect(result.alerts, isEmpty);
    expect(result.lines.map((line) => line.id), ['a', 'b']);
    expect(result.lines.map((line) => line.action), [
      FulfillmentAction.prepare,
      FulfillmentAction.directHandoff,
    ]);
  });

  test(
    'missing, malformed, and stale profiles preserve every line in general dispatch',
    () {
      final result = routing.route(
        lines: [
          FulfillmentLine(id: 'missing'),
          FulfillmentLine(id: 'malformed', profile: RouteProfile.prepare('')),
          FulfillmentLine(
            id: 'stale',
            profile: RouteProfile.directHandoff('counter', revision: 2),
          ),
        ],
        acceptedRevision: 3,
      );

      expect(result.blocksOfflineSale, isFalse);
      expect(result.lines.map((line) => line.id).toSet(), {
        'missing',
        'malformed',
        'stale',
      });
      expect(result.lines, hasLength(3));
      expect(
        result.lines.every(
          (line) =>
              line.action == FulfillmentAction.directHandoff &&
              line.station == generalDispatchStation,
        ),
        isTrue,
      );
      expect(result.alerts, hasLength(3));
    },
  );

  test(
    'pre-send failure is retryable without changing ordered print effects',
    () {
      const receipt = PrintJob(sequence: 0, kind: PrintDocumentKind.receipt);
      const ticket = PrintJob(sequence: 1, kind: PrintDocumentKind.ticket);

      final transition = print.apply(receipt, PrintOutcome.preSendFailure);

      expect(PrintPlan(jobs: [receipt, ticket]).isOrdered, isTrue);
      expect(transition.state, PrintAttemptState.failed);
      expect(transition.canRetry, isTrue);
      expect(transition.createsBusinessEffect, isFalse);
    },
  );

  test(
    'post-send disconnect and response loss become uncertain and cannot retry',
    () {
      const ticket = PrintJob(sequence: 1, kind: PrintDocumentKind.ticket);

      final disconnect = print.apply(ticket, PrintOutcome.postSendDisconnect);
      final responseLoss = print.apply(ticket, PrintOutcome.responseLoss);

      expect(disconnect.state, PrintAttemptState.uncertain);
      expect(responseLoss.state, PrintAttemptState.uncertain);
      expect(disconnect.canRetry || responseLoss.canRetry, isFalse);
      expect(
        disconnect.createsBusinessEffect || responseLoss.createsBusinessEffect,
        isFalse,
      );
    },
  );
}
