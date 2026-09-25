import 'dart:convert';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

void main() {
  group('SalesMapper - recipeVersionId per-line binding', () {
    final baseInvoice = Invoice(
      id: 'inv-1',
      number: '001',
      createdAt: DateTime(2026, 6, 23),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
      isCanceled: false,
      voidReason: null,
      syncStatus: SyncStatus.pending,
      paymentStatus: PaymentStatus.paid,
      type: InvoiceType.regular,
      customerId: null,
    );

    test('toItemEntity maps recipeVersionId from domain to entity', () {
      final domain = InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'prod-1',
        productName: 'Burger',
        quantity: 2,
        unitPrice: 50,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 15,
        total: 115,
        recipeVersionId: 'rv-historical-1',
      );

      final entity = SalesMapper.toItemEntity(domain);

      expect(entity.recipeVersionId, 'rv-historical-1');
    });

    test('toItemDomain maps recipeVersionId from entity to domain', () {
      final entity = InvoiceItemEntity(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'prod-1',
        productName: 'Burger',
        quantity: 2,
        unitPrice: 50,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 15,
        total: 115,
        recipeVersionId: 'rv-historical-1',
      );

      final domain = SalesMapper.toItemDomain(entity);

      expect(domain.recipeVersionId, 'rv-historical-1');
    });

    test('toItemEntity maps null recipeVersionId for non-prepared products', () {
      final domain = InvoiceItem(
        id: 'item-2',
        invoiceId: 'inv-1',
        productId: 'prod-2',
        productName: 'Soda',
        quantity: 1,
        unitPrice: 20,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 3,
        total: 23,
      );

      final entity = SalesMapper.toItemEntity(domain);

      expect(entity.recipeVersionId, isNull);
    });

    test('toSyncJson includes recipeVersionId per line, not per document', () {
      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-1',
          productName: 'Burger',
          quantity: 2,
          unitPrice: 50,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15,
          total: 115,
          recipeVersionId: 'rv-v1',
        ),
        InvoiceItem(
          id: 'item-2',
          invoiceId: 'inv-1',
          productId: 'prod-2',
          productName: 'Salad',
          quantity: 1,
          unitPrice: 30,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 4.5,
          total: 34.5,
          recipeVersionId: 'rv-v2',
        ),
      ];

      final json = SalesMapper.toSyncJson(baseInvoice, items, []);

      final jsonItems = json['items'] as List<dynamic>;
      expect(jsonItems, hasLength(2));
      // Per-line binding: each line carries its own recipeVersionId
      expect(
        (jsonItems[0] as Map<String, dynamic>)['recipeVersionId'],
        'rv-v1',
      );
      expect(
        (jsonItems[1] as Map<String, dynamic>)['recipeVersionId'],
        'rv-v2',
      );
      // No document-level recipeVersionId
      expect(json.containsKey('recipeVersionId'), isFalse);
    });

    test('toSyncJson includes null recipeVersionId when not set', () {
      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-1',
          productName: 'Soda',
          quantity: 1,
          unitPrice: 20,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 3,
          total: 23,
        ),
      ];

      final json = SalesMapper.toSyncJson(baseInvoice, items, []);

      final jsonItems = json['items'] as List<dynamic>;
      expect(
        (jsonItems[0] as Map<String, dynamic>)['recipeVersionId'],
        isNull,
      );
    });


    test('round-trips D3 snapshot/version and invoice outcome parity', () {
      final snapshot = SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.direct, catalogRevision: 'r', mappingVersionId: 'mapping', bindings: [SaleTimeInventoryBinding(bindingOrdinal: 0, insumoId: 'insumo', quantityPerSaleUnit: 1.25, saleCorrelationId: 'c')]);
      final item = InvoiceItem(id: 'snapshot', invoiceId: 'inv-1', productId: 'p', productName: 'Soda', quantity: 2, unitPrice: 20, originalTaxRate: .15, appliedTaxRate: .15, taxAmount: 6, total: 46, inventorySnapshot: snapshot, inventorySnapshotVersion: 'SALE_TIME_V1');
      final payload = SalesMapper.toSyncJson(baseInvoice.copyWith(inventoryPolicyVersion: 'SALE_TIME_V1', inventoryOutcome: 'APPLIED'), [SalesMapper.toItemDomain(SalesMapper.toItemEntity(item))], const []);
      expect((payload['items'] as List).single['inventorySnapshotVersion'], 'SALE_TIME_V1');
      expect((payload['items'] as List).single['inventorySnapshot'].keys, isNot(contains('snapshotVersion')));
      expect(payload['inventoryOutcome'], 'APPLIED');
    });
    test('rejects an outbound version without a snapshot', () {
      final item = InvoiceItem(id: 'version-only', invoiceId: 'inv-1', productId: 'p', productName: 'Soda', quantity: 1, unitPrice: 20, originalTaxRate: .15, appliedTaxRate: .15, taxAmount: 3, total: 23, inventorySnapshotVersion: 'SALE_TIME_V1');
      expect(() => SalesMapper.toSyncJson(baseInvoice, [item], const []), throwsArgumentError);
    });
    test('round-trips persisted invoice outcome fields into the wire payload', () {
      final original = baseInvoice.copyWith(inventoryPolicyVersion: 'SALE_TIME_V1', inventoryOutcome: 'APPLIED', inventoryOutcomeReason: 'reason');
      final restored = SalesMapper.toInvoiceDomain(SalesMapper.toInvoiceEntity(original));
      final payload = SalesMapper.toSyncJson(restored, const [], const []);
      expect([restored.inventoryPolicyVersion, restored.inventoryOutcome, restored.inventoryOutcomeReason], ['SALE_TIME_V1', 'APPLIED', 'reason']);
      expect([payload['inventoryPolicyVersion'], payload['inventoryOutcome'], payload['inventoryOutcomeReason']], ['SALE_TIME_V1', 'APPLIED', 'reason']);
    });
    test('omits all new wire keys for legacy items and rejects contradictory persistence', () {
      final legacy = InvoiceItem(id: 'legacy', invoiceId: 'inv-1', productId: 'p', productName: 'Soda', quantity: 1, unitPrice: 20, originalTaxRate: .15, appliedTaxRate: .15, taxAmount: 3, total: 23);
      final payload = SalesMapper.toSyncJson(baseInvoice, [legacy], const []);
      for (final key in ['inventoryPolicyVersion', 'inventoryOutcome', 'inventoryOutcomeReason']) { expect(payload, isNot(contains(key))); }
      for (final key in ['inventorySnapshotVersion', 'inventorySnapshot']) { expect((payload['items'] as List).single, isNot(contains(key))); }
      final noImpact = SaleTimeInventorySnapshot(classification: SaleInventoryClassification.simple, disposition: SaleInventoryDisposition.noImpact, catalogRevision: 'r', reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING');
      final persisted = InvoiceItemEntity(id: 'bad', invoiceId: 'inv-1', productId: 'p', productName: 'Soda', quantity: 1, unitPrice: 20, originalTaxRate: .15, appliedTaxRate: .15, taxAmount: 3, total: 23, inventorySnapshotJson: jsonEncode(noImpact.toJson()));
      expect(() => SalesMapper.toItemDomain(persisted), throwsArgumentError);
    });
  });

  group('SalesMapper — #551 shiftId + localIssueDate travel to the cloud', () {
    final baseInvoice = Invoice(
      id: 'inv-1',
      number: '001-001-01-00000001',
      createdAt: DateTime(2026, 6, 23),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
    );

    InvoiceEntity invoiceWithShiftFacts() => InvoiceEntity(
          id: 'inv-1',
          number: '001-001-01-00000001',
          createdAt: DateTime(2026, 6, 23).millisecondsSinceEpoch,
          userId: 'user-1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
        )
          ..shiftId = 'shift-77'
          ..localIssueDate = '2026-06-23';

    test('toInvoiceDomain preserves the entity shift membership facts (#548 full-column pattern)', () {
      final domain = SalesMapper.toInvoiceDomain(invoiceWithShiftFacts());

      expect(domain.shiftId, 'shift-77');
      expect(domain.localIssueDate, '2026-06-23');
    });

    test('toInvoiceEntity preserves the domain shift membership facts (round trip)', () {
      final domain = SalesMapper.toInvoiceDomain(invoiceWithShiftFacts());
      final entity = SalesMapper.toInvoiceEntity(domain);

      expect(entity.shiftId, 'shift-77');
      expect(entity.localIssueDate, '2026-06-23');
    });

    test('toSyncJson emits shiftId and localIssueDate with real values', () {
      final domain = SalesMapper.toInvoiceDomain(invoiceWithShiftFacts());

      final json = SalesMapper.toSyncJson(domain, const [], const []);

      expect(json['shiftId'], 'shift-77');
      expect(json['localIssueDate'], '2026-06-23');
    });

    test('toSyncJson emits null shiftId/localIssueDate as null (relatedInvoiceId convention)', () {
      // An invoice issued with no open shift persists null, never a
      // fabricated value (B1a-4/D-11); the payload mirrors that honestly.
      final json = SalesMapper.toSyncJson(baseInvoice, const [], const []);

      expect(json['shiftId'], isNull);
      expect(json['localIssueDate'], isNull);
    });

    test('#551 tripwire: the payload MUST contain the shiftId and localIssueDate keys', () {
      final domain = SalesMapper.toInvoiceDomain(invoiceWithShiftFacts());

      final json = SalesMapper.toSyncJson(domain, const [], const []);

      // The server-side D-15 void guard is structurally impossible without
      // these facts. If this test fails because someone removed the keys,
      // restore them — removal breaks the fiscal-cloud projection.
      expect(json.keys, containsAll(['shiftId', 'localIssueDate']));
    });

    test('fiscal_header_snapshot stays EXCLUDED from the sync payload', () {
      // Intentional per #551: the snapshot is an immutable on-device
      // reprint artifact, not a cloud fact.
      final domain = SalesMapper.toInvoiceDomain(invoiceWithShiftFacts());

      final json = SalesMapper.toSyncJson(domain, const [], const []);

      expect(json.keys, isNot(contains('fiscalHeaderSnapshot')));
      expect(json.keys, isNot(contains('fiscal_header_snapshot')));
      expect(jsonEncode(json), isNot(contains('fiscalHeaderSnapshot')));
    });
  });
}
