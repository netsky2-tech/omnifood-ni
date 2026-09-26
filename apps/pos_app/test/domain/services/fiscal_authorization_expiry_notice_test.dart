import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/fiscal_authorization_expiry_notice.dart';

void main() {
  group('D-21 (U4 #554): fiscal authorization expiry notice resolution', () {
    final today = DateTime(2026, 6, 15);

    DateTime daysFromToday(int days) =>
        DateTime(today.year, today.month, today.day + days);

    String iso(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    test('the warning lead is the owner-fixed 30-day constant', () {
      // D-21: the lead time is the owner's fixed decision, not configurable.
      expect(fiscalExpiryWarningLeadDays, 30);
    });

    test('absent key resolves to NO notice (absence looks like absence, D-16)',
        () {
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: null, today: today),
        isNull,
      );
    });

    test('blank/whitespace value resolves to NO notice', () {
      expect(
        resolveFiscalAuthorizationExpiryNotice(rawExpiresAt: '', today: today),
        isNull,
      );
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: '   ', today: today),
        isNull,
      );
    });

    test('corrupt value resolves to NO notice — never invents a warning', () {
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: 'not-a-date', today: today),
        isNull,
      );
      // Wrong shape (dd/mm/yyyy), even if a real date.
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: '15/06/2026', today: today),
        isNull,
      );
      // Impossible calendar date.
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: '2026-02-30', today: today),
        isNull,
      );
    });

    test('more than 30 days out resolves to NO notice', () {
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: iso(daysFromToday(31)), today: today),
        isNull,
      );
      expect(
        resolveFiscalAuthorizationExpiryNotice(
            rawExpiresAt: iso(daysFromToday(365)), today: today),
        isNull,
      );
    });

    test('exactly 30 days out shows the amber notice with correct text', () {
      final expiry = daysFromToday(30);
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(expiry), today: today);

      expect(notice, isNotNull);
      expect(notice!.level,
          FiscalAuthorizationExpiryNoticeLevel.upcoming);
      expect(
        notice.message,
        'Su código de autorización DGI vence el ${iso(expiry)} (en 30 días).',
      );
    });

    test('1 day out uses singular wording', () {
      final expiry = daysFromToday(1);
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(expiry), today: today);

      expect(notice, isNotNull);
      expect(notice!.level,
          FiscalAuthorizationExpiryNoticeLevel.upcoming);
      expect(
        notice.message,
        'Su código de autorización DGI vence el ${iso(expiry)} (en 1 día).',
      );
    });

    test('several days out uses plural wording', () {
      final expiry = daysFromToday(7);
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(expiry), today: today);

      expect(
        notice!.message,
        'Su código de autorización DGI vence el ${iso(expiry)} (en 7 días).',
      );
    });

    test('today is expiry day (0 days) shows the venció notice', () {
      final expiry = daysFromToday(0);
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(expiry), today: today);

      expect(notice, isNotNull);
      expect(notice!.level, FiscalAuthorizationExpiryNoticeLevel.expired);
      expect(
        notice.message,
        'Su código de autorización DGI venció el ${iso(expiry)}.',
      );
    });

    test('past expiry (negative days) shows the venció notice', () {
      final expiry = daysFromToday(-12);
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(expiry), today: today);

      expect(notice, isNotNull);
      expect(notice!.level, FiscalAuthorizationExpiryNoticeLevel.expired);
      expect(
        notice.message,
        'Su código de autorización DGI venció el ${iso(expiry)}.',
      );
    });

    test('the notice is informational only — it carries no blocking flag', () {
      // D-21/U4: the warning must NEVER block issuance. The model exposes
      // no way to express a block.
      final notice = resolveFiscalAuthorizationExpiryNotice(
          rawExpiresAt: iso(daysFromToday(-5)), today: today);
      expect(notice, isNotNull);
      expect(notice, isA<FiscalAuthorizationExpiryNotice>());
    });
  });
}
