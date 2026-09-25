import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/auth/startup_route_resolver.dart';

/// Verifies the pre-auth routing gate (issue #556): a terminal with a
/// stored tenant slug goes straight to login; an unlinked terminal is
/// gated behind terminal linking BEFORE any login attempt.
void main() {
  group('resolveStartupRoute (issue #556 linking gate)', () {
    test('slug present -> login route (current behavior preserved)', () {
      expect(resolveStartupRoute('soho'), '/');
    });

    test('empty slug -> linking gate route', () {
      expect(resolveStartupRoute(''), '/link');
    });

    test('blank slug -> linking gate route', () {
      expect(resolveStartupRoute('   '), '/link');
    });
  });
}
