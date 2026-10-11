import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view.dart';

/// Round-2 F-4c: the audit detail showed the raw machine code twice and a
/// bare invoice UUID the operator could not act on. The primary rows now
/// humanise the codes and drop the identifier (it stays in `Ver crudo`).
void main() {
  group('auditMetadataPrimaryEntries (round-2 F-4c)', () {
    test('drops the invoice id, keeping the reason rows', () {
      final entries = auditMetadataPrimaryEntries(
        jsonEncode({
          'invoice_id': '425b7b1b-fbd7-40b7-baee-1444f06a3bc9',
          'reason': 'CLIENTE_DESISTE',
          'reason_code': 'CLIENTE_DESISTE',
        }),
      );

      expect(entries, isNotNull);
      final keys = entries!.map((entry) => entry.key).toList();
      expect(
        keys,
        isNot(contains('invoice_id')),
        reason: 'a bare uuid told the operator nothing; the collapsed raw '
            'JSON keeps it as forensic evidence',
      );
      expect(keys, containsAll(<String>['reason', 'reason_code']));
    });

    test('humanises the reason values instead of repeating the raw code', () {
      final entries = auditMetadataPrimaryEntries(
        jsonEncode({
          'reason': 'CLIENTE_DESISTE',
          'reason_code': 'TICKET_DUPLICADO',
        }),
      )!;
      final values = {for (final entry in entries) entry.key: entry.value};

      expect(values['reason'], 'Cliente desiste');
      expect(values['reason_code'], 'Ticket duplicado');
      expect(values.values, isNot(contains('CLIENTE_DESISTE')));
    });

    test('a reprint reason code is humanised from its own controlled list', () {
      expect(
        humanizeAuditMetadataValue('reason_code', 'PAPEL_ATASCADO'),
        'Papel atascado',
      );
    });

    test('an unknown code or a plain value passes through unchanged', () {
      expect(humanizeAuditMetadataValue('reason', 'ALGO_NUEVO'), 'ALGO_NUEVO');
      expect(
        humanizeAuditMetadataValue('number', '001-001-01-00000041'),
        '001-001-01-00000041',
      );
    });

    test('a non-JSON payload degrades to null so the caller shows it verbatim',
        () {
      expect(auditMetadataPrimaryEntries('not json at all'), isNull);
      expect(auditMetadataPrimaryEntries(null), isNull);
      expect(auditMetadataPrimaryEntries(''), isNull);
    });
  });
}
