import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/ui/features/cash/widgets/close_shift_dialog.dart';

/// R2-004 (native review, slice F5) + verification warning 2: the Corte Z
/// block offers two exits ("cobrar o abandonar") without repeating that
/// abandoning is irreversible. That consequence lived only in the abandon
/// confirmation, three screens after the decision. The block message must
/// name the consequence at the moment of decision.
void main() {
  HoldTicket account(String name, {int lines = 2}) => HoldTicket(
        id: 'hold-$name',
        name: name,
        createdAt: DateTime(2026, 2, 1),
        items: List.generate(
          lines,
          (i) => CartItem(
            productId: 'p-$i',
            productName: 'Producto $i',
            quantity: 1,
            unitPrice: 220.0,
            taxRate: 0.15,
          ),
        ),
      );

  test('the block message warns that abandoning an account is definitive', () {
    final message = openAccountsBlockMessage([account('Mesa 3')]);

    expect(message, contains('abandónela'));
    expect(message, contains('Abandonar la descarta definitivamente'));
    expect(message, contains('no se puede deshacer'));
  });

  test('the block message still names every account with its line count', () {
    final message = openAccountsBlockMessage([
      account('Mesa 3'),
      account('Sin mesa (Para llevar)', lines: 1),
    ]);

    expect(message, contains('Mesa 3'));
    expect(message, contains('Sin mesa (Para llevar)'));
    expect(message, contains('2 líneas'));
    expect(message, contains('1 línea'));
  });
}
