/// Route of the pre-auth terminal linking screen (issue #556).
const String linkTerminalRoute = '/link';

/// Startup routing gate for issue #556: the terminal must LINK (capturing
/// its tenant slug) BEFORE any login attempt or login screen use.
///
/// - Stored slug present (already linked) -> login route ('/'), exactly the
///   current behavior; no UX change for linked terminals.
/// - Empty/absent slug -> the linking gate route; login stays unusable
///   until the terminal is linked.
String resolveStartupRoute(String storedTenantSlug) {
  return storedTenantSlug.trim().isEmpty ? linkTerminalRoute : '/';
}

/// The initial navigator stack for startup: EXACTLY ONE route — the resolved
/// gate route.
///
/// Flutter's `defaultGenerateInitialRoutes` roots the stack at '/' whenever
/// the initial route is a named route, which would let Android back
/// navigation pop '/link' and reveal LoginView on an unlinked terminal —
/// bypassing the gate (issue #556). Feeding this list through
/// `MaterialApp.onGenerateInitialRoutes` keeps the gate route un-poppable.
List<String> resolveInitialRouteStack(String initialRouteName) {
  return <String>[initialRouteName];
}
