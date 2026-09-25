import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/usecases/sales/issue_date.dart';

void main() {
  group('localCalendarDate', () {
    test('formats a local moment as ISO YYYY-MM-DD', () {
      expect(
        localCalendarDate(DateTime(2026, 9, 23, 21, 40)),
        '2026-09-23',
      );
      expect(
        localCalendarDate(DateTime(2026, 1, 5, 3, 7)),
        '2026-01-05',
      );
    });
  });

  group('resolveLocalIssueDate', () {
    test('returns the stored value when present', () {
      expect(
        resolveLocalIssueDate(
          localIssueDate: '2026-09-23',
          createdAt: DateTime(2026, 9, 24, 0, 15),
        ),
        '2026-09-23',
      );
    });

    test('derives from createdAt only when the stored value is missing', () {
      // Pre-migration rows carry a null local_issue_date (#526 AC-11 forbids
      // backfilling): derive, never fail.
      expect(
        resolveLocalIssueDate(
          localIssueDate: null,
          createdAt: DateTime(2026, 9, 23, 21, 40),
        ),
        '2026-09-23',
      );
      expect(
        resolveLocalIssueDate(
          localIssueDate: '',
          createdAt: DateTime(2026, 9, 24, 0, 15),
        ),
        '2026-09-24',
      );
    });

    test('stored value governs even when it disagrees with a recompute', () {
      // Device timezone changed after issuance: the same instant now lands
      // on a different local calendar date than the one recorded at
      // issuance. The stored fact wins; recomputing would move the fiscal
      // boundary that decides voidability (D-12).
      final createdAt = DateTime(2026, 9, 24, 0, 15);
      expect(localCalendarDate(createdAt), '2026-09-24');
      expect(
        resolveLocalIssueDate(
          localIssueDate: '2026-09-23',
          createdAt: createdAt,
        ),
        '2026-09-23',
      );
    });
  });

  group('classifyIssueDate', () {
    test('D-12 worked example: issued 23/09 21:40, void at 24/09 00:20',
        () {
      expect(
        classifyIssueDate(
          localIssueDate: '2026-09-23',
          createdAt: DateTime(2026, 9, 23, 21, 40),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        IssueDateComparison.differentDate,
      );
    });

    test('D-12 worked example: issued 24/09 00:15, void at 24/09 00:20',
        () {
      expect(
        classifyIssueDate(
          localIssueDate: '2026-09-24',
          createdAt: DateTime(2026, 9, 24, 0, 15),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        IssueDateComparison.sameDate,
      );
    });

    test('same local calendar date at different times is sameDate', () {
      expect(
        classifyIssueDate(
          localIssueDate: '2026-09-23',
          createdAt: DateTime(2026, 9, 23, 9, 0),
          comparedTo: DateTime(2026, 9, 23, 20, 30),
        ),
        IssueDateComparison.sameDate,
      );
    });

    test('derives the issue date for legacy rows with a null stored value',
        () {
      expect(
        classifyIssueDate(
          localIssueDate: null,
          createdAt: DateTime(2026, 9, 23, 21, 40),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        IssueDateComparison.differentDate,
      );
      expect(
        classifyIssueDate(
          localIssueDate: null,
          createdAt: DateTime(2026, 9, 24, 0, 15),
          comparedTo: DateTime(2026, 9, 24, 0, 20),
        ),
        IssueDateComparison.sameDate,
      );
    });

    test('never returns an unknown-style third state (binary by design)',
        () {
      // Exhaustive: every input lands in exactly one of two states.
      final results = <IssueDateComparison>{
        classifyIssueDate(
          localIssueDate: null,
          createdAt: DateTime(2026, 1, 1),
          comparedTo: DateTime(2026, 1, 1),
        ),
        classifyIssueDate(
          localIssueDate: '2026-01-01',
          createdAt: DateTime(2026, 1, 1),
          comparedTo: DateTime(2026, 2, 1),
        ),
      };
      expect(
        results.difference(IssueDateComparison.values.toSet()),
        isEmpty,
      );
    });
  });
}
