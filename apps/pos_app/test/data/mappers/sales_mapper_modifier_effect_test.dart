import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/sales/invoice_item_modifier_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';

/// R28 — the modifier option's IDENTITY and its INVENTORY EFFECT reach the
/// sale, and the option that declares no effect keeps the EXACT wire shape
/// it had before R28.
///
/// Before R28 the line carried only `{name, extraPrice, quantity}` and the
/// mapper wrote a FRESH UUID as the row's id, so neither the terminal nor
/// the cloud could tell WHICH option was sold, and the deviation from the
/// recipe was invisible. The compatibility guarantee matters as much as the
/// new data: a line whose option is price-only (or comes from the legacy
/// local modifiers) must produce the same bytes it produced before, because
/// the backend's payload hash is what makes a replayed receipt idempotent.
void main() {
  final invoice = Invoice(
    id: 'inv-1',
    number: 'F-1',
    createdAt: DateTime.parse('2026-07-13T10:00:00Z'),
    userId: 'cashier-1',
    subtotal: 80,
    totalTax: 10.5,
    total: 90.5,
    syncStatus: SyncStatus.pending,
    type: InvoiceType.regular,
  );

  final invoiceItem = InvoiceItem(
    id: 'line-1',
    invoiceId: 'inv-1',
    productId: 'prod-1',
    productName: 'Capuccino',
    quantity: 1,
    unitPrice: 70,
    taxAmount: 10.5,
    total: 80.5,
    originalTaxRate: 15,
    appliedTaxRate: 15,
    selectedModifiers: const [
      Modifier(
        id: 'opt-almendras',
        name: 'Leche: Almendras',
        extraPrice: 10,
        optionId: 'opt-almendras',
        groupId: 'grp-leche',
        inventoryEffect: 'SWAP',
        effectTargetInsumoId: 'ins-leche-entera',
        effectInsumoId: 'ins-leche-almendras',
      ),
    ],
  );

  group('el cable de la venta (R28)', () {
    test('lleva la identidad de la opción y su efecto', () {
      final payload = SalesMapper.toSyncJson(
        invoice,
        [invoiceItem],
        const [],
      );
      final modifiers =
          (payload['items'] as List).first['modifiers'] as List;

      expect(modifiers, hasLength(1));
      final modifier = modifiers.first as Map<String, dynamic>;
      expect(modifier['optionId'], 'opt-almendras');
      expect(modifier['groupId'], 'grp-leche');
      expect(modifier['inventoryEffect'], 'SWAP');
      expect(modifier['effectTargetInsumoId'], 'ins-leche-entera');
      expect(modifier['effectInsumoId'], 'ins-leche-almendras');
      // No explicit quantity: the resolution INHERITS the recipe's own.
      expect(modifier.containsKey('effectQuantity'), isFalse);
    });

    test('una opción SIN efecto conserva EXACTAMENTE la forma previa', () {
      final priceOnly = InvoiceItem(
        id: 'line-2',
        invoiceId: 'inv-1',
        productId: 'prod-2',
        productName: 'Café',
        quantity: 1,
        unitPrice: 40,
        taxAmount: 6,
        total: 46,
        originalTaxRate: 15,
        appliedTaxRate: 15,
        selectedModifiers: const [
          Modifier(
            id: 'opt-legacy',
            name: 'Extra shot',
            extraPrice: 15,
          ),
        ],
      );

      final payload = SalesMapper.toSyncJson(
        invoice,
        [priceOnly],
        const [],
      );
      final modifier =
          ((payload['items'] as List).first['modifiers'] as List).first
              as Map<String, dynamic>;

      // The three keys the wire had before R28 — and NOTHING else, because
      // the backend's payload hash is what makes a replayed receipt
      // idempotent (D-10: a changed hash answers IDEMPOTENCY_MISMATCH and
      // the fiscal document never reaches the cloud).
      expect(modifier.keys.toSet(), {'name', 'extraPrice', 'quantity'});
      expect(modifier['name'], 'Extra shot');
      expect(modifier['extraPrice'], 15.0);
      expect(modifier['quantity'], 1);
    });
  });

  group('la persistencia local (R28)', () {
    test('conserva la identidad de la opción en vez de un UUID nuevo', () {
      final rows = SalesMapper.toItemModifierEntities(invoiceItem);

      expect(rows, hasLength(1));
      final row = rows.first;
      // The row's own key is still a local UUID, but the CATALOGUE option
      // id travels in its own column.
      expect(row.id, isNot('opt-almendras'));
      expect(row.optionId, 'opt-almendras');
      expect(row.groupId, 'grp-leche');
      expect(row.inventoryEffect, 'SWAP');
      expect(row.effectInsumoId, 'ins-leche-almendras');
      expect(row.effectTargetInsumoId, 'ins-leche-entera');
    });

    test('una opción sin efecto se persiste sin desviación', () {
      final priceOnly = InvoiceItem(
        id: 'line-3',
        invoiceId: 'inv-1',
        productId: 'prod-2',
        productName: 'Café',
        quantity: 1,
        unitPrice: 40,
        taxAmount: 6,
        total: 46,
        originalTaxRate: 15,
        appliedTaxRate: 15,
        selectedModifiers: const [
          Modifier(id: 'opt-legacy', name: 'Extra shot', extraPrice: 15),
        ],
      );

      final row = SalesMapper.toItemModifierEntities(priceOnly).first;
      // The legacy local modifiers have no catalogue identity and no
      // effect: that is recorded as ABSENT, never invented.
      expect(row.optionId, isNull);
      expect(row.groupId, isNull);
      expect(row.inventoryEffect, isNull);
    });

    test('la fila se relee con la identidad y el efecto', () {
      final row = SalesMapper.toItemModifierEntities(invoiceItem).first;
      final domain = SalesMapper.toModifierDomain(row);

      expect(domain.optionId, 'opt-almendras');
      expect(domain.groupId, 'grp-leche');
      expect(domain.inventoryEffect, 'SWAP');
      expect(domain.hasInventoryEffect, isTrue);
    });
  
  // ME-04: the TRUTH of the effect travels with the line, so a sold extra
  // whose effect never touched the stock is reconcilable in the cloud.
  });

  group('ME-04: la verdad del efecto viaja con la línea', () {
    Modifier modifierWithTruth({
      String? status,
      String? reason,
      String? source,
      String? authorizedBy,
      String? method,
      String? why,
    }) {
      return Modifier(
        id: 'opt-almendras',
        name: 'Leche: Almendras',
        extraPrice: 10,
        optionId: 'opt-almendras',
        groupId: 'grp-leche',
        inventoryEffect: 'SWAP',
        effectTargetInsumoId: 'ins-leche-entera',
        effectInsumoId: 'ins-leche-almendras',
        effectStatus: status,
        effectSkipReason: reason,
        effectQuantitySource: source,
        effectAuthorizedBy: authorizedBy,
        effectAuthorizationMethod: method,
        effectAuthorizationReason: why,
      );
    }

    InvoiceItem itemWith(Modifier modifier) => InvoiceItem(
          id: 'line-1',
          invoiceId: 'inv-1',
          productId: 'prod-1',
          productName: 'Capuccino',
          quantity: 1,
          unitPrice: 70,
          taxAmount: 10.5,
          total: 80.5,
          originalTaxRate: 15,
          appliedTaxRate: 15,
          selectedModifiers: [modifier],
        );

    test('lleva el estado, el motivo, el origen y la autorización', () {
      final payload = SalesMapper.toSyncJson(
        invoice,
        [
          itemWith(
            modifierWithTruth(
              status: 'PENDING',
              reason: 'INSUMSO_NOT_IN_CATALOG',
              source: 'DECLARED',
              authorizedBy: 'sup-1',
              method: 'PIN',
              why: 'el insumo no está registrado',
            ),
          ),
        ],
        const [],
      );
      final modifier =
          ((payload['items'] as List).first['modifiers'] as List).first
              as Map<String, dynamic>;

      expect(modifier['effectStatus'], 'PENDING');
      expect(modifier['effectSkipReason'], 'INSUMSO_NOT_IN_CATALOG');
      expect(modifier['effectQuantitySource'], 'DECLARED');
      expect(modifier['effectAuthorizedBy'], 'sup-1');
      expect(modifier['effectAuthorizationMethod'], 'PIN');
      expect(modifier['effectAuthorizationReason'], 'el insumo no está registrado');
    });

    test('una línea sin efecto conserva EXACTAMENTE la forma del cable de antes', () {
      final payload = SalesMapper.toSyncJson(
        invoice,
        [itemWith(modifierWithTruth())],
        const [],
      );
      final modifier =
          ((payload['items'] as List).first['modifiers'] as List).first
              as Map<String, dynamic>;

      // Los campos nuevos sólo viajan cuando existen: una línea vieja (o de
      // precio sin efecto) no puede cambiar de bytes, porque el hash de
      //冲突 del backoffice los cubre.
      expect(modifier.containsKey('effectStatus'), isFalse);
      expect(modifier.containsKey('effectSkipReason'), isFalse);
      expect(modifier.containsKey('effectQuantitySource'), isFalse);
      expect(modifier.containsKey('effectAuthorizedBy'), isFalse);
    });

    test('la fila local guarda y devuelve la verdad (ida y vuelta)', () {
      final rows = SalesMapper.toItemModifierEntities(
        itemWith(
          modifierWithTruth(
            status: 'PENDING',
            reason: 'UNIT_MISMATCH',
            source: 'OVERRIDE',
          ),
        ),
      );

      expect(rows.single.effectStatus, 'PENDING');
      expect(rows.single.effectSkipReason, 'UNIT_MISMATCH');
      expect(rows.single.effectQuantitySource, 'OVERRIDE');

      final back = SalesMapper.toModifierDomain(rows.single);
      expect(back.effectStatus, 'PENDING');
      expect(back.effectSkipReason, 'UNIT_MISMATCH');
      expect(back.effectQuantitySource, 'OVERRIDE');
    });
  });
}