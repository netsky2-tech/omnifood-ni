import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/ui/features/identity/audit/audit_log_view_model.dart';

class _FakeAuditRepository implements AuditRepository {
  final List<AuditLog> testLogs;

  _FakeAuditRepository(this.testLogs);

  @override
  Future<List<AuditLog>> getLocalLogs({DateTime? start, DateTime? end, String? userId}) async {
    return testLogs;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

AuditLog _log({
  required int id,
  required String action,
  required String userId,
  required String deviceId,
}) {
  return AuditLog(
    id: id,
    sequenceNo: id,
    prevHash: id == 1 ? 'GENESIS' : 'hash-${id - 1}',
    entryHash: 'hash-$id',
    action: action,
    userId: userId,
    deviceId: deviceId,
    timestamp: DateTime(2026, 8, 27, 10, id),
    metadata: '{"invoice_id": "inv-$id"}',
  );
}

void main() {
  group('AuditLogViewModel search matches what the UI displays', () {
    final sampleLogs = [
      _log(id: 1, action: 'SALE_CREATED', userId: 'cajero_01', deviceId: 'SUNMI-V2S-01'),
      _log(id: 2, action: 'INVOICE_VOIDED', userId: 'supervisor_01', deviceId: 'SUNMI-V2S-01'),
      _log(id: 3, action: 'USER_LOGIN', userId: 'cajero_02', deviceId: 'POS-DESKTOP-01'),
    ];

    test('searching the Spanish label finds the entry', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      viewModel.setSearchQuery('Venta registrada');
      expect(viewModel.filteredLogs.map((l) => l.id), [1]);
    });

    test('searching the raw machine code still finds the entry', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      viewModel.setSearchQuery('SALE_CREATED');
      expect(viewModel.filteredLogs.map((l) => l.id), [1]);
    });

    test('labeled entry is never double-counted by the raw-code match', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      viewModel.setSearchQuery('SALE');
      expect(viewModel.filteredLogs.map((l) => l.id), [1]);
    });

    test('unknown code (no label) is still findable by its raw code', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      // INVOICE_VOIDED has no label in kAuditLedgerActionLabels: localize
      // passes it through, so the raw code must remain searchable.
      viewModel.setSearchQuery('INVOICE_VOIDED');
      expect(viewModel.filteredLogs.map((l) => l.id), [2]);
      // And exactly once: label match and raw match must not stack rows.
      expect(viewModel.filteredLogs.length, 1);
    });

    test('user and device matching still work', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      viewModel.setSearchQuery('cajero_02');
      expect(viewModel.filteredLogs.map((l) => l.id), [3]);

      viewModel.setSearchQuery('SUNMI-V2S-01');
      expect(viewModel.filteredLogs.map((l) => l.id).toSet(), {1, 2});
    });

    test('category chips keep gating on the raw action code', () async {
      final viewModel = AuditLogViewModel(_FakeAuditRepository(sampleLogs));
      await viewModel.loadLogs();

      viewModel.setActionCategory('SALE');
      expect(viewModel.filteredLogs.map((l) => l.id), [1]);

      // Category (raw code) and label search combine as AND: the SALE
      // category plus the label search both hit the same entry...
      viewModel.setSearchQuery('Venta registrada');
      expect(viewModel.filteredLogs.map((l) => l.id), [1]);

      // ...while a non-matching category excludes it.
      viewModel.setActionCategory('VOID');
      expect(viewModel.filteredLogs, isEmpty);
    });
  });
}
