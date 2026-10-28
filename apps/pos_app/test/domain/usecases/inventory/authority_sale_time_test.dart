import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/inventory/authority_sale_time.dart';

/// The authority keeps `effective_from` in UTC and the checkout path
/// compares in UTC. Every reader must compare in the same frame.
void main() {
  test('the authority is always read in UTC, whatever the local clock says',
      () {
    // A LOCAL instant (no zone marker): the wall clock of the terminal.
    final local = DateTime(2026, 10, 19, 22, 0, 0);
    final saleTime = authoritySaleTime(local);
    expect(saleTime, endsWith('Z'));
    expect(saleTime, local.toUtc().toIso8601String());
  });

  test('a UTC instant is returned unchanged', () {
    expect(
      authoritySaleTime(DateTime.utc(2026, 10, 20, 4)),
      '2026-10-20T04:00:00.000Z',
    );
  });

  test('a version published minutes ago is IN FORCE in the same frame', () {
    // A version published minutes before `now` must always be in force
    // regardless of the runner's or terminal's local timezone.
    final now = DateTime.now();
    final effectiveFrom =
        now.toUtc().subtract(const Duration(minutes: 14)).toIso8601String();
    expect(
      authoritySaleTime(now).compareTo(effectiveFrom) >= 0,
      isTrue,
      reason: 'the version published at $effectiveFrom must be in force',
    );
  });
}
