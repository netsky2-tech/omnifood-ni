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

  group('resolveInitialRouteStack (issue #556 back-navigation gate bypass)', () {
    test("'/link' generates a single-route stack with NO '/' beneath it", () {
      // Flutter's defaultGenerateInitialRoutes roots the stack at '/', which
      // lets Android back pop '/link' and reveal LoginView on an unlinked
      // terminal. The gate stack must contain exactly ['/link'].
      final stack = resolveInitialRouteStack('/link');

      expect(stack, ['/link']);
      expect(stack.contains('/'), isFalse,
          reason: "back navigation from '/link' must never reveal '/'");
    });

    test("'/' generates a single-route stack ['/' ]", () {
      expect(resolveInitialRouteStack('/'), ['/']);
    });
  });
}
