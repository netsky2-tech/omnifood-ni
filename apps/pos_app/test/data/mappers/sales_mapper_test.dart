import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
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
  });
}
