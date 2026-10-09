import 'dart:convert';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';

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

  group('SalesMapper — voluntary tip persistence (PRD §21 / §33.4 / AD-10)', () {
    final baseInvoice = Invoice(
      id: 'inv-tip',
      number: '001-001-01-00000002',
      createdAt: DateTime(2026, 6, 23),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 0,
      total: 100,
    );

    /// A tip snapshot as captured at checkout: 10% of a 100 NIO eligible
    /// base, with the USD conversion at the commercial rate.
    Invoice tippedInvoice() => baseInvoice.copyWith(
          tipAmountNio: 10.0,
          tipAmountUsd: 0.27,
          tipPercentage: 10.0,
          tipEligibleBaseNio: 100.0,
        );

    test('toInvoiceEntity maps the tip snapshot from domain to entity', () {
      final entity = SalesMapper.toInvoiceEntity(tippedInvoice());

      expect(entity.tipAmountNio, 10.0);
      expect(entity.tipAmountUsd, 0.27);
      expect(entity.tipPercentage, 10.0);
      expect(entity.tipEligibleBaseNio, 100.0);
    });

    test('toInvoiceEntity leaves the tip columns null when there is no tip', () {
      final entity = SalesMapper.toInvoiceEntity(baseInvoice);

      expect(entity.tipAmountNio, isNull);
      expect(entity.tipAmountUsd, isNull);
      expect(entity.tipPercentage, isNull);
      expect(entity.tipEligibleBaseNio, isNull);
    });

    test('toInvoiceDomain maps the tip snapshot from entity to domain', () {
      final entity = SalesMapper.toInvoiceEntity(tippedInvoice());

      final domain = SalesMapper.toInvoiceDomain(entity);

      expect(domain.tipAmountNio, 10.0);
      expect(domain.tipAmountUsd, 0.27);
      expect(domain.tipPercentage, 10.0);
      expect(domain.tipEligibleBaseNio, 100.0);
    });

    test('toSyncJson includes the tip fields with real values', () {
      final json = SalesMapper.toSyncJson(tippedInvoice(), const [], const []);

      expect(json['tipAmountNio'], 10.0);
      expect(json['tipAmountUsd'], 0.27);
      expect(json['tipPercentage'], 10.0);
      expect(json['tipEligibleBaseNio'], 100.0);
    });

    test('toSyncJson emits the tip fields as null when no tip was given', () {
      // A tipless invoice persists null, never a fabricated value; the
      // payload mirrors that honestly (shiftId/localIssueDate convention).
      final json = SalesMapper.toSyncJson(baseInvoice, const [], const []);

      expect(json['tipAmountNio'], isNull);
      expect(json['tipAmountUsd'], isNull);
      expect(json['tipPercentage'], isNull);
      expect(json['tipEligibleBaseNio'], isNull);
    });

    test('tip snapshot round-trips entity → domain → sync JSON unchanged', () {
      final restored = SalesMapper.toInvoiceDomain(
        SalesMapper.toInvoiceEntity(tippedInvoice()),
      );

      final json = SalesMapper.toSyncJson(restored, const [], const []);

      expect(json['tipAmountNio'], 10.0);
      expect(json['tipAmountUsd'], 0.27);
      expect(json['tipPercentage'], 10.0);
      expect(json['tipEligibleBaseNio'], 100.0);
    });
  });

  group('SalesMapper — fx-rate fiscal snapshot travels to the cloud (D-6)', () {
    // Values as frozen at checkout (sale_view_model.dart): the commercial
    // rate actually applied to the USD conversion, NOT the entity default.
    final baseInvoice = Invoice(
      id: 'inv-fx',
      number: '001-001-01-00000003',
      createdAt: DateTime(2026, 6, 23),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
    );

    Invoice invoiceWithFxFacts() => baseInvoice.copyWith(
          bcnOfficialRate: 36.6243,
          commercialRate: 36.6243,
          totalUsd: 3.14,
        );

    test('toSyncJson emits bcnOfficialRate/commercialRate/totalUsd with real values', () {
      final json = SalesMapper.toSyncJson(invoiceWithFxFacts(), const [], const []);

      expect(json['bcnOfficialRate'], 36.6243);
      expect(json['commercialRate'], 36.6243);
      expect(json['totalUsd'], 3.14);
    });

    test('toSyncJson always emits the fx fields (non-nullable domain defaults, no conditionals)', () {
      // Even a legacy invoice without explicit values carries the domain
      // defaults; the payload must never omit the keys or the backend
      // silently writes its 36.5/0.0 column defaults (the D-6 defect).
      final json = SalesMapper.toSyncJson(baseInvoice, const [], const []);

      expect(json.keys, containsAll(['bcnOfficialRate', 'commercialRate', 'totalUsd']));
      expect(json['bcnOfficialRate'], isNotNull);
      expect(json['commercialRate'], isNotNull);
      expect(json['totalUsd'], isNotNull);
    });
  });

  group('SalesMapper — named invoice customer snapshot (odd/factura-con-nombre)', () {
    final baseInvoice = Invoice(
      id: 'inv-named',
      number: '001-001-01-00000004',
      createdAt: DateTime(2026, 10, 6),
      userId: 'user-1',
      subtotal: 100,
      totalTax: 15,
      total: 115,
    );

    Invoice namedInvoice() => baseInvoice.copyWith(
          customerName: 'Distribuidora Central S.A.',
          customerTaxId: 'J0310000001234',
        );

    test('toInvoiceEntity maps customerName and customerTaxId from domain to entity', () {
      final entity = SalesMapper.toInvoiceEntity(namedInvoice());

      expect(entity.customerName, 'Distribuidora Central S.A.');
      expect(entity.customerTaxId, 'J0310000001234');
    });

    test('toInvoiceEntity leaves customerName and customerTaxId null when anonymous', () {
      final entity = SalesMapper.toInvoiceEntity(baseInvoice);

      expect(entity.customerName, isNull);
      expect(entity.customerTaxId, isNull);
    });

    test('toInvoiceDomain maps customerName and customerTaxId from entity to domain', () {
      final entity = SalesMapper.toInvoiceEntity(namedInvoice());

      final domain = SalesMapper.toInvoiceDomain(entity);

      expect(domain.customerName, 'Distribuidora Central S.A.');
      expect(domain.customerTaxId, 'J0310000001234');
    });

    test('toSyncJson includes customerName and customerTaxId with real values', () {
      final json = SalesMapper.toSyncJson(namedInvoice(), const [], const []);

      expect(json['customerName'], 'Distribuidora Central S.A.');
      expect(json['customerTaxId'], 'J0310000001234');
    });

    test('toSyncJson OMITS customerName/customerTaxId keys for an anonymous sale (cross-version hash stability)', () {
      // The backend idempotency receipt hashes the canonical payload with a
      // serializer that filters undefined but KEEPS nulls. An unconditional
      // `"customerName": null` here would change the payload hash of every
      // anonymous sale already receipted before this feature shipped: a
      // retried outbox event would hash differently and be answered
      // IDEMPOTENCY_MISMATCH (CRITICAL_PAYLOAD_MISMATCH, retryable: false),
      // so the fiscal document would never reach the cloud mirror (the
      // D-10 outbox-never-drains family). The anonymous payload must stay
      // byte-identical to the pre-feature shape: NO key at all.
      final json = SalesMapper.toSyncJson(baseInvoice, const [], const []);

      expect(json.containsKey('customerName'), isFalse,
          reason: 'a null snapshot must emit NO customerName key');
      expect(json.containsKey('customerTaxId'), isFalse,
          reason: 'a null snapshot must emit NO customerTaxId key');
    });

    test('toSyncJson OMITS the customer keys for BLANK snapshot values (not just null)', () {
      final blankInvoice = baseInvoice.copyWith(
        customerName: '   ',
        customerTaxId: '',
      );

      final json = SalesMapper.toSyncJson(blankInvoice, const [], const []);

      expect(json.containsKey('customerName'), isFalse);
      expect(json.containsKey('customerTaxId'), isFalse);
    });

    test('toSyncJson emits ONLY the populated customer keys (name only / tax id only / both)', () {
      final nameOnly = SalesMapper.toSyncJson(
        baseInvoice.copyWith(customerName: 'Solo Nombre S.A.'),
        const [],
        const [],
      );
      expect(nameOnly['customerName'], 'Solo Nombre S.A.');
      expect(nameOnly.containsKey('customerTaxId'), isFalse,
          reason: 'a sale without tax id cannot have been receipted before the feature, so emitting only customerName is hash-safe');

      final taxIdOnly = SalesMapper.toSyncJson(
        baseInvoice.copyWith(customerTaxId: 'J0310000001234'),
        const [],
        const [],
      );
      expect(taxIdOnly['customerTaxId'], 'J0310000001234');
      expect(taxIdOnly.containsKey('customerName'), isFalse);

      final both = SalesMapper.toSyncJson(namedInvoice(), const [], const []);
      expect(both['customerName'], 'Distribuidora Central S.A.');
      expect(both['customerTaxId'], 'J0310000001234');
    });

    test('customer snapshot round-trips entity → domain → sync JSON unchanged', () {
      final restored = SalesMapper.toInvoiceDomain(
        SalesMapper.toInvoiceEntity(namedInvoice()),
      );

      final json = SalesMapper.toSyncJson(restored, const [], const []);

      expect(json['customerName'], 'Distribuidora Central S.A.');
      expect(json['customerTaxId'], 'J0310000001234');
    });
  });

  group('SalesMapper — fiscal timestamp convergence to UTC', () {
    final baseInvoice = Invoice(
      id: 'inv-tz-1',
      number: '001',
      createdAt: DateTime(2026, 10, 9, 14, 30),
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

    test('toSyncJson emits createdAt in strict ISO-8601 UTC with Z suffix', () {
      final localCreated = DateTime(2026, 10, 9, 14, 30);
      final json = SalesMapper.toSyncJson(
        baseInvoice.copyWith(createdAt: localCreated),
        const [],
        const [],
      );

      final createdAtStr = json['createdAt'] as String;
      expect(createdAtStr, endsWith('Z'),
          reason: 'wire sync timestamp must be explicit UTC with Z to prevent 6h server drift');
      expect(DateTime.parse(createdAtStr).toUtc(), localCreated.toUtc());
    });

    test('toSyncJson emits payment reconciledAt in strict ISO-8601 UTC with Z suffix', () {
      final localReconciled = DateTime(2026, 10, 9, 15, 0);
      final payment = Payment(
        id: 'pay-1',
        invoiceId: 'inv-tz-1',
        method: PaymentMethod.card,
        amount: 115,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 115,
        changeGiven: 0,
        changeCurrency: 'NIO',
        reconciliationStatus: 'CONCILIADO',
        reconciledAt: localReconciled,
      );

      final json = SalesMapper.toSyncJson(
        baseInvoice,
        const [],
        [payment],
      );

      final payments = json['payments'] as List<dynamic>;
      final payMap = payments.first as Map<String, dynamic>;
      final reconciledAtStr = payMap['reconciledAt'] as String;
      expect(reconciledAtStr, endsWith('Z'),
          reason: 'payment reconciledAt must be explicit UTC with Z');
      expect(DateTime.parse(reconciledAtStr).toUtc(), localReconciled.toUtc());
    });
  });

  group('SalesMapper - discountOrigin local persistence', () {
    InvoiceItem itemWith(Map<String, double>? discountOrigin) => InvoiceItem(
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
          discountOrigin: discountOrigin,
        );

    test('toItemEntity encodes a breakdown to a JSON string', () {
      final entity = SalesMapper.toItemEntity(itemWith({
        'promotion': 10.0,
        'manual': 5.0,
      }));

      expect(entity.discountOriginJson,
          jsonEncode({'promotion': 10.0, 'manual': 5.0}));
    });

    test('toItemEntity keeps null as null (legacy rows are never fabricated)',
        () {
      final entity = SalesMapper.toItemEntity(itemWith(null));

      expect(entity.discountOriginJson, isNull);
    });

    test('toItemDomain decodes the JSON string back to the map', () {
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
        discountOriginJson: jsonEncode({'loyalty': 3.5}),
      );

      final domain = SalesMapper.toItemDomain(entity);

      expect(domain.discountOrigin, {'loyalty': 3.5});
    });

    test('toItemDomain keeps a null JSON cell null, NOT an empty map', () {
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
        discountOriginJson: null,
      );

      final domain = SalesMapper.toItemDomain(entity);

      expect(domain.discountOrigin, isNull);
      // Null is not an empty map: the two states must never blur.
      expect(domain.discountOrigin, isNot(equals(<String, double>{})));
    });

    test('toItemDomain keeps only known keys with finite positive values', () {
      InvoiceItemEntity entityWith(String json) => InvoiceItemEntity(
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
            discountOriginJson: json,
          );

      // Unknown key dropped, zero dropped, non-numeric dropped.
      expect(
        SalesMapper.toItemDomain(entityWith(
                '{"promotion":10.0,"mystery":7.0,"manual":0.0,"loyalty":"x"}'))
            .discountOrigin,
        {'promotion': 10.0},
      );
      // Negative and NaN are not > 0.
      expect(
        SalesMapper.toItemDomain(
                entityWith('{"promotion":-3.0,"manual":5.0}'))
            .discountOrigin,
        {'manual': 5.0},
      );
      // Nothing valid remains -> null, never an empty map.
      expect(
        SalesMapper.toItemDomain(
                entityWith('{"promotion":0.0,"manual":-1.0}'))
            .discountOrigin,
        isNull,
      );
    });

    test('toItemDomain decodes corrupt JSON fail-safe to null', () {
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
        discountOriginJson: 'not-json{',
      );

      final domain = SalesMapper.toItemDomain(entity);

      expect(domain.discountOrigin, isNull);
    });
  });
}
