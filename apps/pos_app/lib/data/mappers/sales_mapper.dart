import 'package:uuid/uuid.dart';
import '../../domain/models/sales/invoice.dart';
import '../../domain/models/sales/invoice_item.dart';
import '../../domain/models/sales/payment.dart';
import '../../domain/models/sales/promotion.dart';
import '../models/sales/invoice_entity.dart';
import '../models/sales/invoice_item_entity.dart';
import '../models/sales/payment_entity.dart';
import '../models/sales/promotion_entity.dart';

import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';

import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/data/models/sales/hold_ticket_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart'; // For Modifier

class SalesMapper {
  // --- Promotion ---
  static Promotion toPromotionDomain(PromotionEntity entity) {
    return Promotion(
      id: entity.id,
      name: entity.name,
      type: PromotionType.values.firstWhere((e) => e.name == entity.type),
      targetProductId: entity.targetProductId,
      buyQuantity: entity.buyQuantity,
      getQuantity: entity.getQuantity,
      discountValue: entity.discountValue,
      isActive: entity.isActive,
    );
  }

  static PromotionEntity toPromotionEntity(Promotion domain) {
    return PromotionEntity(
      id: domain.id,
      name: domain.name,
      type: domain.type.name,
      targetProductId: domain.targetProductId,
      buyQuantity: domain.buyQuantity,
      getQuantity: domain.getQuantity,
      discountValue: domain.discountValue,
      isActive: domain.isActive,
    );
  }

  // --- Hold Ticket ---
  static HoldTicket toHoldTicketDomain(HoldTicketEntity entity, List<HoldTicketItemEntity> itemEntities) {
    return HoldTicket(
      id: entity.id,
      name: entity.name,
      createdAt: DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
      isGlobalTaxExempt: entity.isGlobalTaxExempt,
      items: itemEntities.map((e) => CartItem(
        productId: e.productId,
        productName: e.productName,
        quantity: e.quantity,
        unitPrice: e.unitPrice,
        taxRate: e.taxRate,
      )).toList(),
    );
  }

  static HoldTicketEntity toHoldTicketEntity(HoldTicket domain) {
    return HoldTicketEntity(
      id: domain.id,
      name: domain.name,
      createdAt: domain.createdAt.millisecondsSinceEpoch,
      isGlobalTaxExempt: domain.isGlobalTaxExempt,
    );
  }

  static List<HoldTicketItemEntity> toHoldTicketItemEntities(HoldTicket domain) {
    return domain.items.map((item) => HoldTicketItemEntity(
      id: const Uuid().v4(),
      holdTicketId: domain.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
    )).toList();
  }

  // --- Cashier Session ---
  static CashierSession toSessionDomain(CashierSessionEntity entity) {
    return CashierSession(
      id: entity.id,
      userId: entity.userId,
      openedAt: DateTime.fromMillisecondsSinceEpoch(entity.openedAt),
      closedAt: entity.closedAt != null
          ? DateTime.fromMillisecondsSinceEpoch(entity.closedAt!)
          : null,
      openingBalance: entity.openingBalance,
      closingBalance: entity.closingBalance,
      totalSales: entity.totalSales,
      totalExpected: entity.totalExpected,
      isClosed: entity.isClosed,
    );
  }

  static CashierSessionEntity toSessionEntity(CashierSession domain) {
    return CashierSessionEntity(
      id: domain.id,
      userId: domain.userId,
      openedAt: domain.openedAt.millisecondsSinceEpoch,
      closedAt: domain.closedAt?.millisecondsSinceEpoch,
      openingBalance: domain.openingBalance,
      closingBalance: domain.closingBalance,
      totalSales: domain.totalSales,
      totalExpected: domain.totalExpected,
      isClosed: domain.isClosed,
    );
  }

  // --- Invoice ---
  static Invoice toInvoiceDomain(InvoiceEntity entity) {
    return Invoice(
      id: entity.id,
      number: entity.number,
      createdAt: DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
      userId: entity.userId,
      subtotal: entity.subtotal,
      totalTax: entity.totalTax,
      total: entity.total,
      isCanceled: entity.isCanceled,
      voidReason: entity.voidReason,
      syncStatus: SyncStatus.values.firstWhere(
        (e) => e.name == entity.syncStatus,
        orElse: () => SyncStatus.pending,
      ),
      paymentStatus: PaymentStatus.values.firstWhere(
        (e) => e.name == entity.paymentStatus,
        orElse: () => PaymentStatus.pending,
      ),
      type: InvoiceType.values.firstWhere(
        (e) => e.name == entity.type,
        orElse: () => InvoiceType.regular,
      ),
      customerId: entity.customerId,
      globalTaxOverride: entity.globalTaxOverride,
      relatedInvoiceId: entity.relatedInvoiceId,
    );
  }

  static InvoiceEntity toInvoiceEntity(Invoice domain) {
    return InvoiceEntity(
      id: domain.id,
      number: domain.number,
      createdAt: domain.createdAt.millisecondsSinceEpoch,
      userId: domain.userId,
      subtotal: domain.subtotal,
      totalTax: domain.totalTax,
      total: domain.total,
      isCanceled: domain.isCanceled,
      voidReason: domain.voidReason,
      syncStatus: domain.syncStatus.name,
      paymentStatus: domain.paymentStatus.name,
      type: domain.type.name,
      customerId: domain.customerId,
      globalTaxOverride: domain.globalTaxOverride,
      relatedInvoiceId: domain.relatedInvoiceId,
    );
  }

  // --- Invoice Item ---
  static InvoiceItem toItemDomain(InvoiceItemEntity entity, {List<Modifier> modifiers = const []}) {
    return InvoiceItem(
      id: entity.id,
      invoiceId: entity.invoiceId,
      productId: entity.productId,
      productName: entity.productName,
      quantity: entity.quantity,
      unitPrice: entity.unitPrice,
      originalTaxRate: entity.originalTaxRate,
      appliedTaxRate: entity.appliedTaxRate,
      taxAmount: entity.taxAmount,
      total: entity.total,
      discount: entity.discount,
      variantId: entity.variantId,
      notes: entity.notes,
      selectedModifiers: modifiers,
    );
  }

  static InvoiceItemEntity toItemEntity(InvoiceItem domain) {
    return InvoiceItemEntity(
      id: domain.id,
      invoiceId: domain.invoiceId,
      productId: domain.productId,
      productName: domain.productName,
      quantity: domain.quantity,
      unitPrice: domain.unitPrice,
      originalTaxRate: domain.originalTaxRate,
      appliedTaxRate: domain.appliedTaxRate,
      taxAmount: domain.taxAmount,
      total: domain.total,
      discount: domain.discount,
      variantId: domain.variantId,
      notes: domain.notes,
    );
  }

  static List<InvoiceItemModifierEntity> toItemModifierEntities(InvoiceItem domain) {
    return domain.selectedModifiers.map((m) => InvoiceItemModifierEntity(
      id: const Uuid().v4(),
      invoiceItemId: domain.id,
      name: m.name,
      extraPrice: m.extraPrice,
    )).toList();
  }

  // --- Payment ---
  static Payment toPaymentDomain(PaymentEntity entity) {
    return Payment(
      id: entity.id,
      invoiceId: entity.invoiceId,
      method: PaymentMethod.values.firstWhere(
        (e) => e.name == entity.method,
        orElse: () => PaymentMethod.cash,
      ),
      amount: entity.amount,
      currency: entity.currency,
      exchangeRate: entity.exchangeRate,
      createdAt: entity.createdAt != null
          ? DateTime.fromMillisecondsSinceEpoch(entity.createdAt!)
          : null,
    );
  }

  static PaymentEntity toPaymentEntity(Payment domain) {
    return PaymentEntity(
      id: domain.id,
      invoiceId: domain.invoiceId,
      method: domain.method.name,
      amount: domain.amount,
      currency: domain.currency,
      exchangeRate: domain.exchangeRate,
      createdAt: domain.createdAt?.millisecondsSinceEpoch,
    );
  }

  static Map<String, dynamic> toSyncJson(
    Invoice invoice,
    List<InvoiceItem> items,
    List<Payment> payments,
  ) {
    return {
      'id': invoice.id,
      'number': invoice.number,
      'createdAt': invoice.createdAt.toIso8601String(),
      'userId': invoice.userId,
      'subtotal': invoice.subtotal,
      'totalTax': invoice.totalTax,
      'total': invoice.total,
      'isCanceled': invoice.isCanceled,
      'voidReason': invoice.voidReason,
      'paymentStatus': invoice.paymentStatus.name,
      'customerId': invoice.customerId,
      'globalTaxOverride': invoice.globalTaxOverride,
      'items': items.map((item) => {
        'id': item.id,
        'productId': item.productId,
        'productName': item.productName,
        'quantity': item.quantity,
        'unitPrice': item.unitPrice,
        'originalTaxRate': item.originalTaxRate,
        'appliedTaxRate': item.appliedTaxRate,
        'taxAmount': item.taxAmount,
        'total': item.total,
        'discount': item.discount,
      }).toList(),
      'payments': payments.map((payment) => {
        'id': payment.id,
        'method': payment.method.name,
        'amount': payment.amount,
        'currency': payment.currency,
        'exchangeRate': payment.exchangeRate,
      }).toList(),
    };
  }
}
